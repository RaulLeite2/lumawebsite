import os
import json
import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import uvicorn


WEB_ROOT = Path(__file__).parent.resolve()
STATE_FILE = WEB_ROOT / "dashboard_state.json"

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


@app.get("/dashboard")
@app.get("/dashboard.html")
async def dashboard() -> FileResponse:
    return FileResponse(WEB_ROOT / "dashboard.html")


@app.get("/api/dashboard/state")
async def dashboard_state() -> dict[str, Any]:
    with state_lock:
        state = _load_state()
    return _state_with_metrics(state)


@app.put("/api/dashboard/guild")
async def update_guild_settings(payload: GuildUpdatePayload) -> dict[str, Any]:
    with state_lock:
        state = _load_state()
        state["guild"].update(payload.model_dump())
        _save_state(state)
    return {"ok": True, "state": _state_with_metrics(state)}


@app.put("/api/dashboard/moderation")
async def update_moderation_settings(payload: ModerationUpdatePayload) -> dict[str, Any]:
    with state_lock:
        state = _load_state()
        state["moderation"].update(payload.model_dump())
        _save_state(state)
    return {"ok": True, "state": _state_with_metrics(state)}


@app.put("/api/dashboard/cogs")
async def bulk_update_cogs(payload: CogBulkUpdatePayload) -> dict[str, Any]:
    with state_lock:
        state = _load_state()
        allowed = set(state["cogs"].keys())
        for cog_name, enabled in payload.cogs.items():
            if cog_name in allowed:
                state["cogs"][cog_name] = bool(enabled)
        _save_state(state)
    return {"ok": True, "state": _state_with_metrics(state)}


@app.patch("/api/dashboard/cogs/{cog_name}")
async def toggle_cog(cog_name: str, payload: CogTogglePayload) -> dict[str, Any]:
    with state_lock:
        state = _load_state()
        if cog_name not in state["cogs"]:
            raise HTTPException(status_code=404, detail="Cog not found")
        state["cogs"][cog_name] = payload.enabled
        _save_state(state)
    return {"ok": True, "state": _state_with_metrics(state)}


@app.post("/api/dashboard/reset")
async def reset_dashboard_state() -> dict[str, Any]:
    with state_lock:
        state = _default_state()
        _save_state(state)
    return {"ok": True, "state": _state_with_metrics(state)}


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