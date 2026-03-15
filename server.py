import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
import importlib
import json
import os
import re
import secrets
import threading
import urllib.error
import urllib.parse
import urllib.request
from io import StringIO
import csv
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.sessions import SessionMiddleware


WEB_ROOT = Path(__file__).parent.resolve()
STATE_FILE = WEB_ROOT / "dashboard_state.json"
DISCORD_API_BASE = "https://discord.com/api/v10"
DISCORD_OAUTH_BASE = "https://discord.com/api"
HTTP_USER_AGENT = "LumaDashboard/1.0 (+https://github.com/RaulLeite2/lumawebsite)"
SESSION_GUILD_LIMIT = int(os.getenv("SESSION_GUILD_LIMIT", "25"))

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

LOCKED_COGS = {"events", "mod", "setup"}

ROLE_LEVELS = {"viewer": 1, "moderator": 2, "admin": 3, "owner": 4}

PRESET_TEMPLATES: dict[str, dict[str, Any]] = {
    "gamer": {
        "automation": {"invite_filter": True, "link_filter": True, "caps_filter": True, "spam_threshold": 5},
        "warnings": {
            "escalation_steps": [
                {"threshold": 2, "action": "timeout"},
                {"threshold": 4, "action": "kick"},
                {"threshold": 6, "action": "ban"},
            ]
        },
        "logs": {"join_leave": True, "message_delete": True},
    },
    "study": {
        "automation": {"invite_filter": True, "link_filter": False, "caps_filter": True, "spam_threshold": 7},
        "warnings": {
            "escalation_steps": [
                {"threshold": 3, "action": "timeout"},
                {"threshold": 6, "action": "kick"},
                {"threshold": 10, "action": "ban"},
            ]
        },
        "logs": {"join_leave": True},
    },
    "creator": {
        "automation": {"invite_filter": True, "link_filter": False, "caps_filter": False, "spam_threshold": 8},
        "warnings": {
            "escalation_steps": [
                {"threshold": 3, "action": "timeout"},
                {"threshold": 7, "action": "kick"},
                {"threshold": 12, "action": "ban"},
            ]
        },
        "logs": {"join_leave": True, "moderation": True},
    },
    "support": {
        "automation": {"invite_filter": True, "link_filter": True, "caps_filter": True, "spam_threshold": 6},
        "warnings": {
            "escalation_steps": [
                {"threshold": 2, "action": "timeout"},
                {"threshold": 5, "action": "kick"},
                {"threshold": 8, "action": "ban"},
            ]
        },
        "modmail": {"enabled": True, "close_on_idle": True},
        "logs": {"modmail_transcripts": True},
    },
    "large-community": {
        "automation": {"invite_filter": True, "link_filter": True, "caps_filter": True, "spam_threshold": 4},
        "warnings": {
            "escalation_steps": [
                {"threshold": 2, "action": "timeout"},
                {"threshold": 3, "action": "kick"},
                {"threshold": 5, "action": "ban"},
            ]
        },
        "logs": {"join_leave": True, "message_delete": True, "moderation": True},
    },
}


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


class AutomationSettings(BaseModel):
    enabled: bool = True
    invite_filter: bool = True
    link_filter: bool = True
    caps_filter: bool = False
    spam_threshold: int = Field(default=6, ge=3, le=20)
    quarantine_role: str = "@Muted"
    immune_roles: list[str] = Field(default_factory=list)


class WarningSystemSettings(BaseModel):
    enabled: bool = True
    public_reason_prompt: bool = True
    dm_user: bool = True
    threshold: int = Field(default=3, ge=1, le=20)
    escalate_to: str = Field(default="kick", pattern="^(kick|ban|mute|timeout)$")
    escalation_steps: list[dict[str, Any]] = Field(
        default_factory=lambda: [
            {"threshold": 3, "action": "timeout"},
            {"threshold": 6, "action": "kick"},
            {"threshold": 9, "action": "ban"},
        ]
    )


class LogSettings(BaseModel):
    enabled: bool = True
    moderation: bool = True
    ban_events: bool = True
    join_leave: bool = False
    message_delete: bool = True
    modmail_transcripts: bool = True
    audit_channel: str = "#moderation-log"
    ban_channel: str = "#ban-logs"


class ModmailSettings(BaseModel):
    enabled: bool = True
    anonymous_replies: bool = False
    close_on_idle: bool = True
    inbox_channel: str = "#modmail"
    alert_role: str = "@Support"
    alert_roles: list[str] = Field(default_factory=list)
    auto_close_hours: int = Field(default=48, ge=1, le=168)


class EntryExitEmbedSettings(BaseModel):
    welcome_enabled: bool = False
    welcome_channel: str = ""
    welcome_title: str = "Bem-vindo(a), {member}!"
    welcome_description: str = "Aproveite sua estadia em **{guild}**."
    welcome_color: str = "#57cc99"
    leave_enabled: bool = False
    leave_channel: str = ""
    leave_title: str = "Ate logo, {member}."
    leave_description: str = "{member} saiu de **{guild}**."
    leave_color: str = "#ef476f"


class DashboardState(BaseModel):
    guild: GuildSettings
    moderation: ModerationSettings
    automation: AutomationSettings
    warnings: WarningSystemSettings
    logs: LogSettings
    modmail: ModmailSettings
    entry_exit: EntryExitEmbedSettings
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
    invite_filter: bool = True
    link_filter: bool = True
    caps_filter: bool = False
    spam_threshold: int = Field(default=6, ge=3, le=20)
    quarantine_role: str = ""
    immune_roles: list[str] = Field(default_factory=list)


class CogBulkUpdatePayload(BaseModel):
    cogs: dict[str, bool]


class CogTogglePayload(BaseModel):
    enabled: bool


class ActiveGuildPayload(BaseModel):
    guild_id: str


class SetupUpdatePayload(BaseModel):
    guild: GuildUpdatePayload
    moderation: ModerationUpdatePayload
    automation: AutomationSettings
    warnings: WarningSystemSettings
    logs: LogSettings
    modmail: ModmailSettings
    entry_exit: EntryExitEmbedSettings
    cogs: dict[str, bool]


class AutoModSimulationPayload(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class PresetApplyPayload(BaseModel):
    preset_name: str = Field(pattern="^(gamer|study|creator|support|large-community)$")
    target: str = Field(default="production", pattern="^(production|staging)$")


class DashboardRoleUpdatePayload(BaseModel):
    user_id: str
    role: str = Field(pattern="^(admin|moderator|viewer)$")


state_lock = threading.Lock()

GUILD_DB_SELECT = """
SELECT
    log_channel_id,
    auto_moderation,
    quant_warnings,
    acao,
    modmail_category_id,
    smart_antiflood,
    language_code,
    ticket_default_category_id,
    ticket_default_support_role_id,
    ai_enabled,
    automod_invite_filter,
    automod_link_filter,
    automod_caps_filter,
    automod_spam_threshold,
    automod_quarantine_role_id,
    warn_public_reason_prompt,
    warn_dm_user,
    logs_enabled,
    log_ban_channel_id,
    log_moderation,
    log_ban_events,
    log_join_leave,
    log_message_delete,
    log_modmail_transcripts,
    modmail_anonymous_replies,
    modmail_close_on_idle,
    modmail_alert_role_id,
    modmail_auto_close_hours
FROM guilds
WHERE guild_id = $1
"""

GUILD_COGS_SELECT = """
SELECT cog_name, enabled
FROM guild_cog_settings
WHERE guild_id = $1
"""


def _database_targets() -> list[tuple[str, dict[str, Any]]]:
    database_url = os.getenv("DATABASE_URL", "").strip()
    discrete_config = {
        "user": os.getenv("DB_USER"),
        "password": os.getenv("DB_PASSWORD"),
        "database": os.getenv("DB_NAME"),
        "host": os.getenv("DB_HOST"),
        "port": os.getenv("DB_PORT"),
    }

    targets: list[tuple[str, dict[str, Any]]] = []
    if database_url:
        targets.append(("DATABASE_URL", {"dsn": database_url}))

    if all(discrete_config.values()):
        targets.append(("DB_*", {**discrete_config, "port": int(str(discrete_config["port"]))}))

    return targets


def _extract_discord_id(raw_value: str | None) -> int | None:
    if raw_value is None:
        return None
    digits = "".join(char for char in str(raw_value) if char.isdigit())
    if not digits:
        return None
    try:
        return int(digits)
    except ValueError:
        return None


def _id_to_input_value(raw_id: Any, fallback: str = "") -> str:
    if raw_id is None:
        return fallback
    try:
        return str(int(raw_id))
    except (TypeError, ValueError):
        return fallback


def _format_diff_value(value: Any) -> str:
    if isinstance(value, bool):
        return "ON" if value else "OFF"
    if value is None:
        return "none"
    if isinstance(value, str):
        return value.strip() or "empty"
    return str(value)


def _flatten_state_for_diff(payload: dict[str, Any], prefix: str = "") -> dict[str, Any]:
    flattened: dict[str, Any] = {}
    for key in sorted(payload.keys()):
        value = payload[key]
        composite = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            flattened.update(_flatten_state_for_diff(value, composite))
        else:
            flattened[composite] = value
    return flattened


def _collect_setup_changes(previous_state: dict[str, Any], updated_state: dict[str, Any]) -> list[str]:
    tracked_scopes = {
        "guild": updated_state.get("guild", {}),
        "automation": updated_state.get("automation", {}),
        "warnings": updated_state.get("warnings", {}),
        "logs": updated_state.get("logs", {}),
        "modmail": updated_state.get("modmail", {}),
        "entry_exit": updated_state.get("entry_exit", {}),
        "cogs": updated_state.get("cogs", {}),
        "moderation": {
            "enabled": updated_state.get("moderation", {}).get("enabled"),
            "smart_antiflood": updated_state.get("moderation", {}).get("smart_antiflood"),
            "warning_limit": updated_state.get("moderation", {}).get("warning_limit"),
            "default_action": updated_state.get("moderation", {}).get("default_action"),
            "modmail_enabled": updated_state.get("moderation", {}).get("modmail_enabled"),
        },
    }

    previous_scopes = {
        "guild": previous_state.get("guild", {}),
        "automation": previous_state.get("automation", {}),
        "warnings": previous_state.get("warnings", {}),
        "logs": previous_state.get("logs", {}),
        "modmail": previous_state.get("modmail", {}),
        "entry_exit": previous_state.get("entry_exit", {}),
        "cogs": previous_state.get("cogs", {}),
        "moderation": {
            "enabled": previous_state.get("moderation", {}).get("enabled"),
            "smart_antiflood": previous_state.get("moderation", {}).get("smart_antiflood"),
            "warning_limit": previous_state.get("moderation", {}).get("warning_limit"),
            "default_action": previous_state.get("moderation", {}).get("default_action"),
            "modmail_enabled": previous_state.get("moderation", {}).get("modmail_enabled"),
        },
    }

    previous_flat = _flatten_state_for_diff(previous_scopes)
    updated_flat = _flatten_state_for_diff(tracked_scopes)

    labels = {
        "guild.guild_name": "Guild name",
        "guild.language": "Language",
        "guild.log_channel": "Default log channel",
        "automation.enabled": "AutoMod checks",
        "automation.invite_filter": "Invite filter",
        "automation.link_filter": "External links filter",
        "automation.caps_filter": "Caps filter",
        "automation.spam_threshold": "Spam threshold",
        "automation.quarantine_role": "Quarantine role",
        "automation.immune_roles": "AutoMod immune roles",
        "warnings.enabled": "Warn system",
        "warnings.public_reason_prompt": "Warn public reason prompt",
        "warnings.dm_user": "Warn DM user",
        "warnings.threshold": "Warn threshold",
        "warnings.escalate_to": "Warn escalation",
        "logs.enabled": "Master logs",
        "logs.moderation": "Moderation logs",
        "logs.ban_events": "Ban logs",
        "logs.join_leave": "Join/leave logs",
        "logs.message_delete": "Message delete logs",
        "logs.modmail_transcripts": "Modmail transcripts logs",
        "logs.audit_channel": "Audit channel",
        "logs.ban_channel": "Ban channel",
        "modmail.enabled": "Modmail",
        "modmail.anonymous_replies": "Anonymous replies",
        "modmail.close_on_idle": "Auto-close idle",
        "modmail.inbox_channel": "Modmail category",
        "modmail.alert_role": "Modmail alert role",
        "modmail.auto_close_hours": "Modmail auto-close hours",
        "entry_exit.welcome_enabled": "Welcome embed",
        "entry_exit.welcome_channel": "Welcome channel",
        "entry_exit.welcome_title": "Welcome title",
        "entry_exit.welcome_description": "Welcome description",
        "entry_exit.welcome_color": "Welcome color",
        "entry_exit.leave_enabled": "Leave embed",
        "entry_exit.leave_channel": "Leave channel",
        "entry_exit.leave_title": "Leave title",
        "entry_exit.leave_description": "Leave description",
        "entry_exit.leave_color": "Leave color",
        "moderation.smart_antiflood": "Smart anti-flood",
    }

    changes: list[str] = []
    for key in sorted(updated_flat.keys()):
        old_value = previous_flat.get(key)
        new_value = updated_flat.get(key)
        if old_value == new_value:
            continue

        if key.startswith("cogs."):
            cog_name = key.split(".", 1)[1]
            label = f"Cog {cog_name}"
        else:
            label = labels.get(key, key.replace("_", " ").replace(".", " -> ").title())

        changes.append(f"{label}: {_format_diff_value(old_value)} -> {_format_diff_value(new_value)}")

    return changes


async def _log_dashboard_changes(guild_id: str, moderator_id: int | None, changes: list[str]) -> None:
    if not changes:
        return

    pool = _db_pool()
    if pool is None:
        return

    try:
        guild_id_int = int(guild_id)
    except (TypeError, ValueError):
        return

    if moderator_id is None:
        moderator_id = 0

    try:
        async with pool.acquire() as connection:
            await connection.executemany(
                """
                INSERT INTO moderation_logs (guild_id, moderator_id, user_id, action, reason)
                VALUES ($1, $2, $3, $4, $5)
                """,
                [
                    (
                        guild_id_int,
                        moderator_id,
                        moderator_id,
                        "config_update",
                        f"Dashboard setup: {change}"[:255],
                    )
                    for change in changes
                ],
            )
    except Exception as exc:
        print(f"[Dashboard] Failed to record setup change logs for {guild_id}: {exc}")


async def _fetch_config_logs(guild_id: str, limit: int = 80) -> list[dict[str, Any]]:
    pool = _db_pool()
    if pool is None:
        return []

    try:
        guild_id_int = int(guild_id)
    except (TypeError, ValueError):
        return []

    try:
        async with pool.acquire() as connection:
            rows = await connection.fetch(
                """
                SELECT moderator_id, reason, created_at
                FROM moderation_logs
                WHERE guild_id = $1 AND action = 'config_update'
                ORDER BY created_at DESC
                LIMIT $2
                """,
                guild_id_int,
                max(1, min(limit, 200)),
            )
    except Exception as exc:
        print(f"[Dashboard] Failed to fetch config logs for {guild_id}: {exc}")
        return []

    logs: list[dict[str, Any]] = []
    for row in rows:
        created_at = row.get("created_at")
        logs.append(
            {
                "moderator_id": _id_to_input_value(row.get("moderator_id")),
                "reason": str(row.get("reason") or ""),
                "created_at": created_at.isoformat() if hasattr(created_at, "isoformat") else "",
            }
        )
    return logs


def _get_config_seen_map(request: Request) -> dict[str, str]:
    raw = request.session.get("config_logs_seen")
    if isinstance(raw, dict):
        return {str(key): str(value) for key, value in raw.items()}
    return {}


def _set_config_seen_map(request: Request, payload: dict[str, str]) -> None:
    request.session["config_logs_seen"] = payload


def _count_unread_config_logs(logs: list[dict[str, Any]], seen_iso: str | None) -> int:
    if not seen_iso:
        return len(logs)
    try:
        seen_at = datetime.fromisoformat(seen_iso)
    except ValueError:
        return len(logs)

    unread = 0
    for item in logs:
        raw_ts = item.get("created_at")
        if not raw_ts:
            continue
        try:
            created_at = datetime.fromisoformat(str(raw_ts))
        except ValueError:
            continue
        if created_at > seen_at:
            unread += 1
    return unread


def _period_to_since(period: str | None) -> datetime:
    normalized = str(period or "24h").lower().strip()
    if normalized == "7d":
        return datetime.utcnow() - timedelta(days=7)
    if normalized == "30d":
        return datetime.utcnow() - timedelta(days=30)
    return datetime.utcnow() - timedelta(hours=24)


def _normalize_audit_action(raw: Any) -> str:
    value = str(raw or "unknown").strip().lower()
    return value or "unknown"


async def _fetch_audit_logs(
    guild_id: str,
    *,
    period: str = "24h",
    action: str = "",
    moderator_id: str = "",
    user_id: str = "",
    channel_id: str = "",
    limit: int = 100,
) -> list[dict[str, Any]]:
    pool = _db_pool()
    if pool is None:
        return []

    try:
        guild_id_int = int(guild_id)
    except (TypeError, ValueError):
        return []

    since = _period_to_since(period)
    query = [
        """
        SELECT moderator_id, user_id, channel_id, action, reason, created_at
        FROM moderation_logs
        WHERE guild_id = $1 AND created_at >= $2
        """
    ]
    params: list[Any] = [guild_id_int, since]
    idx = 3

    normalized_action = str(action or "").strip().lower()
    if normalized_action:
        query.append(f"AND LOWER(action) = ${idx}")
        params.append(normalized_action)
        idx += 1

    parsed_mod = _extract_discord_id(moderator_id)
    if parsed_mod is not None:
        query.append(f"AND moderator_id = ${idx}")
        params.append(parsed_mod)
        idx += 1

    parsed_user = _extract_discord_id(user_id)
    if parsed_user is not None:
        query.append(f"AND user_id = ${idx}")
        params.append(parsed_user)
        idx += 1

    parsed_channel = _extract_discord_id(channel_id)
    if parsed_channel is not None:
        query.append(f"AND channel_id = ${idx}")
        params.append(parsed_channel)
        idx += 1

    query.append(f"ORDER BY created_at DESC LIMIT ${idx}")
    params.append(max(1, min(limit, 500)))

    try:
        async with pool.acquire() as connection:
            rows = await connection.fetch("\n".join(query), *params)
    except Exception as exc:
        print(f"[Dashboard] Failed to fetch audit logs for {guild_id}: {exc}")
        return []

    return [
        {
            "moderator_id": _id_to_input_value(row.get("moderator_id")),
            "user_id": _id_to_input_value(row.get("user_id")),
            "channel_id": _id_to_input_value(row.get("channel_id")),
            "action": _normalize_audit_action(row.get("action")),
            "reason": str(row.get("reason") or ""),
            "created_at": row.get("created_at").isoformat() if hasattr(row.get("created_at"), "isoformat") else "",
        }
        for row in rows
    ]


async def _fetch_server_health(guild_id: str, period: str, state: dict[str, Any]) -> dict[str, Any]:
    logs = await _fetch_audit_logs(guild_id, period=period, limit=500)
    warns = sum(1 for item in logs if item.get("action") in {"warn", "moderation:warn", "automod_warn"})
    bans = sum(1 for item in logs if item.get("action") in {"ban", "moderation:ban"})
    spam_blocks = sum(
        1
        for item in logs
        if item.get("action") in {"automod_spam", "automod_invite", "automod_link", "automod_caps", "automod_violation"}
    )
    moderation_actions = sum(
        1
        for item in logs
        if item.get("action") in {"warn", "ban", "kick", "timeout", "mute", "automod_warn", "automod_violation"}
    )
    ban_rate = round((bans / moderation_actions) * 100, 2) if moderation_actions > 0 else 0.0

    # Placeholder while ticket response latency is not yet persisted per thread.
    avg_response_minutes = 0

    return {
        "period": period,
        "warns": warns,
        "ban_rate": ban_rate,
        "spam_blocks": spam_blocks,
        "open_tickets": int(state.get("metrics", {}).get("open_tickets") or 0),
        "avg_response_minutes": avg_response_minutes,
    }


def _simulate_automod(message: str, state: dict[str, Any]) -> dict[str, Any]:
    text = str(message or "")
    automation = state.get("automation", {})
    warnings = state.get("warnings", {})

    invite_pattern = re.compile(r"discord\.gg/\w+|discord(app)?\.com/invite/\w+", re.IGNORECASE)
    link_pattern = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)

    matched: list[dict[str, str]] = []

    if bool(automation.get("invite_filter")) and invite_pattern.search(text):
        matched.append({"rule": "invite_filter", "reason": "Invite link detected"})

    if bool(automation.get("link_filter")) and link_pattern.search(text) and not invite_pattern.search(text):
        matched.append({"rule": "link_filter", "reason": "External link detected"})

    if bool(automation.get("caps_filter")) and len(text) > 10:
        caps_count = sum(1 for ch in text if ch.isupper())
        caps_ratio = caps_count / max(len(text), 1)
        if caps_ratio > 0.70:
            matched.append({"rule": "caps_filter", "reason": "Excessive caps ratio"})

    max_repeat = 0
    current_repeat = 0
    previous = ""
    for ch in text:
        if ch == previous:
            current_repeat += 1
        else:
            current_repeat = 1
            previous = ch
        if current_repeat > max_repeat:
            max_repeat = current_repeat
    if max_repeat > 10:
        matched.append({"rule": "repeat_filter", "reason": "Repeated characters detected"})

    steps = _parse_warning_steps(warnings.get("escalation_steps"))
    default_action = str(steps[0].get("action") if steps else warnings.get("escalate_to") or "timeout")

    return {
        "triggered": bool(matched),
        "rules": matched,
        "suggested_action": default_action,
        "message_length": len(text),
    }


async def _connect_database_pool() -> Any | None:
    try:
        asyncpg = importlib.import_module("asyncpg")
    except ImportError:
        asyncpg = None

    if asyncpg is None:
        print("[Dashboard] asyncpg is not installed; database sync disabled.")
        return None

    targets = _database_targets()
    if not targets:
        print("[Dashboard] DATABASE_URL/DB_* not configured; database sync disabled.")
        return None

    for source_name, connection_kwargs in targets:
        try:
            pool = await asyncpg.create_pool(**connection_kwargs)
            print(f"[Dashboard] Database connection established via {source_name}.")
            return pool
        except Exception as exc:
            print(f"[Dashboard] Database connection failed via {source_name}: {exc}")

    print("[Dashboard] Falling back to local dashboard state only.")
    return None


async def _ensure_dashboard_tables(pool: Any) -> None:
    try:
        async with pool.acquire() as connection:
            await connection.execute("ALTER TABLE moderation_logs ADD COLUMN IF NOT EXISTS channel_id BIGINT")
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS guild_modmail_roles (
                    guild_id BIGINT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
                    role_id BIGINT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (guild_id, role_id)
                )
                """
            )
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS guild_warning_escalations (
                    guild_id BIGINT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
                    threshold INT NOT NULL,
                    action VARCHAR(20) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (guild_id, threshold)
                )
                """
            )
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS guild_immune_roles (
                    guild_id BIGINT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
                    role_id BIGINT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (guild_id, role_id)
                )
                """
            )
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS guild_entry_exit_embeds (
                    guild_id BIGINT PRIMARY KEY REFERENCES guilds(guild_id) ON DELETE CASCADE,
                    welcome_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    welcome_channel_id BIGINT,
                    welcome_title VARCHAR(256),
                    welcome_description TEXT,
                    welcome_color VARCHAR(16),
                    leave_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    leave_channel_id BIGINT,
                    leave_title VARCHAR(256),
                    leave_description TEXT,
                    leave_color VARCHAR(16),
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS guild_dashboard_roles (
                    guild_id BIGINT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
                    user_id BIGINT NOT NULL,
                    role VARCHAR(20) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (guild_id, user_id)
                )
                """
            )
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS guild_config_snapshots (
                    id BIGSERIAL PRIMARY KEY,
                    guild_id BIGINT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
                    state_json TEXT NOT NULL,
                    changes_json TEXT,
                    source VARCHAR(30) DEFAULT 'setup',
                    created_by BIGINT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
    except Exception as exc:
        print(f"[Dashboard] Failed to ensure dashboard tables: {exc}")


def _parse_warning_steps(raw_steps: Any) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    allowed_actions = {"timeout", "mute", "kick", "ban"}
    if not isinstance(raw_steps, list):
        return [
            {"threshold": 3, "action": "timeout"},
            {"threshold": 6, "action": "kick"},
            {"threshold": 9, "action": "ban"},
        ]

    for item in raw_steps:
        if not isinstance(item, dict):
            continue
        try:
            threshold = int(item.get("threshold"))
        except (TypeError, ValueError):
            continue
        action = str(item.get("action") or "").lower().strip()
        if threshold < 1 or action not in allowed_actions:
            continue
        steps.append({"threshold": threshold, "action": action})

    if not steps:
        return [
            {"threshold": 3, "action": "timeout"},
            {"threshold": 6, "action": "kick"},
            {"threshold": 9, "action": "ban"},
        ]

    dedup: dict[int, str] = {}
    for step in sorted(steps, key=lambda s: s["threshold"]):
        dedup[int(step["threshold"])] = str(step["action"])
    return [{"threshold": k, "action": v} for k, v in sorted(dedup.items())]


def _is_dev_user(request: Request) -> bool:
    configured = _extract_discord_id(os.getenv("DASHBOARD_DEV_USER_ID"))
    if configured is None:
        return False
    user = request.session.get("user")
    session_user_id = _extract_discord_id(user.get("id") if isinstance(user, dict) else None)
    return session_user_id == configured


async def _fetch_guild_resources(guild_id: str) -> dict[str, Any]:
    token = os.getenv("DISCORD_BOT_TOKEN", "").strip()
    if not token:
        return {"text_channels": [], "categories": [], "roles": []}

    auth_header = {"Authorization": f"Bot {token}"}
    channels: list[dict[str, Any]] = []
    roles: list[dict[str, Any]] = []

    try:
        channels_response = await asyncio.to_thread(
            _discord_request,
            f"{DISCORD_API_BASE}/guilds/{guild_id}/channels",
            method="GET",
            headers=auth_header,
        )
        if isinstance(channels_response, list):
            channels = channels_response
    except Exception:
        channels = []

    try:
        roles_response = await asyncio.to_thread(
            _discord_request,
            f"{DISCORD_API_BASE}/guilds/{guild_id}/roles",
            method="GET",
            headers=auth_header,
        )
        if isinstance(roles_response, list):
            roles = roles_response
    except Exception:
        roles = []

    text_channels = sorted(
        [
            {"id": str(ch.get("id")), "name": str(ch.get("name", "unknown"))}
            for ch in channels
            if isinstance(ch, dict) and int(ch.get("type", -1)) == 0 and ch.get("id")
        ],
        key=lambda item: item["name"].lower(),
    )
    categories = sorted(
        [
            {"id": str(ch.get("id")), "name": str(ch.get("name", "unknown"))}
            for ch in channels
            if isinstance(ch, dict) and int(ch.get("type", -1)) == 4 and ch.get("id")
        ],
        key=lambda item: item["name"].lower(),
    )
    role_items = sorted(
        [
            {"id": str(role.get("id")), "name": str(role.get("name", "unknown"))}
            for role in roles
            if isinstance(role, dict) and role.get("id") and not bool(role.get("managed")) and str(role.get("name", "")).lower() != "@everyone"
        ],
        key=lambda item: item["name"].lower(),
    )

    return {
        "text_channels": text_channels,
        "categories": categories,
        "roles": role_items,
    }


def _db_pool() -> Any | None:
    return getattr(app.state, "db_pool", None)


async def _fetch_guild_db_row(guild_id: str) -> dict[str, Any] | None:
    pool = _db_pool()
    if pool is None:
        return None

    try:
        guild_id_int = int(guild_id)
    except (TypeError, ValueError):
        return None

    try:
        async with pool.acquire() as connection:
            row = await connection.fetchrow(GUILD_DB_SELECT, guild_id_int)
            cog_rows = await connection.fetch(GUILD_COGS_SELECT, guild_id_int)
            modmail_role_rows = await connection.fetch(
                "SELECT role_id FROM guild_modmail_roles WHERE guild_id = $1 ORDER BY role_id",
                guild_id_int,
            )
            immune_role_rows = await connection.fetch(
                "SELECT role_id FROM guild_immune_roles WHERE guild_id = $1 ORDER BY role_id",
                guild_id_int,
            )
            escalation_rows = await connection.fetch(
                "SELECT threshold, action FROM guild_warning_escalations WHERE guild_id = $1 ORDER BY threshold ASC",
                guild_id_int,
            )
            entry_exit_row = await connection.fetchrow(
                """
                SELECT
                    welcome_enabled,
                    welcome_channel_id,
                    welcome_title,
                    welcome_description,
                    welcome_color,
                    leave_enabled,
                    leave_channel_id,
                    leave_title,
                    leave_description,
                    leave_color
                FROM guild_entry_exit_embeds
                WHERE guild_id = $1
                """,
                guild_id_int,
            )
    except Exception as exc:
        print(f"[Dashboard] Failed to load guild state from database for {guild_id}: {exc}")
        return None

    payload = dict(row) if row else {}
    if cog_rows:
        payload["cogs_from_db"] = {str(item["cog_name"]): bool(item["enabled"]) for item in cog_rows}
    if modmail_role_rows:
        payload["modmail_alert_roles"] = [_id_to_input_value(item["role_id"]) for item in modmail_role_rows if item.get("role_id") is not None]
    if immune_role_rows:
        payload["automod_immune_roles"] = [_id_to_input_value(item["role_id"]) for item in immune_role_rows if item.get("role_id") is not None]
    if escalation_rows:
        payload["warning_escalation_steps"] = [
            {"threshold": int(item["threshold"]), "action": str(item["action"]).lower()}
            for item in escalation_rows
        ]
    if entry_exit_row:
        payload["entry_exit_embed"] = dict(entry_exit_row)

    return payload or None


def _merge_db_row_into_state(state: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    language_code = row.get("language_code")
    if isinstance(language_code, str) and language_code:
        state["guild"]["language"] = language_code

    log_channel_value = _id_to_input_value(row.get("log_channel_id"), state["guild"].get("log_channel", ""))
    if log_channel_value:
        state["guild"]["log_channel"] = log_channel_value
        state["logs"]["audit_channel"] = log_channel_value

    auto_moderation = row.get("auto_moderation")
    if auto_moderation is not None:
        enabled = bool(auto_moderation)
        state["moderation"]["enabled"] = enabled
        state["warnings"]["enabled"] = enabled

    quant_warnings = row.get("quant_warnings")
    if quant_warnings is not None:
        state["moderation"]["warning_limit"] = int(quant_warnings)
        state["warnings"]["threshold"] = int(quant_warnings)

    action = row.get("acao")
    if isinstance(action, str) and action:
        normalized_action = action.lower()
        state["moderation"]["default_action"] = normalized_action
        state["warnings"]["escalate_to"] = normalized_action

    smart_antiflood = row.get("smart_antiflood")
    if smart_antiflood is not None:
        enabled = bool(smart_antiflood)
        state["moderation"]["smart_antiflood"] = enabled
        state["automation"]["enabled"] = enabled

    for source_key, target_key in (
        ("automod_invite_filter", "invite_filter"),
        ("automod_link_filter", "link_filter"),
        ("automod_caps_filter", "caps_filter"),
    ):
        source_value = row.get(source_key)
        if source_value is not None:
            state["automation"][target_key] = bool(source_value)

    if row.get("automod_spam_threshold") is not None:
        state["automation"]["spam_threshold"] = int(row["automod_spam_threshold"])

    quarantine_role_id = row.get("automod_quarantine_role_id")
    if quarantine_role_id is not None:
        state["automation"]["quarantine_role"] = _id_to_input_value(quarantine_role_id, state["automation"].get("quarantine_role", ""))

    immune_roles = row.get("automod_immune_roles")
    if isinstance(immune_roles, list):
        state["automation"]["immune_roles"] = [str(item) for item in immune_roles if str(item).strip()]

    warn_public_reason_prompt = row.get("warn_public_reason_prompt")
    if warn_public_reason_prompt is not None:
        state["warnings"]["public_reason_prompt"] = bool(warn_public_reason_prompt)

    warn_dm_user = row.get("warn_dm_user")
    if warn_dm_user is not None:
        state["warnings"]["dm_user"] = bool(warn_dm_user)
    state["warnings"]["enabled"] = True

    modmail_category = row.get("modmail_category_id")
    if modmail_category is not None:
        state["modmail"]["enabled"] = True
        state["modmail"]["inbox_channel"] = _id_to_input_value(modmail_category, state["modmail"].get("inbox_channel", ""))
    elif row:
        state["modmail"]["enabled"] = False
        state["moderation"]["modmail_enabled"] = False

    ai_enabled = row.get("ai_enabled")
    if ai_enabled is not None and "ai" in state["cogs"]:
        state["cogs"]["ai"] = bool(ai_enabled)

    for source_key, target_key in (
        ("logs_enabled", "enabled"),
        ("log_moderation", "moderation"),
        ("log_ban_events", "ban_events"),
        ("log_join_leave", "join_leave"),
        ("log_message_delete", "message_delete"),
        ("log_modmail_transcripts", "modmail_transcripts"),
    ):
        source_value = row.get(source_key)
        if source_value is not None:
            state["logs"][target_key] = bool(source_value)

    ban_channel_id = row.get("log_ban_channel_id")
    if ban_channel_id is not None:
        state["logs"]["ban_channel"] = _id_to_input_value(ban_channel_id, state["logs"].get("ban_channel", ""))

    anonymous_replies = row.get("modmail_anonymous_replies")
    if anonymous_replies is not None:
        state["modmail"]["anonymous_replies"] = bool(anonymous_replies)

    close_on_idle = row.get("modmail_close_on_idle")
    if close_on_idle is not None:
        state["modmail"]["close_on_idle"] = bool(close_on_idle)

    alert_role_id = row.get("modmail_alert_role_id")
    if alert_role_id is not None:
        state["modmail"]["alert_role"] = _id_to_input_value(alert_role_id, state["modmail"].get("alert_role", ""))

    alert_roles = row.get("modmail_alert_roles")
    if isinstance(alert_roles, list):
        state["modmail"]["alert_roles"] = [str(item) for item in alert_roles if str(item).strip()]
    elif state["modmail"].get("alert_role"):
        state["modmail"]["alert_roles"] = [str(state["modmail"].get("alert_role"))]

    auto_close_hours = row.get("modmail_auto_close_hours")
    if auto_close_hours is not None:
        state["modmail"]["auto_close_hours"] = int(auto_close_hours)

    escalation_steps = row.get("warning_escalation_steps")
    if isinstance(escalation_steps, list):
        state["warnings"]["escalation_steps"] = _parse_warning_steps(escalation_steps)
        first_step = state["warnings"]["escalation_steps"][0]
        state["warnings"]["threshold"] = int(first_step["threshold"])
        state["warnings"]["escalate_to"] = str(first_step["action"])

    cogs_from_db = row.get("cogs_from_db")
    if isinstance(cogs_from_db, dict):
        for cog_name, enabled in cogs_from_db.items():
            if cog_name in state["cogs"]:
                state["cogs"][cog_name] = bool(enabled)

    entry_exit_embed = row.get("entry_exit_embed")
    if isinstance(entry_exit_embed, dict):
        state["entry_exit"]["welcome_enabled"] = bool(entry_exit_embed.get("welcome_enabled"))
        state["entry_exit"]["welcome_channel"] = _id_to_input_value(entry_exit_embed.get("welcome_channel_id"), state["entry_exit"].get("welcome_channel", ""))
        state["entry_exit"]["welcome_title"] = str(entry_exit_embed.get("welcome_title") or state["entry_exit"].get("welcome_title", ""))
        state["entry_exit"]["welcome_description"] = str(entry_exit_embed.get("welcome_description") or state["entry_exit"].get("welcome_description", ""))
        state["entry_exit"]["welcome_color"] = str(entry_exit_embed.get("welcome_color") or state["entry_exit"].get("welcome_color", "#57cc99"))
        state["entry_exit"]["leave_enabled"] = bool(entry_exit_embed.get("leave_enabled"))
        state["entry_exit"]["leave_channel"] = _id_to_input_value(entry_exit_embed.get("leave_channel_id"), state["entry_exit"].get("leave_channel", ""))
        state["entry_exit"]["leave_title"] = str(entry_exit_embed.get("leave_title") or state["entry_exit"].get("leave_title", ""))
        state["entry_exit"]["leave_description"] = str(entry_exit_embed.get("leave_description") or state["entry_exit"].get("leave_description", ""))
        state["entry_exit"]["leave_color"] = str(entry_exit_embed.get("leave_color") or state["entry_exit"].get("leave_color", "#ef476f"))

    state["moderation"]["modmail_enabled"] = state["modmail"]["enabled"]
    return state


async def _sync_state_to_database(guild_id: str, state: dict[str, Any]) -> bool:
    pool = _db_pool()
    if pool is None:
        return False

    try:
        guild_id_int = int(guild_id)
    except (TypeError, ValueError):
        return False

    log_channel_id = _extract_discord_id(state["guild"].get("log_channel") or state["logs"].get("audit_channel"))
    modmail_category_id = _extract_discord_id(state["modmail"].get("inbox_channel")) if state["modmail"].get("enabled") else None
    auto_moderation = True
    smart_antiflood = bool(state["automation"].get("enabled") or state["moderation"].get("smart_antiflood"))
    warning_steps = _parse_warning_steps(state["warnings"].get("escalation_steps"))
    first_step = warning_steps[0]
    warning_limit = int(first_step["threshold"])
    action = str(first_step["action"])
    db_action = "mute" if action == "timeout" else action
    language_code = str(state["guild"].get("language") or "pt")
    ai_enabled = bool(state["cogs"].get("ai", True))
    quarantine_role_id = _extract_discord_id(state["automation"].get("quarantine_role"))
    immune_role_ids = [
        _extract_discord_id(item)
        for item in state["automation"].get("immune_roles", [])
    ]
    immune_role_ids = [item for item in immune_role_ids if item is not None]
    ban_channel_id = _extract_discord_id(state["logs"].get("ban_channel"))
    alert_role_ids = [
        _extract_discord_id(item)
        for item in state["modmail"].get("alert_roles", [])
    ]
    alert_role_ids = [item for item in alert_role_ids if item is not None]
    modmail_alert_role_id = alert_role_ids[0] if alert_role_ids else _extract_discord_id(state["modmail"].get("alert_role"))
    entry_exit = state.get("entry_exit", {})
    welcome_channel_id = _extract_discord_id(entry_exit.get("welcome_channel"))
    leave_channel_id = _extract_discord_id(entry_exit.get("leave_channel"))

    try:
        async with pool.acquire() as connection:
            await connection.execute(
                """
                INSERT INTO guilds (
                    guild_id,
                    log_channel_id,
                    auto_moderation,
                    quant_warnings,
                    acao,
                    modmail_category_id,
                    smart_antiflood,
                    language_code,
                    ai_enabled,
                    automod_invite_filter,
                    automod_link_filter,
                    automod_caps_filter,
                    automod_spam_threshold,
                    automod_quarantine_role_id,
                    warn_public_reason_prompt,
                    warn_dm_user,
                    logs_enabled,
                    log_ban_channel_id,
                    log_moderation,
                    log_ban_events,
                    log_join_leave,
                    log_message_delete,
                    log_modmail_transcripts,
                    modmail_anonymous_replies,
                    modmail_close_on_idle,
                    modmail_alert_role_id,
                    modmail_auto_close_hours,
                    updated_at
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9,
                    $10, $11, $12, $13, $14, $15, $16, $17, $18,
                    $19, $20, $21, $22, $23, $24, $25, $26, $27, CURRENT_TIMESTAMP
                )
                ON CONFLICT (guild_id)
                DO UPDATE SET
                    log_channel_id = EXCLUDED.log_channel_id,
                    auto_moderation = EXCLUDED.auto_moderation,
                    quant_warnings = EXCLUDED.quant_warnings,
                    acao = EXCLUDED.acao,
                    modmail_category_id = EXCLUDED.modmail_category_id,
                    smart_antiflood = EXCLUDED.smart_antiflood,
                    language_code = EXCLUDED.language_code,
                    ai_enabled = EXCLUDED.ai_enabled,
                    automod_invite_filter = EXCLUDED.automod_invite_filter,
                    automod_link_filter = EXCLUDED.automod_link_filter,
                    automod_caps_filter = EXCLUDED.automod_caps_filter,
                    automod_spam_threshold = EXCLUDED.automod_spam_threshold,
                    automod_quarantine_role_id = EXCLUDED.automod_quarantine_role_id,
                    warn_public_reason_prompt = EXCLUDED.warn_public_reason_prompt,
                    warn_dm_user = EXCLUDED.warn_dm_user,
                    logs_enabled = EXCLUDED.logs_enabled,
                    log_ban_channel_id = EXCLUDED.log_ban_channel_id,
                    log_moderation = EXCLUDED.log_moderation,
                    log_ban_events = EXCLUDED.log_ban_events,
                    log_join_leave = EXCLUDED.log_join_leave,
                    log_message_delete = EXCLUDED.log_message_delete,
                    log_modmail_transcripts = EXCLUDED.log_modmail_transcripts,
                    modmail_anonymous_replies = EXCLUDED.modmail_anonymous_replies,
                    modmail_close_on_idle = EXCLUDED.modmail_close_on_idle,
                    modmail_alert_role_id = EXCLUDED.modmail_alert_role_id,
                    modmail_auto_close_hours = EXCLUDED.modmail_auto_close_hours,
                    updated_at = CURRENT_TIMESTAMP
                """,
                guild_id_int,
                log_channel_id,
                auto_moderation,
                warning_limit,
                db_action,
                modmail_category_id,
                smart_antiflood,
                language_code,
                ai_enabled,
                bool(state["automation"].get("invite_filter")),
                bool(state["automation"].get("link_filter")),
                bool(state["automation"].get("caps_filter")),
                int(state["automation"].get("spam_threshold") or 6),
                quarantine_role_id,
                bool(state["warnings"].get("public_reason_prompt")),
                bool(state["warnings"].get("dm_user")),
                bool(state["logs"].get("enabled")),
                ban_channel_id,
                bool(state["logs"].get("moderation")),
                bool(state["logs"].get("ban_events")),
                bool(state["logs"].get("join_leave")),
                bool(state["logs"].get("message_delete")),
                bool(state["logs"].get("modmail_transcripts")),
                bool(state["modmail"].get("anonymous_replies")),
                bool(state["modmail"].get("close_on_idle")),
                modmail_alert_role_id,
                int(state["modmail"].get("auto_close_hours") or 48),
            )
            await connection.executemany(
                """
                INSERT INTO guild_cog_settings (guild_id, cog_name, enabled, updated_at)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                ON CONFLICT (guild_id, cog_name)
                DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = CURRENT_TIMESTAMP
                """,
                [
                    (guild_id_int, cog_name, bool(enabled))
                    for cog_name, enabled in sorted(state["cogs"].items())
                ],
            )
            await connection.execute("DELETE FROM guild_modmail_roles WHERE guild_id = $1", guild_id_int)
            if alert_role_ids:
                await connection.executemany(
                    "INSERT INTO guild_modmail_roles (guild_id, role_id) VALUES ($1, $2) ON CONFLICT (guild_id, role_id) DO NOTHING",
                    [(guild_id_int, role_id) for role_id in alert_role_ids],
                )

            await connection.execute("DELETE FROM guild_warning_escalations WHERE guild_id = $1", guild_id_int)
            if warning_steps:
                await connection.executemany(
                    "INSERT INTO guild_warning_escalations (guild_id, threshold, action) VALUES ($1, $2, $3)",
                    [
                        (guild_id_int, int(step["threshold"]), "mute" if step["action"] == "timeout" else str(step["action"]))
                        for step in warning_steps
                    ],
                )

            await connection.execute("DELETE FROM guild_immune_roles WHERE guild_id = $1", guild_id_int)
            if immune_role_ids:
                await connection.executemany(
                    "INSERT INTO guild_immune_roles (guild_id, role_id) VALUES ($1, $2) ON CONFLICT (guild_id, role_id) DO NOTHING",
                    [(guild_id_int, role_id) for role_id in immune_role_ids],
                )

            await connection.execute(
                """
                INSERT INTO guild_entry_exit_embeds (
                    guild_id,
                    welcome_enabled,
                    welcome_channel_id,
                    welcome_title,
                    welcome_description,
                    welcome_color,
                    leave_enabled,
                    leave_channel_id,
                    leave_title,
                    leave_description,
                    leave_color,
                    updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
                ON CONFLICT (guild_id)
                DO UPDATE SET
                    welcome_enabled = EXCLUDED.welcome_enabled,
                    welcome_channel_id = EXCLUDED.welcome_channel_id,
                    welcome_title = EXCLUDED.welcome_title,
                    welcome_description = EXCLUDED.welcome_description,
                    welcome_color = EXCLUDED.welcome_color,
                    leave_enabled = EXCLUDED.leave_enabled,
                    leave_channel_id = EXCLUDED.leave_channel_id,
                    leave_title = EXCLUDED.leave_title,
                    leave_description = EXCLUDED.leave_description,
                    leave_color = EXCLUDED.leave_color,
                    updated_at = CURRENT_TIMESTAMP
                """,
                guild_id_int,
                bool(entry_exit.get("welcome_enabled")),
                welcome_channel_id,
                str(entry_exit.get("welcome_title") or "Bem-vindo(a), {member}!"),
                str(entry_exit.get("welcome_description") or "Aproveite sua estadia em **{guild}**."),
                str(entry_exit.get("welcome_color") or "#57cc99"),
                bool(entry_exit.get("leave_enabled")),
                leave_channel_id,
                str(entry_exit.get("leave_title") or "Ate logo, {member}."),
                str(entry_exit.get("leave_description") or "{member} saiu de **{guild}**."),
                str(entry_exit.get("leave_color") or "#ef476f"),
            )
        return True
    except Exception as exc:
        print(f"[Dashboard] Failed to persist guild state to database for {guild_id}: {exc}")
        return False


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


def _session_guild_counts(request: Request) -> dict[str, int]:
    raw = request.session.get("guild_counts")
    if isinstance(raw, dict):
        total = raw.get("total")
        configurable = raw.get("configurable")
        if isinstance(total, int) and isinstance(configurable, int):
            return {"total": total, "configurable": configurable}

    guilds = _session_guilds(request)
    return {
        "total": len(guilds),
        "configurable": sum(1 for g in guilds if bool(g.get("configurable"))),
    }


def _compact_guilds_for_session(guilds: list[dict[str, Any]]) -> list[dict[str, Any]]:
    # SessionMiddleware stores session in a signed cookie; keep payload intentionally small.
    compact: list[dict[str, Any]] = []
    for guild in guilds:
        compact.append(
            {
                "id": str(guild.get("id", "")),
                "name": str(guild.get("name", "Unknown Guild")),
                "icon": guild.get("icon"),
                "owner": bool(guild.get("owner")),
                "configurable": bool(guild.get("configurable")),
            }
        )

    compact = [g for g in compact if g.get("id")]
    compact.sort(key=lambda g: (not g["configurable"], g["name"].lower()))
    return compact[: max(1, SESSION_GUILD_LIMIT)]


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
        raise HTTPException(status_code=400, detail="No guild found for this account")
    return guild


def _require_configurable_active_guild(request: Request) -> dict[str, Any]:
    guild = _require_active_guild(request)
    if not bool(guild.get("configurable")):
        raise HTTPException(status_code=403, detail="You do not have permission to configure this guild")
    return guild


def _role_level(role_name: str) -> int:
    return ROLE_LEVELS.get(role_name, 0)


def _default_role_from_guild_record(guild: dict[str, Any]) -> str:
    if bool(guild.get("owner")):
        return "owner"
    if bool(guild.get("configurable")):
        return "admin"
    return "viewer"


async def _dashboard_role_for_user(request: Request, guild: dict[str, Any]) -> str:
    default_role = _default_role_from_guild_record(guild)
    if default_role == "owner":
        return "owner"

    pool = _db_pool()
    if pool is None:
        return default_role

    guild_id = _extract_discord_id(guild.get("id"))
    user = request.session.get("user")
    user_id = _extract_discord_id(user.get("id") if isinstance(user, dict) else None)
    if guild_id is None or user_id is None:
        return default_role

    try:
        async with pool.acquire() as connection:
            row = await connection.fetchrow(
                "SELECT role FROM guild_dashboard_roles WHERE guild_id = $1 AND user_id = $2",
                guild_id,
                user_id,
            )
    except Exception:
        return default_role

    if row and str(row.get("role") or "").lower() in {"admin", "moderator", "viewer"}:
        return str(row.get("role")).lower()
    return default_role


async def _require_dashboard_role(request: Request, minimum_role: str) -> dict[str, Any]:
    guild = _require_active_guild(request)
    role = await _dashboard_role_for_user(request, guild)
    if _role_level(role) < _role_level(minimum_role):
        raise HTTPException(status_code=403, detail=f"Dashboard role '{role}' cannot perform this action")
    return guild


def _load_staging_state_for_guild(guild_id: str, guild_name: str) -> dict[str, Any] | None:
    container = _load_state_container()
    staged = container.get("staged_states", {}).get(guild_id)
    if isinstance(staged, dict):
        return _normalize_guild_state(staged, guild_id, guild_name)
    return None


def _store_staging_state_for_guild(guild_id: str, guild_name: str, state: dict[str, Any]) -> dict[str, Any]:
    container = _load_state_container()
    staged = container.setdefault("staged_states", {})
    staged[guild_id] = _normalize_guild_state(state, guild_id, guild_name)
    _save_state(container)
    return staged[guild_id]


def _clear_staging_state_for_guild(guild_id: str) -> None:
    container = _load_state_container()
    staged = container.setdefault("staged_states", {})
    if guild_id in staged:
        del staged[guild_id]
        _save_state(container)


def _apply_preset_to_state(state: dict[str, Any], preset_name: str) -> dict[str, Any]:
    preset = PRESET_TEMPLATES.get(preset_name)
    if not preset:
        return state

    updated = json.loads(json.dumps(state))
    for section, payload in preset.items():
        if section in updated and isinstance(updated[section], dict) and isinstance(payload, dict):
            updated[section].update(payload)

    if "warnings" in preset and isinstance(preset["warnings"], dict):
        steps = _parse_warning_steps(preset["warnings"].get("escalation_steps"))
        updated["warnings"]["escalation_steps"] = steps
        updated["warnings"]["threshold"] = int(steps[0]["threshold"])
        updated["warnings"]["escalate_to"] = str(steps[0]["action"])
        updated["moderation"]["warning_limit"] = int(steps[0]["threshold"])
        updated["moderation"]["default_action"] = "mute" if steps[0]["action"] == "timeout" else str(steps[0]["action"])

    return updated


async def _create_snapshot(
    guild_id: str,
    state: dict[str, Any],
    *,
    created_by: int | None,
    source: str,
    changes: list[str],
) -> None:
    pool = _db_pool()
    if pool is None:
        return

    guild_id_int = _extract_discord_id(guild_id)
    if guild_id_int is None:
        return

    try:
        async with pool.acquire() as connection:
            await connection.execute(
                """
                INSERT INTO guild_config_snapshots (guild_id, state_json, changes_json, source, created_by)
                VALUES ($1, $2, $3, $4, $5)
                """,
                guild_id_int,
                json.dumps(state, ensure_ascii=False),
                json.dumps(changes, ensure_ascii=False),
                source,
                created_by,
            )
    except Exception as exc:
        print(f"[Dashboard] Failed to create snapshot for guild {guild_id}: {exc}")


async def _fetch_snapshots(guild_id: str, limit: int = 30) -> list[dict[str, Any]]:
    pool = _db_pool()
    if pool is None:
        return []

    guild_id_int = _extract_discord_id(guild_id)
    if guild_id_int is None:
        return []

    try:
        async with pool.acquire() as connection:
            rows = await connection.fetch(
                """
                SELECT id, source, created_by, created_at, changes_json
                FROM guild_config_snapshots
                WHERE guild_id = $1
                ORDER BY created_at DESC
                LIMIT $2
                """,
                guild_id_int,
                max(1, min(limit, 100)),
            )
    except Exception:
        return []

    snapshots: list[dict[str, Any]] = []
    for row in rows:
        raw_changes = row.get("changes_json")
        changes = []
        if isinstance(raw_changes, str) and raw_changes.strip():
            try:
                parsed = json.loads(raw_changes)
                if isinstance(parsed, list):
                    changes = [str(item) for item in parsed]
            except Exception:
                changes = []
        snapshots.append(
            {
                "id": int(row.get("id")),
                "source": str(row.get("source") or "setup"),
                "created_by": _id_to_input_value(row.get("created_by")),
                "created_at": row.get("created_at").isoformat() if hasattr(row.get("created_at"), "isoformat") else "",
                "changes": changes,
            }
        )
    return snapshots


async def _load_snapshot_state(guild_id: str, snapshot_id: int) -> dict[str, Any] | None:
    pool = _db_pool()
    if pool is None:
        return None

    guild_id_int = _extract_discord_id(guild_id)
    if guild_id_int is None:
        return None

    try:
        async with pool.acquire() as connection:
            row = await connection.fetchrow(
                "SELECT state_json FROM guild_config_snapshots WHERE guild_id = $1 AND id = $2",
                guild_id_int,
                snapshot_id,
            )
    except Exception:
        return None

    if not row:
        return None

    raw_state = row.get("state_json")
    if not isinstance(raw_state, str):
        return None

    try:
        parsed = json.loads(raw_state)
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None


async def _detect_smart_alerts(guild_id: str, state: dict[str, Any]) -> list[dict[str, Any]]:
    logs = await _fetch_audit_logs(guild_id, period="24h", limit=500)
    now = datetime.utcnow()
    alert_items: list[dict[str, Any]] = []

    def _within_minutes(item: dict[str, Any], minutes: int) -> bool:
        raw = item.get("created_at")
        if not raw:
            return False
        try:
            dt = datetime.fromisoformat(str(raw))
        except ValueError:
            return False
        return dt >= now - timedelta(minutes=minutes)

    warns_last_hour = sum(1 for item in logs if item.get("action") in {"warn", "moderation:warn", "automod_warn"} and _within_minutes(item, 60))
    warns_prev_hour = sum(
        1
        for item in logs
        if item.get("action") in {"warn", "moderation:warn", "automod_warn"}
        and not _within_minutes(item, 60)
        and _within_minutes(item, 120)
    )
    if warns_last_hour >= 5 and warns_last_hour > max(2, warns_prev_hour * 2):
        alert_items.append(
            {
                "type": "warn_spike",
                "severity": "high",
                "title": "Warn explosion detected",
                "detail": f"{warns_last_hour} warns in the last hour.",
            }
        )

    spam_15m = sum(
        1
        for item in logs
        if item.get("action") in {"automod_spam", "automod_invite", "automod_link", "automod_caps", "automod_violation"}
        and _within_minutes(item, 15)
    )
    if spam_15m >= 8:
        alert_items.append(
            {
                "type": "spam_spike",
                "severity": "high",
                "title": "Abnormal spam detected",
                "detail": f"{spam_15m} AutoMod hits in the last 15 minutes.",
            }
        )

    joins_10m = sum(1 for item in logs if item.get("action") in {"member_join", "join"} and _within_minutes(item, 10))
    if joins_10m >= 12:
        alert_items.append(
            {
                "type": "raid_signal",
                "severity": "critical",
                "title": "Potential raid pattern",
                "detail": f"{joins_10m} joins in the last 10 minutes.",
            }
        )

    if not alert_items:
        alert_items.append(
            {
                "type": "stable",
                "severity": "low",
                "title": "No anomaly detected",
                "detail": "Current moderation traffic looks stable.",
            }
        )

    return alert_items


def _risk_score_for_action(action: str) -> int:
    normalized = str(action or "").lower()
    if normalized in {"ban", "moderation:ban"}:
        return 5
    if normalized in {"kick", "moderation:kick"}:
        return 4
    if normalized in {"timeout", "mute", "moderation:timeout"}:
        return 3
    if normalized in {"warn", "moderation:warn", "automod_warn"}:
        return 2
    if normalized in {"automod_spam", "automod_invite", "automod_link", "automod_caps", "automod_violation"}:
        return 1
    return 0


async def _build_risk_heatmap(guild_id: str, period: str = "24h") -> dict[str, Any]:
    logs = await _fetch_audit_logs(guild_id, period=period, limit=1000)

    channel_scores: dict[str, dict[int, int]] = {}
    max_score = 0
    for item in logs:
        channel_id = str(item.get("channel_id") or "unknown")
        raw_ts = item.get("created_at")
        if not raw_ts:
            continue
        try:
            ts = datetime.fromisoformat(str(raw_ts))
        except ValueError:
            continue

        hour = ts.hour
        score = _risk_score_for_action(str(item.get("action") or ""))
        if score <= 0:
            continue

        bucket = channel_scores.setdefault(channel_id, {})
        bucket[hour] = int(bucket.get(hour, 0)) + score
        if bucket[hour] > max_score:
            max_score = bucket[hour]

    channels = sorted(channel_scores.keys(), key=lambda key: (key == "unknown", key))[:12]
    grid = []
    for channel in channels:
        hours = channel_scores.get(channel, {})
        row = [int(hours.get(hour, 0)) for hour in range(24)]
        grid.append({"channel_id": channel, "scores": row})

    return {
        "period": period,
        "max_score": max_score,
        "hours": list(range(24)),
        "rows": grid,
    }


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

    guilds: list[dict[str, Any]] = []
    for guild in response:
        if not isinstance(guild, dict):
            continue
        owner = bool(guild.get("owner"))
        configurable = _has_dashboard_permission(str(guild.get("permissions", "0")), owner)
        guilds.append(
            {
                "id": str(guild.get("id", "")),
                "name": str(guild.get("name", "Unknown Guild")),
                "icon": guild.get("icon"),
                "owner": owner,
                "permissions": str(guild.get("permissions", "0")),
                "configurable": configurable,
            }
        )

    return [g for g in guilds if g.get("id")]


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
        "automation": AutomationSettings().model_dump(),
        "warnings": WarningSystemSettings().model_dump(),
        "logs": LogSettings().model_dump(),
        "modmail": ModmailSettings().model_dump(),
        "entry_exit": EntryExitEmbedSettings().model_dump(),
        "cogs": {name: True for name in _read_available_cogs()},
    }


def _normalize_guild_state(raw_state: dict[str, Any], guild_id: str, guild_name: str) -> dict[str, Any]:
    normalized = _default_state()
    normalized["guild"].update(raw_state.get("guild", {}))
    normalized["moderation"].update(raw_state.get("moderation", {}))
    normalized["automation"].update(raw_state.get("automation", {}))
    normalized["warnings"].update(raw_state.get("warnings", {}))
    normalized["logs"].update(raw_state.get("logs", {}))
    normalized["modmail"].update(raw_state.get("modmail", {}))
    normalized["entry_exit"].update(raw_state.get("entry_exit", {}))

    normalized["guild"]["guild_id"] = guild_id
    if not normalized["guild"].get("guild_name"):
        normalized["guild"]["guild_name"] = guild_name

    if not normalized["logs"].get("audit_channel"):
        normalized["logs"]["audit_channel"] = normalized["guild"]["log_channel"]

    if not raw_state.get("warnings"):
        normalized["warnings"]["threshold"] = normalized["moderation"]["warning_limit"]
        normalized["warnings"]["escalate_to"] = normalized["moderation"]["default_action"]
    else:
        normalized["moderation"]["warning_limit"] = normalized["warnings"]["threshold"]
        escalation = normalized["warnings"]["escalate_to"]
        normalized["moderation"]["default_action"] = "mute" if escalation == "timeout" else escalation

    normalized["warnings"]["enabled"] = True
    normalized["moderation"]["enabled"] = True

    normalized["warnings"]["escalation_steps"] = _parse_warning_steps(normalized["warnings"].get("escalation_steps"))
    if not normalized["modmail"].get("alert_roles") and normalized["modmail"].get("alert_role"):
        normalized["modmail"]["alert_roles"] = [str(normalized["modmail"]["alert_role"])]

    if not raw_state.get("modmail"):
        normalized["modmail"]["enabled"] = normalized["moderation"]["modmail_enabled"]
    normalized["moderation"]["modmail_enabled"] = normalized["modmail"]["enabled"]

    available_cogs = _read_available_cogs()
    loaded_cogs = raw_state.get("cogs", {})
    normalized["cogs"] = {name: bool(loaded_cogs.get(name, True)) for name in available_cogs}
    return normalized


def _load_state_container() -> dict[str, Any]:
    if not STATE_FILE.exists():
        container = {"guild_states": {}, "staged_states": {}}
        _save_state(container)
        return container

    try:
        with STATE_FILE.open("r", encoding="utf-8") as f:
            raw = json.load(f)
    except (json.JSONDecodeError, OSError):
        raw = {"guild_states": {}, "staged_states": {}}

    container = {"guild_states": {}, "staged_states": {}}
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

    if isinstance(raw, dict) and isinstance(raw.get("staged_states"), dict):
        for gid, state in raw.get("staged_states", {}).items():
            if not isinstance(gid, str) or not isinstance(state, dict):
                continue
            default_name = str(state.get("guild", {}).get("guild_name", f"Guild {gid}"))
            container["staged_states"][gid] = _normalize_guild_state(state, gid, default_name)

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


def _store_state_for_guild(guild_id: str, guild_name: str, state: dict[str, Any]) -> dict[str, Any]:
    container = _load_state_container()
    container.setdefault("guild_states", {})[guild_id] = _normalize_guild_state(state, guild_id, guild_name)
    _save_state(container)
    return container["guild_states"][guild_id]


async def _get_effective_state_for_guild(guild_id: str, guild_name: str) -> dict[str, Any]:
    with state_lock:
        _, state = _load_state_for_guild(guild_id, guild_name)

    db_row = await _fetch_guild_db_row(guild_id)
    if db_row is not None:
        state = _merge_db_row_into_state(state, db_row)
        state = _normalize_guild_state(state, guild_id, guild_name)
        with state_lock:
            state = _store_state_for_guild(guild_id, guild_name, state)

    return state


async def _persist_state_for_guild(guild_id: str, guild_name: str, state: dict[str, Any]) -> dict[str, Any]:
    state = _normalize_guild_state(state, guild_id, guild_name)
    await _sync_state_to_database(guild_id, state)
    with state_lock:
        return _store_state_for_guild(guild_id, guild_name, state)


def _save_state(state: dict[str, Any]) -> None:
    with STATE_FILE.open("w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def _state_with_metrics(state: dict[str, Any]) -> dict[str, Any]:
    enabled_cogs = sum(1 for enabled in state["cogs"].values() if enabled)
    total_cogs = len(state["cogs"]) if state["cogs"] else 1
    enabled_logs = sum(
        1
        for key in ("moderation", "ban_events", "join_leave", "message_delete", "modmail_transcripts")
        if state["logs"].get(key)
    )
    protection_layers = sum(
        1
        for key in ("invite_filter", "link_filter", "caps_filter")
        if state["automation"].get(key)
    )

    metrics = {
        "warnings_24h": 8 if state["moderation"]["enabled"] else 0,
        "open_tickets": 4 if state["moderation"]["tickets_enabled"] else 0,
        "modmail_threads": 3 if state["moderation"]["modmail_enabled"] else 0,
        "cogs_enabled": f"{enabled_cogs}/{total_cogs}",
        "logs_enabled": enabled_logs if state["logs"].get("enabled") else 0,
        "protection_layers": protection_layers,
    }
    return {**state, "metrics": metrics, "available_cogs": _read_available_cogs()}


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db_pool = await _connect_database_pool()
    if app.state.db_pool is not None:
        await _ensure_dashboard_tables(app.state.db_pool)
    try:
        yield
    finally:
        pool = getattr(app.state, "db_pool", None)
        if pool is not None:
            await pool.close()
            app.state.db_pool = None


app = FastAPI(title="Luma Site", lifespan=lifespan)
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
async def auth_login(request: Request, next_path: str = Query(default="/dashboard/servers", alias="next")) -> RedirectResponse:
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
    request.session["guild_counts"] = {
        "total": len(guilds),
        "configurable": sum(1 for g in guilds if bool(g.get("configurable"))),
    }
    session_guilds = _compact_guilds_for_session(guilds)
    request.session["guilds"] = session_guilds
    selected = next((g for g in session_guilds if g.get("configurable")), None) or (session_guilds[0] if session_guilds else None)
    request.session["active_guild_id"] = selected.get("id") if selected else None

    destination = request.session.pop("post_login_redirect", "/dashboard/servers")
    if not isinstance(destination, str) or not destination.startswith("/"):
        destination = "/dashboard/servers"
    return RedirectResponse(url=destination, status_code=302)


@app.get("/auth/logout")
async def auth_logout(request: Request) -> RedirectResponse:
    request.session.clear()
    return RedirectResponse(url="/", status_code=302)


@app.get("/api/auth/session")
async def auth_session(request: Request) -> dict[str, Any]:
    user = request.session.get("user")
    active_guild = _active_guild_from_session(request)
    guilds = _session_guilds(request)
    counts = _session_guild_counts(request)
    return {
        "authenticated": _is_authenticated(request),
        "user": user if isinstance(user, dict) else None,
        "guilds": guilds,
        "active_guild_id": active_guild.get("id") if active_guild else None,
        "guild_counts": counts,
    }


@app.put("/api/dashboard/active-guild")
async def set_active_guild(payload: ActiveGuildPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    guilds = _session_guilds(request)
    match = next((g for g in guilds if g.get("id") == payload.guild_id), None)
    if match is None:
        raise HTTPException(status_code=400, detail="Guild is not available for this user")
    request.session["active_guild_id"] = payload.guild_id
    return {"ok": True, "active_guild_id": payload.guild_id}


@app.get("/dashboard")
@app.get("/dashboard.html")
async def dashboard(request: Request) -> Response:
    if not _is_authenticated(request):
        return RedirectResponse(url="/auth/login?next=/dashboard/servers", status_code=302)
    return RedirectResponse(url="/dashboard/servers", status_code=302)


@app.get("/dashboard/servers")
async def dashboard_servers(request: Request) -> Response:
    if not _is_authenticated(request):
        return RedirectResponse(url="/auth/login?next=/dashboard/servers", status_code=302)
    return FileResponse(WEB_ROOT / "dashboard" / "servers.html")


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


@app.get("/dashboard/config-logs")
async def dashboard_config_logs(request: Request) -> Response:
    if not _is_authenticated(request):
        return RedirectResponse(url="/auth/login?next=/dashboard/config-logs", status_code=302)
    return FileResponse(WEB_ROOT / "dashboard" / "config-logs.html")


@app.get("/api/dashboard/state")
async def dashboard_state(request: Request) -> dict[str, Any]:
    _require_auth(request)
    guilds = _session_guilds(request)
    counts = _session_guild_counts(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))

    state = await _get_effective_state_for_guild(guild_id, guild_name)
    staging_state = _load_staging_state_for_guild(guild_id, guild_name)
    resources = await _fetch_guild_resources(guild_id)
    logs = await _fetch_config_logs(guild_id, limit=50)
    seen_map = _get_config_seen_map(request)
    unread = _count_unread_config_logs(logs, seen_map.get(guild_id))
    dashboard_role = await _dashboard_role_for_user(request, active_guild)

    return {
        "active_guild_id": guild_id,
        "guilds": guilds,
        "guild_counts": counts,
        "resources": resources,
        "config_logs_unread": unread,
        "dashboard_role": dashboard_role,
        "has_staging": staging_state is not None,
        "preset_names": sorted(PRESET_TEMPLATES.keys()),
        "locked_cogs": sorted(LOCKED_COGS),
        "is_dev_user": _is_dev_user(request),
        "state": _state_with_metrics(state),
    }


@app.get("/api/dashboard/alerts")
async def dashboard_alerts(request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))
    state = _state_with_metrics(await _get_effective_state_for_guild(guild_id, guild_name))
    alerts = await _detect_smart_alerts(guild_id, state)
    return {"ok": True, "active_guild_id": guild_id, "alerts": alerts}


@app.get("/api/dashboard/risk-heatmap")
async def dashboard_risk_heatmap(
    request: Request,
    period: str = Query(default="24h", pattern="^(24h|7d|30d)$"),
) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))
    heatmap = await _build_risk_heatmap(guild_id, period=period)
    return {"ok": True, "active_guild_id": guild_id, "heatmap": heatmap}


@app.get("/api/dashboard/roles")
async def dashboard_roles(request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = _extract_discord_id(active_guild.get("id"))
    role = await _dashboard_role_for_user(request, active_guild)

    entries: list[dict[str, Any]] = []
    if guild_id is not None:
        pool = _db_pool()
        if pool is not None:
            try:
                async with pool.acquire() as connection:
                    rows = await connection.fetch(
                        "SELECT user_id, role FROM guild_dashboard_roles WHERE guild_id = $1 ORDER BY updated_at DESC",
                        guild_id,
                    )
                entries = [
                    {"user_id": _id_to_input_value(row.get("user_id")), "role": str(row.get("role") or "viewer")}
                    for row in rows
                ]
            except Exception:
                entries = []

    return {
        "ok": True,
        "active_guild_id": str(active_guild.get("id")),
        "current_role": role,
        "entries": entries,
    }


@app.put("/api/dashboard/roles")
async def dashboard_roles_update(payload: DashboardRoleUpdatePayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = await _require_dashboard_role(request, "admin")
    guild_id = _extract_discord_id(active_guild.get("id"))
    user_id = _extract_discord_id(payload.user_id)
    if guild_id is None or user_id is None:
        raise HTTPException(status_code=400, detail="Invalid guild/user id")

    pool = _db_pool()
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        async with pool.acquire() as connection:
            await connection.execute(
                """
                INSERT INTO guild_dashboard_roles (guild_id, user_id, role, updated_at)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                ON CONFLICT (guild_id, user_id)
                DO UPDATE SET role = EXCLUDED.role, updated_at = CURRENT_TIMESTAMP
                """,
                guild_id,
                user_id,
                payload.role,
            )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save role: {exc}") from exc

    return {"ok": True}


@app.get("/api/dashboard/staging")
async def dashboard_staging_get(request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))
    staging = _load_staging_state_for_guild(guild_id, guild_name)
    return {"ok": True, "active_guild_id": guild_id, "has_staging": staging is not None, "state": _state_with_metrics(staging) if staging else None}


@app.put("/api/dashboard/staging")
async def dashboard_staging_put(payload: SetupUpdatePayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = await _require_dashboard_role(request, "admin")
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))

    base_state = await _get_effective_state_for_guild(guild_id, guild_name)
    state = json.loads(json.dumps(base_state))
    state["guild"].update(payload.guild.model_dump())
    state["moderation"].update(payload.moderation.model_dump())
    state["automation"].update(payload.automation.model_dump())
    state["warnings"].update(payload.warnings.model_dump())
    state["logs"].update(payload.logs.model_dump())
    state["modmail"].update(payload.modmail.model_dump())
    state["entry_exit"].update(payload.entry_exit.model_dump())
    state["cogs"].update(payload.cogs)
    state["guild"]["guild_name"] = guild_name
    state["guild"]["guild_id"] = guild_id

    staged = _store_staging_state_for_guild(guild_id, guild_name, state)
    return {"ok": True, "active_guild_id": guild_id, "state": _state_with_metrics(staged)}


@app.post("/api/dashboard/staging/apply")
async def dashboard_staging_apply(request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = await _require_dashboard_role(request, "admin")
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))

    staging = _load_staging_state_for_guild(guild_id, guild_name)
    if staging is None:
        raise HTTPException(status_code=404, detail="No staging configuration found")

    previous = await _get_effective_state_for_guild(guild_id, guild_name)
    persisted = await _persist_state_for_guild(guild_id, guild_name, staging)
    _clear_staging_state_for_guild(guild_id)

    changes = _collect_setup_changes(previous, persisted)
    user = request.session.get("user")
    moderator_id = _extract_discord_id(user.get("id") if isinstance(user, dict) else None)
    await _create_snapshot(guild_id, persisted, created_by=moderator_id, source="staging_apply", changes=changes)
    await _log_dashboard_changes(guild_id, moderator_id, changes)

    return {"ok": True, "active_guild_id": guild_id, "state": _state_with_metrics(persisted), "applied_changes": changes}


@app.delete("/api/dashboard/staging")
async def dashboard_staging_delete(request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = await _require_dashboard_role(request, "admin")
    guild_id = str(active_guild.get("id"))
    _clear_staging_state_for_guild(guild_id)
    return {"ok": True, "active_guild_id": guild_id}


@app.post("/api/dashboard/presets/apply")
async def dashboard_apply_preset(payload: PresetApplyPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = await _require_dashboard_role(request, "admin")
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))

    current = await _get_effective_state_for_guild(guild_id, guild_name)
    updated = _apply_preset_to_state(current, payload.preset_name)
    updated = _normalize_guild_state(updated, guild_id, guild_name)

    user = request.session.get("user")
    moderator_id = _extract_discord_id(user.get("id") if isinstance(user, dict) else None)

    if payload.target == "staging":
        staged = _store_staging_state_for_guild(guild_id, guild_name, updated)
        return {"ok": True, "target": "staging", "active_guild_id": guild_id, "state": _state_with_metrics(staged)}

    persisted = await _persist_state_for_guild(guild_id, guild_name, updated)
    changes = _collect_setup_changes(current, persisted)
    await _create_snapshot(guild_id, persisted, created_by=moderator_id, source=f"preset:{payload.preset_name}", changes=changes)
    await _log_dashboard_changes(guild_id, moderator_id, changes)
    return {"ok": True, "target": "production", "active_guild_id": guild_id, "state": _state_with_metrics(persisted), "applied_changes": changes}


@app.get("/api/dashboard/snapshots")
async def dashboard_snapshots(request: Request, limit: int = Query(default=30, ge=1, le=100)) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))
    snapshots = await _fetch_snapshots(guild_id, limit=limit)
    return {"ok": True, "active_guild_id": guild_id, "snapshots": snapshots}


@app.post("/api/dashboard/snapshots/{snapshot_id}/rollback")
async def dashboard_snapshot_rollback(snapshot_id: int, request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = await _require_dashboard_role(request, "admin")
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))

    target = await _load_snapshot_state(guild_id, snapshot_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    previous = await _get_effective_state_for_guild(guild_id, guild_name)
    restored = await _persist_state_for_guild(guild_id, guild_name, target)
    changes = _collect_setup_changes(previous, restored)

    user = request.session.get("user")
    moderator_id = _extract_discord_id(user.get("id") if isinstance(user, dict) else None)
    await _create_snapshot(guild_id, restored, created_by=moderator_id, source=f"rollback:{snapshot_id}", changes=changes)
    await _log_dashboard_changes(guild_id, moderator_id, changes)

    return {"ok": True, "active_guild_id": guild_id, "state": _state_with_metrics(restored), "applied_changes": changes}


@app.get("/api/dashboard/config-logs")
async def dashboard_config_logs_data(request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))
    logs = await _fetch_config_logs(guild_id, limit=120)
    seen_map = _get_config_seen_map(request)
    unread = _count_unread_config_logs(logs, seen_map.get(guild_id))
    return {
        "ok": True,
        "active_guild_id": guild_id,
        "logs": logs,
        "unread": unread,
    }


@app.get("/api/dashboard/audit")
async def dashboard_audit_logs(
    request: Request,
    period: str = Query(default="24h", pattern="^(24h|7d|30d)$"),
    action: str = "",
    moderator_id: str = "",
    user_id: str = "",
    channel_id: str = "",
    limit: int = Query(default=100, ge=1, le=500),
) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))
    logs = await _fetch_audit_logs(
        guild_id,
        period=period,
        action=action,
        moderator_id=moderator_id,
        user_id=user_id,
        channel_id=channel_id,
        limit=limit,
    )
    return {
        "ok": True,
        "active_guild_id": guild_id,
        "period": period,
        "logs": logs,
        "count": len(logs),
    }


@app.get("/api/dashboard/audit/export")
async def dashboard_audit_export(
    request: Request,
    format: str = Query(default="csv", pattern="^(csv|json)$"),
    period: str = Query(default="24h", pattern="^(24h|7d|30d)$"),
    action: str = "",
    moderator_id: str = "",
    user_id: str = "",
    channel_id: str = "",
    limit: int = Query(default=500, ge=1, le=2000),
) -> Response:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))
    logs = await _fetch_audit_logs(
        guild_id,
        period=period,
        action=action,
        moderator_id=moderator_id,
        user_id=user_id,
        channel_id=channel_id,
        limit=limit,
    )

    if format == "json":
        payload = json.dumps({"guild_id": guild_id, "period": period, "logs": logs}, ensure_ascii=False, indent=2)
        return Response(
            content=payload,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="audit-{guild_id}-{period}.json"'},
        )

    out = StringIO()
    writer = csv.DictWriter(out, fieldnames=["created_at", "action", "moderator_id", "user_id", "channel_id", "reason"])
    writer.writeheader()
    for item in logs:
        writer.writerow(
            {
                "created_at": item.get("created_at", ""),
                "action": item.get("action", ""),
                "moderator_id": item.get("moderator_id", ""),
                "user_id": item.get("user_id", ""),
                "channel_id": item.get("channel_id", ""),
                "reason": item.get("reason", ""),
            }
        )

    return Response(
        content=out.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="audit-{guild_id}-{period}.csv"'},
    )


@app.get("/api/dashboard/health")
async def dashboard_health_metrics(
    request: Request,
    period: str = Query(default="24h", pattern="^(24h|7d|30d)$"),
) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))
    state = _state_with_metrics(await _get_effective_state_for_guild(guild_id, guild_name))
    health = await _fetch_server_health(guild_id, period, state)
    return {"ok": True, "active_guild_id": guild_id, "health": health}


@app.post("/api/dashboard/automod/simulate")
async def dashboard_automod_simulate(payload: AutoModSimulationPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))
    state = await _get_effective_state_for_guild(guild_id, guild_name)
    simulation = _simulate_automod(payload.message, state)
    return {"ok": True, "active_guild_id": guild_id, "simulation": simulation}


@app.get("/api/dashboard/activity/recent")
async def dashboard_activity_recent(
    request: Request,
    limit: int = Query(default=30, ge=1, le=200),
) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))
    logs = await _fetch_audit_logs(guild_id, period="30d", limit=limit)
    return {"ok": True, "active_guild_id": guild_id, "logs": logs}


@app.get("/api/dashboard/activity/stream")
async def dashboard_activity_stream(request: Request) -> StreamingResponse:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))

    async def generator():
        last_seen = ""
        for _ in range(120):
            logs = await _fetch_audit_logs(guild_id, period="24h", limit=25)
            if logs:
                newest = logs[0].get("created_at", "")
                if newest and newest != last_seen:
                    last_seen = newest
                    yield f"data: {json.dumps({'logs': logs[:10]})}\n\n"
            await asyncio.sleep(5)

    return StreamingResponse(generator(), media_type="text/event-stream")


@app.post("/api/dashboard/config-logs/ack")
async def dashboard_config_logs_ack(request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))
    seen_map = _get_config_seen_map(request)
    seen_map[guild_id] = datetime.utcnow().isoformat()
    _set_config_seen_map(request, seen_map)
    return {"ok": True, "active_guild_id": guild_id, "unread": 0}


@app.put("/api/dashboard/guild")
async def update_guild_settings(payload: GuildUpdatePayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = await _require_dashboard_role(request, "admin")
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))

    state = await _get_effective_state_for_guild(guild_id, guild_name)
    previous_log_channel = state["guild"].get("log_channel")
    state["guild"].update(payload.model_dump())
    state["guild"]["guild_id"] = guild_id
    state["guild"]["guild_name"] = guild_name
    if state["logs"].get("audit_channel") == previous_log_channel:
        state["logs"]["audit_channel"] = payload.log_channel
    state = await _persist_state_for_guild(guild_id, guild_name, state)
    return {"ok": True, "active_guild_id": guild_id, "state": _state_with_metrics(state)}


@app.put("/api/dashboard/moderation")
async def update_moderation_settings(payload: ModerationUpdatePayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = await _require_dashboard_role(request, "admin")
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))

    state = await _get_effective_state_for_guild(guild_id, guild_name)
    state["moderation"].update(payload.model_dump())
    state["warnings"]["threshold"] = payload.warning_limit
    state["warnings"]["escalate_to"] = payload.default_action
    state["modmail"]["enabled"] = payload.modmail_enabled
    state["automation"]["enabled"] = payload.smart_antiflood
    state["automation"]["invite_filter"] = payload.invite_filter
    state["automation"]["link_filter"] = payload.link_filter
    state["automation"]["caps_filter"] = payload.caps_filter
    state["automation"]["spam_threshold"] = payload.spam_threshold
    state["automation"]["quarantine_role"] = payload.quarantine_role
    state["automation"]["immune_roles"] = [str(role_id) for role_id in payload.immune_roles if str(role_id).strip()]
    state = await _persist_state_for_guild(guild_id, guild_name, state)
    return {"ok": True, "active_guild_id": guild_id, "state": _state_with_metrics(state)}


@app.put("/api/dashboard/setup")
async def update_setup(payload: SetupUpdatePayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = await _require_dashboard_role(request, "admin")
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))

    state = await _get_effective_state_for_guild(guild_id, guild_name)
    previous_state = json.loads(json.dumps(state))

    guild_payload = payload.guild.model_dump()
    moderation_payload = payload.moderation.model_dump()
    automation_payload = payload.automation.model_dump()
    warnings_payload = payload.warnings.model_dump()
    logs_payload = payload.logs.model_dump()
    modmail_payload = payload.modmail.model_dump()
    entry_exit_payload = payload.entry_exit.model_dump()

    state["guild"].update(guild_payload)
    state["guild"]["guild_id"] = guild_id
    state["moderation"].update(moderation_payload)
    state["automation"].update(automation_payload)
    state["warnings"].update(warnings_payload)
    state["logs"].update(logs_payload)
    state["modmail"].update(modmail_payload)
    state["entry_exit"].update(entry_exit_payload)

    # Guild identity comes from the selected guild; do not allow manual rename in dashboard.
    state["guild"]["guild_name"] = guild_name
    state["warnings"]["enabled"] = True

    state["moderation"]["warning_limit"] = warnings_payload["threshold"]
    state["moderation"]["default_action"] = "mute" if warnings_payload["escalate_to"] == "timeout" else warnings_payload["escalate_to"]
    state["moderation"]["modmail_enabled"] = modmail_payload["enabled"]
    state["moderation"]["enabled"] = True

    allowed = set(state["cogs"].keys())
    is_dev = _is_dev_user(request)
    for cog_name, enabled in payload.cogs.items():
        if cog_name in allowed:
            if cog_name in LOCKED_COGS and not bool(enabled) and not is_dev:
                continue
            state["cogs"][cog_name] = bool(enabled)

    state = await _persist_state_for_guild(guild_id, guild_name, state)

    changes = _collect_setup_changes(previous_state, state)
    user = request.session.get("user")
    moderator_id = _extract_discord_id(user.get("id") if isinstance(user, dict) else None)
    await _create_snapshot(guild_id, state, created_by=moderator_id, source="setup", changes=changes)
    await _log_dashboard_changes(guild_id, moderator_id, changes)

    return {
        "ok": True,
        "active_guild_id": guild_id,
        "state": _state_with_metrics(state),
        "applied_changes": changes,
        "applied_changes_count": len(changes),
    }


@app.put("/api/dashboard/cogs")
async def bulk_update_cogs(payload: CogBulkUpdatePayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = await _require_dashboard_role(request, "admin")
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))

    state = await _get_effective_state_for_guild(guild_id, guild_name)
    allowed = set(state["cogs"].keys())
    is_dev = _is_dev_user(request)
    for cog_name, enabled in payload.cogs.items():
        if cog_name in allowed:
            if cog_name in LOCKED_COGS and not bool(enabled) and not is_dev:
                continue
            state["cogs"][cog_name] = bool(enabled)
    state = await _persist_state_for_guild(guild_id, guild_name, state)
    return {"ok": True, "active_guild_id": guild_id, "state": _state_with_metrics(state)}


@app.patch("/api/dashboard/cogs/{cog_name}")
async def toggle_cog(cog_name: str, payload: CogTogglePayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = await _require_dashboard_role(request, "admin")
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))

    state = await _get_effective_state_for_guild(guild_id, guild_name)
    if cog_name not in state["cogs"]:
        raise HTTPException(status_code=404, detail="Cog not found")
    if cog_name in LOCKED_COGS and not payload.enabled and not _is_dev_user(request):
        raise HTTPException(status_code=403, detail="Only the bot developer can disable this module")
    state["cogs"][cog_name] = payload.enabled
    state = await _persist_state_for_guild(guild_id, guild_name, state)
    return {"ok": True, "active_guild_id": guild_id, "state": _state_with_metrics(state)}


@app.post("/api/dashboard/reset")
async def reset_dashboard_state(request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = await _require_dashboard_role(request, "admin")
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))

    state = await _persist_state_for_guild(guild_id, guild_name, _normalize_guild_state({}, guild_id, guild_name))
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