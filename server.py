import os
import json
import asyncio
import secrets
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.sessions import SessionMiddleware
import uvicorn


WEB_ROOT = Path(__file__).parent.resolve()
STATE_FILE = WEB_ROOT / "dashboard_state.json"
DISCORD_API_BASE = "https://discord.com/api/v10"

DEFAULT_COGS = [
    "admin",
    "ai",
    "events",
    "help",
    "levels",
    "mail",
    "meme",
    "mod",
    "rolepanel",
    "setup",
    "stats",
    "ticket",
]


class GuildSettings(BaseModel):
    guild_id: str = "1476329967674724494"
    guild_name: str = "Luma Community"
    language: str = "pt"
    log_channel: str = "#moderation-log"


class ModerationSettings(BaseModel):
    enabled: bool = True
    smart_antiflood: bool = True
    warning_limit: int = Field(default=3, ge=1, le=20)
    default_action: str = Field(default="kick", pattern="^(kick|ban|mute)$")
    modmail_enabled: bool = True
    tickets_enabled: bool = True


class DashboardState(BaseModel):
    guild: GuildSettings
    moderation: ModerationSettings
    cogs: dict[str, bool]


class GuildUpdatePayload(BaseModel):
    guild_name: str
    language: str = Field(pattern="^(pt|en|es)$")
    log_channel: str


class ModerationUpdatePayload(BaseModel):
    enabled: bool
    smart_antiflood: bool
    warning_limit: int = Field(ge=1, le=20)
    default_action: str = Field(pattern="^(kick|ban|mute)$")
    modmail_enabled: bool
    tickets_enabled: bool


class CogBulkUpdatePayload(BaseModel):
    cogs: dict[str, bool]


class CogTogglePayload(BaseModel):
    enabled: bool


state_lock = threading.Lock()


def _oauth_config() -> dict[str, str]:
    config = {
        "client_id": os.getenv("DISCORD_CLIENT_ID", "").strip(),
        "client_secret": os.getenv("DISCORD_CLIENT_SECRET", "").strip(),
        "redirect_uri": os.getenv("DISCORD_REDIRECT_URI", "").strip(),
    }

    missing = [name for name, value in config.items() if not value]
    if missing:
        raise HTTPException(
            status_code=503,
            detail=f"Missing OAuth configuration: {', '.join(missing)}",
        )
    return config


def _is_authenticated(request: Request) -> bool:
    user = request.session.get("user")
    return isinstance(user, dict) and bool(user.get("id"))


def _require_auth(request: Request) -> None:
    if not _is_authenticated(request):
        raise HTTPException(status_code=401, detail="Authentication required")


def _discord_request(url: str, *, method: str, headers: dict[str, str], data: dict[str, str] | None = None) -> dict[str, Any]:
    encoded_data = None
    if data is not None:
        encoded_data = urllib.parse.urlencode(data).encode("utf-8")

    req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=20) as response:
        payload = response.read().decode("utf-8")
        return json.loads(payload)


async def _fetch_discord_token(code: str, config: dict[str, str]) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(
            _discord_request,
            f"{DISCORD_API_BASE}/oauth2/token",
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "client_id": config["client_id"],
                "client_secret": config["client_secret"],
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": config["redirect_uri"],
            },
        )
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=400, detail=f"Discord token exchange failed: {detail[:400]}") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail="Discord token exchange unavailable") from exc


async def _fetch_discord_user(access_token: str) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(
            _discord_request,
            f"{DISCORD_API_BASE}/users/@me",
            method="GET",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=400, detail=f"Discord user fetch failed: {detail[:400]}") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail="Discord user fetch unavailable") from exc


def _read_available_cogs() -> list[str]:
    cogs_path = os.getenv("LUMA_COGS_PATH")
    if cogs_path:
        candidate = Path(cogs_path).resolve()
    else:
        candidate = (WEB_ROOT.parent / "Luma" / "cogs").resolve()

    if candidate.exists() and candidate.is_dir():
        names = sorted(
            file.stem
            for file in candidate.glob("*.py")
            if file.name != "__init__.py"
        )
        if names:
            return names

    return list(DEFAULT_COGS)


def _default_state() -> dict[str, Any]:
    return {
        "guild": GuildSettings().model_dump(),
        "moderation": ModerationSettings().model_dump(),
        "cogs": {name: True for name in _read_available_cogs()},
    }


def _load_state() -> dict[str, Any]:
    if not STATE_FILE.exists():
        state = _default_state()
        _save_state(state)
        return state

    try:
        with STATE_FILE.open("r", encoding="utf-8") as f:
            raw = json.load(f)
    except (json.JSONDecodeError, OSError):
        raw = _default_state()

    normalized = _default_state()
    normalized["guild"].update(raw.get("guild", {}))
    normalized["moderation"].update(raw.get("moderation", {}))

    available_cogs = _read_available_cogs()
    loaded_cogs = raw.get("cogs", {})
    normalized["cogs"] = {name: bool(loaded_cogs.get(name, True)) for name in available_cogs}
    _save_state(normalized)
    return normalized


def _save_state(state: dict[str, Any]) -> None:
    with STATE_FILE.open("w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def _state_with_metrics(state: dict[str, Any]) -> dict[str, Any]:
    enabled_cogs = sum(1 for enabled in state["cogs"].values() if enabled)
    total_cogs = len(state["cogs"]) if state["cogs"] else 1

    metrics = {
        "warnings_24h": 8 if state["moderation"]["enabled"] else 0,
        "open_tickets": 4 if state["moderation"]["tickets_enabled"] else 0,
        "modmail_threads": 3 if state["moderation"]["modmail_enabled"] else 0,
        "cogs_enabled": f"{enabled_cogs}/{total_cogs}",
    }
    return {**state, "metrics": metrics, "available_cogs": _read_available_cogs()}

app = FastAPI(title="Luma Site")
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET", "dev-insecure-session-secret-change-me"),
    same_site="lax",
    https_only=False,
)
app.mount("/assets", StaticFiles(directory=str(WEB_ROOT / "assets")), name="assets")


def _safe_file_path(raw_path: str) -> Path | None:
    candidate = (WEB_ROOT / raw_path.lstrip("/")).resolve()
    if not str(candidate).startswith(str(WEB_ROOT)):
        return None
    return candidate


@app.get("/health", response_class=PlainTextResponse)
async def health() -> str:
    return "ok"


@app.get("/")
async def home() -> FileResponse:
    return FileResponse(WEB_ROOT / "index.html")


@app.get("/auth/login")
async def auth_login(request: Request, next_path: str = Query(default="/dashboard", alias="next")) -> RedirectResponse:
    config = _oauth_config()

    state = secrets.token_urlsafe(24)
    request.session["oauth_state"] = state
    request.session["post_login_redirect"] = next_path if next_path.startswith("/") else "/dashboard"

    params = urllib.parse.urlencode(
        {
            "client_id": config["client_id"],
            "redirect_uri": config["redirect_uri"],
            "response_type": "code",
            "scope": "identify guilds",
            "state": state,
            "prompt": "consent",
        }
    )
    return RedirectResponse(url=f"https://discord.com/oauth2/authorize?{params}", status_code=302)


@app.get("/auth/callback")
async def auth_callback(request: Request, code: str = "", state: str = "") -> RedirectResponse:
    config = _oauth_config()

    if not code:
        raise HTTPException(status_code=400, detail="Missing OAuth code")

    stored_state = request.session.pop("oauth_state", "")
    if not stored_state or state != stored_state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    token_data = await _fetch_discord_token(code, config)
    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="OAuth response did not return access token")

    user = await _fetch_discord_user(access_token)
    request.session["user"] = {
        "id": user.get("id"),
        "username": user.get("username"),
        "global_name": user.get("global_name"),
        "avatar": user.get("avatar"),
        "discriminator": user.get("discriminator"),
    }

    destination = request.session.pop("post_login_redirect", "/dashboard")
    if not isinstance(destination, str) or not destination.startswith("/"):
        destination = "/dashboard"
    return RedirectResponse(url=destination, status_code=302)


@app.get("/auth/logout")
async def auth_logout(request: Request) -> RedirectResponse:
    request.session.clear()
    return RedirectResponse(url="/", status_code=302)


@app.get("/api/auth/session")
async def auth_session(request: Request) -> dict[str, Any]:
    user = request.session.get("user")
    return {
        "authenticated": _is_authenticated(request),
        "user": user if isinstance(user, dict) else None,
    }


@app.get("/dashboard")
@app.get("/dashboard.html")
async def dashboard(request: Request) -> Response:
    if not _is_authenticated(request):
        return RedirectResponse(url="/auth/login?next=/dashboard", status_code=302)
    return FileResponse(WEB_ROOT / "dashboard.html")


@app.get("/api/dashboard/state")
async def dashboard_state(request: Request) -> dict[str, Any]:
    _require_auth(request)
    with state_lock:
        state = _load_state()
    return _state_with_metrics(state)


@app.put("/api/dashboard/guild")
async def update_guild_settings(payload: GuildUpdatePayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    with state_lock:
        state = _load_state()
        state["guild"].update(payload.model_dump())
        _save_state(state)
    return {"ok": True, "state": _state_with_metrics(state)}


@app.put("/api/dashboard/moderation")
async def update_moderation_settings(payload: ModerationUpdatePayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    with state_lock:
        state = _load_state()
        state["moderation"].update(payload.model_dump())
        _save_state(state)
    return {"ok": True, "state": _state_with_metrics(state)}


@app.put("/api/dashboard/cogs")
async def bulk_update_cogs(payload: CogBulkUpdatePayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    with state_lock:
        state = _load_state()
        allowed = set(state["cogs"].keys())
        for cog_name, enabled in payload.cogs.items():
            if cog_name in allowed:
                state["cogs"][cog_name] = bool(enabled)
        _save_state(state)
    return {"ok": True, "state": _state_with_metrics(state)}


@app.patch("/api/dashboard/cogs/{cog_name}")
async def toggle_cog(cog_name: str, payload: CogTogglePayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    with state_lock:
        state = _load_state()
        if cog_name not in state["cogs"]:
            raise HTTPException(status_code=404, detail="Cog not found")
        state["cogs"][cog_name] = payload.enabled
        _save_state(state)
    return {"ok": True, "state": _state_with_metrics(state)}


@app.post("/api/dashboard/reset")
async def reset_dashboard_state(request: Request) -> dict[str, Any]:
    _require_auth(request)
    with state_lock:
        state = _default_state()
        _save_state(state)
    return {"ok": True, "state": _state_with_metrics(state)}


@app.exception_handler(401)
async def auth_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.get("/{path:path}")
async def static_or_spa(path: str) -> FileResponse:
    safe_path = _safe_file_path(path)
    if safe_path and safe_path.exists() and safe_path.is_file():
        return FileResponse(safe_path)

    if "." not in Path(path).name:
        return FileResponse(WEB_ROOT / "index.html")

    raise HTTPException(status_code=404, detail="Not found")


def main() -> None:
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run("server:app", host="0.0.0.0", port=port, log_level="info")


if __name__ == "__main__":
    main()