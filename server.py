import asyncio
import json
import os
import secrets
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.sessions import SessionMiddleware


WEB_ROOT = Path(__file__).parent.resolve()
STATE_FILE = WEB_ROOT / "dashboard_state.json"
DISCORD_API_BASE = "https://discord.com/api/v10"
DISCORD_OAUTH_BASE = "https://discord.com/api"
HTTP_USER_AGENT = "LumaDashboard/1.0 (+https://github.com/RaulLeite2/lumawebsite)"

PERM_ADMINISTRATOR = 0x8
PERM_MANAGE_GUILD = 0x20

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


class ActiveGuildPayload(BaseModel):
    guild_id: str


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


def _session_guilds(request: Request) -> list[dict[str, Any]]:
    guilds = request.session.get("guilds")
    if isinstance(guilds, list):
        return [g for g in guilds if isinstance(g, dict) and g.get("id")]
    return []


def _active_guild_from_session(request: Request) -> dict[str, Any] | None:
    guilds = _session_guilds(request)
    if not guilds:
        return None

    selected_id = request.session.get("active_guild_id")
    for guild in guilds:
        if guild.get("id") == selected_id:
            return guild

    request.session["active_guild_id"] = guilds[0].get("id")
    return guilds[0]


def _require_active_guild(request: Request) -> dict[str, Any]:
    guild = _active_guild_from_session(request)
    if guild is None:
        raise HTTPException(status_code=400, detail="No manageable guild found for this account")
    return guild


def _discord_request(url: str, *, method: str, headers: dict[str, str], data: dict[str, str] | None = None) -> dict[str, Any]:
    encoded_data = None
    if data is not None:
        encoded_data = urllib.parse.urlencode(data).encode("utf-8")

    merged_headers = {
        "Accept": "application/json",
        "User-Agent": HTTP_USER_AGENT,
        **headers,
    }
    req = urllib.request.Request(url, data=encoded_data, headers=merged_headers, method=method)
    with urllib.request.urlopen(req, timeout=20) as response:
        payload = response.read().decode("utf-8")
        return json.loads(payload)


async def _fetch_discord_token(code: str, config: dict[str, str]) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(
            _discord_request,
            f"{DISCORD_OAUTH_BASE}/oauth2/token",
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


def _has_dashboard_permission(raw_permissions: str, owner: bool) -> bool:
    if owner:
        return True
    try:
        bits = int(raw_permissions)
    except (TypeError, ValueError):
        return False
    return (bits & PERM_ADMINISTRATOR) != 0 or (bits & PERM_MANAGE_GUILD) != 0


async def _fetch_discord_guilds(access_token: str) -> list[dict[str, Any]]:
    try:
        response = await asyncio.to_thread(
            _discord_request,
            f"{DISCORD_API_BASE}/users/@me/guilds",
            method="GET",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=400, detail=f"Discord guild fetch failed: {detail[:400]}") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail="Discord guild fetch unavailable") from exc

    if not isinstance(response, list):
        return []

    manageable: list[dict[str, Any]] = []
    for guild in response:
        if not isinstance(guild, dict):
            continue
        owner = bool(guild.get("owner"))
        if not _has_dashboard_permission(str(guild.get("permissions", "0")), owner):
            continue
        manageable.append(
            {
                "id": str(guild.get("id", "")),
                "name": str(guild.get("name", "Unknown Guild")),
                "icon": guild.get("icon"),
                "owner": owner,
                "permissions": str(guild.get("permissions", "0")),
            }
        )

    return [g for g in manageable if g.get("id")]


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


def _normalize_guild_state(raw_state: dict[str, Any], guild_id: str, guild_name: str) -> dict[str, Any]:
    normalized = _default_state()
    normalized["guild"].update(raw_state.get("guild", {}))
    normalized["moderation"].update(raw_state.get("moderation", {}))

    normalized["guild"]["guild_id"] = guild_id
    if not normalized["guild"].get("guild_name"):
        normalized["guild"]["guild_name"] = guild_name

    available_cogs = _read_available_cogs()
    loaded_cogs = raw_state.get("cogs", {})
    normalized["cogs"] = {name: bool(loaded_cogs.get(name, True)) for name in available_cogs}
    return normalized


def _load_state_container() -> dict[str, Any]:
    if not STATE_FILE.exists():
        container = {"guild_states": {}}
        _save_state(container)
        return container

    try:
        with STATE_FILE.open("r", encoding="utf-8") as f:
            raw = json.load(f)
    except (json.JSONDecodeError, OSError):
        raw = {"guild_states": {}}

    container = {"guild_states": {}}
    if isinstance(raw, dict) and "guild_states" in raw and isinstance(raw.get("guild_states"), dict):
        for gid, state in raw["guild_states"].items():
            if not isinstance(gid, str) or not isinstance(state, dict):
                continue
            default_name = str(state.get("guild", {}).get("guild_name", f"Guild {gid}"))
            container["guild_states"][gid] = _normalize_guild_state(state, gid, default_name)
    elif isinstance(raw, dict) and raw.get("guild"):
        # Legacy one-guild state migration.
        gid = str(raw.get("guild", {}).get("guild_id", GuildSettings().guild_id))
        gname = str(raw.get("guild", {}).get("guild_name", GuildSettings().guild_name))
        container["guild_states"][gid] = _normalize_guild_state(raw, gid, gname)

    _save_state(container)
    return container


def _load_state_for_guild(guild_id: str, guild_name: str) -> tuple[dict[str, Any], dict[str, Any]]:
    container = _load_state_container()
    guild_states = container.setdefault("guild_states", {})

    state = guild_states.get(guild_id)
    if not isinstance(state, dict):
        state = _normalize_guild_state({}, guild_id, guild_name)
        guild_states[guild_id] = state
    else:
        state = _normalize_guild_state(state, guild_id, guild_name)
        guild_states[guild_id] = state

    return container, state


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
    guilds = await _fetch_discord_guilds(access_token)

    request.session["user"] = {
        "id": user.get("id"),
        "username": user.get("username"),
        "global_name": user.get("global_name"),
        "avatar": user.get("avatar"),
        "discriminator": user.get("discriminator"),
    }
    request.session["guilds"] = guilds
    request.session["active_guild_id"] = guilds[0]["id"] if guilds else None

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
    active_guild = _active_guild_from_session(request)
    return {
        "authenticated": _is_authenticated(request),
        "user": user if isinstance(user, dict) else None,
        "guilds": _session_guilds(request),
        "active_guild_id": active_guild.get("id") if active_guild else None,
    }


@app.put("/api/dashboard/active-guild")
async def set_active_guild(payload: ActiveGuildPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    guilds = _session_guilds(request)
    if not any(g.get("id") == payload.guild_id for g in guilds):
        raise HTTPException(status_code=400, detail="Guild is not available for this user")
    request.session["active_guild_id"] = payload.guild_id
    return {"ok": True, "active_guild_id": payload.guild_id}


@app.get("/dashboard")
@app.get("/dashboard.html")
async def dashboard(request: Request) -> Response:
    if not _is_authenticated(request):
        return RedirectResponse(url="/auth/login?next=/dashboard/overview", status_code=302)
    return RedirectResponse(url="/dashboard/overview", status_code=302)


@app.get("/dashboard/overview")
async def dashboard_overview(request: Request) -> Response:
    if not _is_authenticated(request):
        return RedirectResponse(url="/auth/login?next=/dashboard/overview", status_code=302)
    return FileResponse(WEB_ROOT / "dashboard" / "overview.html")


@app.get("/dashboard/moderation")
async def dashboard_moderation(request: Request) -> Response:
    if not _is_authenticated(request):
        return RedirectResponse(url="/auth/login?next=/dashboard/moderation", status_code=302)
    return FileResponse(WEB_ROOT / "dashboard" / "moderation.html")


@app.get("/dashboard/guild-settings")
async def dashboard_guild_settings(request: Request) -> Response:
    if not _is_authenticated(request):
        return RedirectResponse(url="/auth/login?next=/dashboard/guild-settings", status_code=302)
    return FileResponse(WEB_ROOT / "dashboard" / "guild-settings.html")


@app.get("/dashboard/cogs")
async def dashboard_cogs(request: Request) -> Response:
    if not _is_authenticated(request):
        return RedirectResponse(url="/auth/login?next=/dashboard/cogs", status_code=302)
    return FileResponse(WEB_ROOT / "dashboard" / "cogs.html")


@app.get("/api/dashboard/state")
async def dashboard_state(request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))

    with state_lock:
        container, state = _load_state_for_guild(guild_id, guild_name)
        _save_state(container)

    return {
        "active_guild_id": guild_id,
        "guilds": _session_guilds(request),
        "state": _state_with_metrics(state),
    }


@app.put("/api/dashboard/guild")
async def update_guild_settings(payload: GuildUpdatePayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))

    with state_lock:
        container, state = _load_state_for_guild(guild_id, guild_name)
        state["guild"].update(payload.model_dump())
        state["guild"]["guild_id"] = guild_id
        container["guild_states"][guild_id] = state
        _save_state(container)
    return {"ok": True, "active_guild_id": guild_id, "state": _state_with_metrics(state)}


@app.put("/api/dashboard/moderation")
async def update_moderation_settings(payload: ModerationUpdatePayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))

    with state_lock:
        container, state = _load_state_for_guild(guild_id, guild_name)
        state["moderation"].update(payload.model_dump())
        container["guild_states"][guild_id] = state
        _save_state(container)
    return {"ok": True, "active_guild_id": guild_id, "state": _state_with_metrics(state)}


@app.put("/api/dashboard/cogs")
async def bulk_update_cogs(payload: CogBulkUpdatePayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))

    with state_lock:
        container, state = _load_state_for_guild(guild_id, guild_name)
        allowed = set(state["cogs"].keys())
        for cog_name, enabled in payload.cogs.items():
            if cog_name in allowed:
                state["cogs"][cog_name] = bool(enabled)
        container["guild_states"][guild_id] = state
        _save_state(container)
    return {"ok": True, "active_guild_id": guild_id, "state": _state_with_metrics(state)}


@app.patch("/api/dashboard/cogs/{cog_name}")
async def toggle_cog(cog_name: str, payload: CogTogglePayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))

    with state_lock:
        container, state = _load_state_for_guild(guild_id, guild_name)
        if cog_name not in state["cogs"]:
            raise HTTPException(status_code=404, detail="Cog not found")
        state["cogs"][cog_name] = payload.enabled
        container["guild_states"][guild_id] = state
        _save_state(container)
    return {"ok": True, "active_guild_id": guild_id, "state": _state_with_metrics(state)}


@app.post("/api/dashboard/reset")
async def reset_dashboard_state(request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))

    with state_lock:
        container, _ = _load_state_for_guild(guild_id, guild_name)
        state = _normalize_guild_state({}, guild_id, guild_name)
        container["guild_states"][guild_id] = state
        _save_state(container)
    return {"ok": True, "active_guild_id": guild_id, "state": _state_with_metrics(state)}


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