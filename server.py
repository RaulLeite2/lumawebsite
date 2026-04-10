import asyncio
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timedelta
import importlib
import json
import os
import random
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
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse, Response, StreamingResponse
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
    "nongroups",
    "rolepanel",
    "setup",
    "stats",
    "ticket",
]

LOCKED_COGS = {"events", "mod", "setup"}

ROLE_LEVELS = {"viewer": 1, "moderator": 2, "admin": 3, "owner": 4}

TERRITORY_LEAGUES: list[tuple[str, int]] = [
    ("Celestial", 1000),
    ("Eclipse", 550),
    ("Tempestade", 220),
    ("Abismo", 0),
]

TERRITORY_ATTACK_COOLDOWN_SECONDS = 900
TERRITORY_RESOURCE_GATHER_COOLDOWN_SECONDS = 45
TERRITORY_FACTION_ATTACK_MIN_INTERVAL_SECONDS = 1800
TERRITORY_FACTION_ATTACK_DURATION_MINUTES = 15
TERRITORY_TOTAL_MAPS = 48

TERRITORY_FACTIONS = [
    "Legiao Rubra",
    "Ordem do Eclipse",
    "Coroa de Cinzas",
    "Pacto do Abismo",
]

def _build_territory_prime_schedule(total_maps: int) -> dict[int, dict[str, int]]:
    schedule: dict[int, dict[str, int]] = {}
    for map_id in range(total_maps):
        slot = map_id % 12
        start_hour = slot * 2
        end_hour = start_hour + 2
        if end_hour >= 24:
            schedule[map_id] = {"end_hour": 23, "end_minute": 59}
        else:
            schedule[map_id] = {"end_hour": end_hour, "end_minute": 0}
    return schedule


TERRITORY_PRIME_SCHEDULE_BY_MAP: dict[int, dict[str, int]] = _build_territory_prime_schedule(TERRITORY_TOTAL_MAPS)

TERRITORY_RESOURCE_QUALITY_TABLE: list[tuple[int, str]] = [
    (45, "Comum"),
    (75, "Incomum"),
    (90, "Rara"),
    (98, "Epica"),
    (100, "Lendaria"),
]

TERRITORY_RESOURCE_UNIT_VALUE: dict[str, int] = {
    "Comum": 6,
    "Incomum": 12,
    "Rara": 22,
    "Epica": 38,
    "Lendaria": 62,
}

TERRITORY_RESOURCE_BASE_NAME: dict[str, str] = {
    "🪵": "Madeira",
    "🪨": "Pedra",
    "🌿": "Fibra",
    "⛏": "Metal",
    "🐾": "Couro",
    "🌾": "Graos",
    "💎": "Cristal",
    "🦴": "Osso",
    "🧊": "Gelo",
    "💠": "Essencia",
    "🪷": "Lotus",
    "🐚": "Concha",
    "🧪": "Reagente",
}

TERRITORY_WORLD_BASE_MAPS: list[dict[str, Any]] = [
    {
        "id": 0,
        "cities": [
            {"id": "valorium-exchange", "name": "Valorium Exchange", "gx": 2, "gy": 2, "tax_rate": 0.07},
            {"id": "seraph-docks", "name": "Docks de Seraph", "gx": 11, "gy": 10, "tax_rate": 0.11},
        ],
        "resources": [
            {"gx": 4, "gy": 3, "icon": "🪨"},
            {"gx": 9, "gy": 3, "icon": "🪵"},
            {"gx": 10, "gy": 8, "icon": "🌿"},
            {"gx": 3, "gy": 8, "icon": "⛏"},
            {"gx": 7, "gy": 7, "icon": "🐾"},
        ],
    },
    {
        "id": 1,
        "cities": [
            {"id": "ashveil-bazaar", "name": "Bazar de Ashveil", "gx": 2, "gy": 2, "tax_rate": 0.08},
            {"id": "greenpact-wharf", "name": "Wharf Esmeral", "gx": 11, "gy": 10, "tax_rate": 0.1},
        ],
        "resources": [
            {"gx": 5, "gy": 4, "icon": "🌿"},
            {"gx": 9, "gy": 2, "icon": "🪵"},
            {"gx": 11, "gy": 9, "icon": "🪨"},
            {"gx": 3, "gy": 9, "icon": "🌾"},
        ],
    },
    {
        "id": 2,
        "cities": [
            {"id": "nhal-kor-smeltery", "name": "Fundicao Nhal-Kor", "gx": 2, "gy": 2, "tax_rate": 0.09},
            {"id": "obsidian-market", "name": "Mercado Obsidiana", "gx": 11, "gy": 10, "tax_rate": 0.13},
        ],
        "resources": [
            {"gx": 4, "gy": 4, "icon": "⛏"},
            {"gx": 9, "gy": 3, "icon": "🪨"},
            {"gx": 10, "gy": 9, "icon": "💎"},
            {"gx": 3, "gy": 8, "icon": "🦴"},
        ],
    },
    {
        "id": 3,
        "cities": [
            {"id": "myriath-bloomhall", "name": "Bloomhall", "gx": 2, "gy": 2, "tax_rate": 0.06},
            {"id": "hollowmere-ferry", "name": "Balsa Hollowmere", "gx": 11, "gy": 10, "tax_rate": 0.09},
        ],
        "resources": [
            {"gx": 4, "gy": 4, "icon": "🪷"},
            {"gx": 9, "gy": 4, "icon": "🌿"},
            {"gx": 11, "gy": 8, "icon": "🐚"},
            {"gx": 2, "gy": 9, "icon": "🧪"},
        ],
    },
    {
        "id": 4,
        "cities": [
            {"id": "astreon-crossing", "name": "Crossing Astreon", "gx": 2, "gy": 2, "tax_rate": 0.08},
            {"id": "bluewake-outpost", "name": "Outpost Bluewake", "gx": 11, "gy": 10, "tax_rate": 0.12},
        ],
        "resources": [
            {"gx": 4, "gy": 3, "icon": "🧊"},
            {"gx": 9, "gy": 3, "icon": "💠"},
            {"gx": 10, "gy": 8, "icon": "🪨"},
            {"gx": 3, "gy": 8, "icon": "🐾"},
        ],
    },
]


def _expand_territory_world_maps(base_maps: list[dict[str, Any]], total_maps: int) -> list[dict[str, Any]]:
    expanded: list[dict[str, Any]] = []
    for map_id in range(total_maps):
        template = base_maps[map_id % len(base_maps)]
        cities = []
        for index, city in enumerate(template.get("cities", []), start=1):
            cities.append(
                {
                    "id": f"{str(city.get('id') or 'city')}-m{map_id}-{index}",
                    "name": str(city.get("name") or f"Cidade {index}"),
                    "gx": int(city.get("gx") or 0),
                    "gy": int(city.get("gy") or 0),
                    "tax_rate": float(city.get("tax_rate") or 0.1),
                }
            )

        resources = [
            {
                "gx": int(node.get("gx") or 0),
                "gy": int(node.get("gy") or 0),
                "icon": str(node.get("icon") or "🪨"),
            }
            for node in template.get("resources", [])
        ]

        expanded.append({"id": map_id, "cities": cities, "resources": resources})
    return expanded


TERRITORY_WORLD_MAPS: list[dict[str, Any]] = _expand_territory_world_maps(TERRITORY_WORLD_BASE_MAPS, TERRITORY_TOTAL_MAPS)

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
    auto_role: str = ""
    leave_enabled: bool = False
    leave_channel: str = ""
    leave_title: str = "Ate logo, {member}."
    leave_description: str = "{member} saiu de **{guild}**."
    leave_color: str = "#ef476f"


class VoiceDropsSettings(BaseModel):
    enabled: bool = False
    announce_channel: str = ""
    interval_minutes: int = Field(default=15, ge=5, le=120)
    reminder_minutes: int = Field(default=15, ge=0, le=120)
    min_members: int = Field(default=2, ge=2, le=25)
    reward_min: int = Field(default=20, ge=1, le=100000)
    reward_max: int = Field(default=45, ge=1, le=100000)
    daily_cap: int = Field(default=500, ge=1, le=1000000)
    party_bonus_percent: int = Field(default=10, ge=0, le=500)


class DashboardState(BaseModel):
    guild: GuildSettings
    moderation: ModerationSettings
    automation: AutomationSettings
    warnings: WarningSystemSettings
    logs: LogSettings
    modmail: ModmailSettings
    entry_exit: EntryExitEmbedSettings
    voice_drops: VoiceDropsSettings
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


class VoiceDropsUpdatePayload(BaseModel):
    enabled: bool = False
    announce_channel: str = ""
    interval_minutes: int = Field(default=15, ge=5, le=120)
    reminder_minutes: int = Field(default=15, ge=0, le=120)
    min_members: int = Field(default=2, ge=2, le=25)
    reward_min: int = Field(default=20, ge=1, le=100000)
    reward_max: int = Field(default=45, ge=1, le=100000)
    daily_cap: int = Field(default=500, ge=1, le=1000000)
    party_bonus_percent: int = Field(default=10, ge=0, le=500)


class AutoModSimulationPayload(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class PresetApplyPayload(BaseModel):
    preset_name: str = Field(pattern="^(gamer|study|creator|support|large-community)$")
    target: str = Field(default="production", pattern="^(production|staging)$")


class DashboardRoleUpdatePayload(BaseModel):
    user_id: str
    role: str = Field(pattern="^(admin|moderator|viewer)$")


class LevelingSettingsPayload(BaseModel):
    leveling_enabled: bool
    xp_multiplier: float = Field(default=1.0, ge=0.1, le=10.0)
    cooldown_seconds: int = Field(default=45, ge=5, le=3600)
    level_up_message: str = Field(default="Congratulations {user}, you have reached level {level}!", max_length=500)


class EconomyBuyPayload(BaseModel):
    item_key: str = Field(min_length=1, max_length=64)
    quantity: int = Field(default=1, ge=1, le=50)


class EconomyUsePayload(BaseModel):
    item_key: str = Field(min_length=1, max_length=64)


class TerritoryActionPayload(BaseModel):
    territory_id: int = Field(ge=1)


class TerritoryUpgradePayload(BaseModel):
    territory_id: int = Field(ge=1)
    tier: int = Field(ge=1, le=3)


class TerritoryGatherPayload(BaseModel):
    map_id: int = Field(ge=0)
    node_gx: int = Field(ge=0)
    node_gy: int = Field(ge=0)
    node_icon: str = Field(min_length=1, max_length=8)


class TerritorySellPayload(BaseModel):
    map_id: int = Field(ge=0)
    city_id: str = Field(min_length=1, max_length=80)


class TerritorySeasonClaimPayload(BaseModel):
    map_id: int = Field(ge=0)


class BlogPostCreatePayload(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    content: str = Field(min_length=10, max_length=12000)
    is_published: bool = True


class MKScriptLaunchPayload(BaseModel):
    blocks: int = Field(default=0, ge=0, le=5000)
    links: int = Field(default=0, ge=0, le=10000)
    validation_status: str = Field(default="Draft", max_length=32)
    flow_summary: str = Field(default="", max_length=320)


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
    modmail_auto_close_hours,
    voice_drops_enabled,
    voice_drops_channel_id,
    voice_drops_interval_minutes,
    voice_drops_reminder_minutes,
    voice_drops_min_members,
    voice_drops_min_amount,
    voice_drops_max_amount,
    voice_drops_daily_cap,
    voice_drops_party_bonus_percent
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
        "voice_drops": updated_state.get("voice_drops", {}),
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
        "voice_drops": previous_state.get("voice_drops", {}),
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
        "entry_exit.auto_role": "Join auto-role",
        "entry_exit.leave_enabled": "Leave embed",
        "entry_exit.leave_channel": "Leave channel",
        "entry_exit.leave_title": "Leave title",
        "entry_exit.leave_description": "Leave description",
        "entry_exit.leave_color": "Leave color",
        "voice_drops.enabled": "Voice drops",
        "voice_drops.announce_channel": "Voice drops announce channel",
        "voice_drops.interval_minutes": "Voice drops interval",
        "voice_drops.reminder_minutes": "Voice drops reminder",
        "voice_drops.min_members": "Voice drops minimum members",
        "voice_drops.reward_min": "Voice drops minimum reward",
        "voice_drops.reward_max": "Voice drops maximum reward",
        "voice_drops.daily_cap": "Voice drops daily cap",
        "voice_drops.party_bonus_percent": "Voice drops party bonus",
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


async def _bootstrap_database(app: FastAPI) -> None:
    pool = await _connect_database_pool()
    if pool is None:
        return

    app.state.db_pool = pool
    try:
        await _ensure_dashboard_tables(pool)
    except Exception as exc:
        print(f"[Dashboard] Deferred database initialization failed: {exc}")


async def _ensure_dashboard_tables(pool: Any) -> None:
    try:
        async with pool.acquire() as connection:
            await connection.execute("ALTER TABLE moderation_logs ADD COLUMN IF NOT EXISTS channel_id BIGINT")
            await connection.execute("ALTER TABLE guilds ADD COLUMN IF NOT EXISTS voice_drops_enabled BOOLEAN NOT NULL DEFAULT FALSE")
            await connection.execute("ALTER TABLE guilds ADD COLUMN IF NOT EXISTS voice_drops_channel_id BIGINT")
            await connection.execute("ALTER TABLE guilds ADD COLUMN IF NOT EXISTS voice_drops_interval_minutes INT NOT NULL DEFAULT 15")
            await connection.execute("ALTER TABLE guilds ADD COLUMN IF NOT EXISTS voice_drops_reminder_minutes INT NOT NULL DEFAULT 15")
            await connection.execute("ALTER TABLE guilds ADD COLUMN IF NOT EXISTS voice_drops_min_members INT NOT NULL DEFAULT 2")
            await connection.execute("ALTER TABLE guilds ADD COLUMN IF NOT EXISTS voice_drops_min_amount INT NOT NULL DEFAULT 20")
            await connection.execute("ALTER TABLE guilds ADD COLUMN IF NOT EXISTS voice_drops_max_amount INT NOT NULL DEFAULT 45")
            await connection.execute("ALTER TABLE guilds ADD COLUMN IF NOT EXISTS voice_drops_daily_cap INT NOT NULL DEFAULT 500")
            await connection.execute("ALTER TABLE guilds ADD COLUMN IF NOT EXISTS voice_drops_party_bonus_percent INT NOT NULL DEFAULT 10")
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
                    auto_role_id BIGINT,
                    leave_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    leave_channel_id BIGINT,
                    leave_title VARCHAR(256),
                    leave_description TEXT,
                    leave_color VARCHAR(16),
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            await connection.execute("ALTER TABLE guild_entry_exit_embeds ADD COLUMN IF NOT EXISTS auto_role_id BIGINT")
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
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS economy (
                    user_id BIGINT PRIMARY KEY,
                    balance INT NOT NULL DEFAULT 0,
                    last_daily TIMESTAMPTZ,
                    last_weekly TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS shop_items (
                    item_key VARCHAR(64) PRIMARY KEY,
                    item_name VARCHAR(120) NOT NULL,
                    item_description TEXT NOT NULL,
                    price INT NOT NULL,
                    category VARCHAR(32) NOT NULL DEFAULT 'utility',
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS user_inventory (
                    user_id BIGINT NOT NULL,
                    item_key VARCHAR(64) NOT NULL REFERENCES shop_items(item_key) ON DELETE CASCADE,
                    quantity INT NOT NULL DEFAULT 0,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, item_key)
                )
                """
            )
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS user_item_effects (
                    user_id BIGINT NOT NULL,
                    effect_key VARCHAR(64) NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, effect_key)
                )
                """
            )
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS user_profile_badges (
                    user_id BIGINT NOT NULL,
                    badge_key VARCHAR(64) NOT NULL,
                    unlocked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, badge_key)
                )
                """
            )
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS economy_seasons (
                    season_key VARCHAR(16) PRIMARY KEY,
                    starts_at TIMESTAMP NOT NULL,
                    ends_at TIMESTAMP NOT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS economy_transactions (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    guild_id BIGINT,
                    delta INT NOT NULL,
                    balance_after INT,
                    tx_type VARCHAR(32) NOT NULL,
                    metadata JSONB,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS territories (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    owner_id BIGINT,
                    called_at TIMESTAMP,
                    attack_time TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    luma_coins INT NOT NULL DEFAULT 100,
                    owner_reward_coins INT NOT NULL DEFAULT 25,
                    defense_level INT NOT NULL DEFAULT 1
                )
                """
            )
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS territory_resource_inventory (
                    user_id BIGINT NOT NULL,
                    resource_key VARCHAR(120) NOT NULL,
                    resource_name VARCHAR(80) NOT NULL,
                    quality VARCHAR(16) NOT NULL,
                    icon VARCHAR(8) NOT NULL,
                    quantity INT NOT NULL DEFAULT 0,
                    total_value INT NOT NULL DEFAULT 0,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, resource_key)
                )
                """
            )
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS territory_resource_cooldowns (
                    user_id BIGINT NOT NULL,
                    map_id INT NOT NULL,
                    node_key VARCHAR(64) NOT NULL,
                    available_at TIMESTAMP NOT NULL,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, map_id, node_key)
                )
                """
            )
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS territory_season_points (
                    user_id BIGINT PRIMARY KEY,
                    total_points INT NOT NULL DEFAULT 0,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS territory_season_claims (
                    user_id BIGINT NOT NULL,
                    map_id INT NOT NULL,
                    day_key DATE NOT NULL,
                    points INT NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, map_id, day_key)
                )
                """
            )
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS user_voice_drops_daily (
                    guild_id BIGINT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
                    user_id BIGINT NOT NULL,
                    day_key DATE NOT NULL,
                    total_amount INT NOT NULL DEFAULT 0,
                    total_intervals INT NOT NULL DEFAULT 0,
                    last_drop_at TIMESTAMP,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (guild_id, user_id, day_key)
                )
                """
            )
            await connection.execute(
                """
                CREATE TABLE IF NOT EXISTS blog_posts (
                    id BIGSERIAL PRIMARY KEY,
                    author_user_id BIGINT NOT NULL,
                    author_name VARCHAR(120),
                    title VARCHAR(160) NOT NULL,
                    slug VARCHAR(180) NOT NULL UNIQUE,
                    content TEXT NOT NULL,
                    is_published BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    published_at TIMESTAMP
                )
                """
            )
            await connection.execute("CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(is_published, published_at DESC)")
            await connection.execute("CREATE INDEX IF NOT EXISTS idx_economy_transactions_user_time ON economy_transactions(user_id, created_at)")
            await connection.execute("CREATE INDEX IF NOT EXISTS idx_economy_transactions_type_time ON economy_transactions(tx_type, created_at)")
            await connection.execute("CREATE INDEX IF NOT EXISTS idx_economy_transactions_guild_time ON economy_transactions(guild_id, created_at)")
            await connection.execute("CREATE INDEX IF NOT EXISTS idx_territories_owner_id ON territories(owner_id)")
            await connection.execute("CREATE INDEX IF NOT EXISTS idx_territory_resource_inventory_user ON territory_resource_inventory(user_id)")
            await connection.execute("CREATE INDEX IF NOT EXISTS idx_territory_resource_cooldowns_user ON territory_resource_cooldowns(user_id)")
            await connection.execute("CREATE INDEX IF NOT EXISTS idx_territory_season_claims_user_day ON territory_season_claims(user_id, day_key)")
            await connection.execute("CREATE INDEX IF NOT EXISTS idx_user_voice_drops_daily_guild_day ON user_voice_drops_daily(guild_id, day_key)")
            await connection.execute("CREATE INDEX IF NOT EXISTS idx_user_voice_drops_daily_user_day ON user_voice_drops_daily(user_id, day_key)")
            await connection.execute("ALTER TABLE guild_raid_settings ADD COLUMN IF NOT EXISTS mode VARCHAR(16) NOT NULL DEFAULT 'lockdown'")
            await connection.execute("ALTER TABLE guild_raid_settings ADD COLUMN IF NOT EXISTS recovery_cooldown_minutes INT NOT NULL DEFAULT 10")
            await connection.execute("ALTER TABLE territories ADD COLUMN IF NOT EXISTS owner_reward_coins INT NOT NULL DEFAULT 25")
            await connection.execute("ALTER TABLE territories ADD COLUMN IF NOT EXISTS luma_coins INT NOT NULL DEFAULT 100")
            await connection.execute("ALTER TABLE territories ADD COLUMN IF NOT EXISTS defense_level INT NOT NULL DEFAULT 1")
            await connection.execute("ALTER TABLE territories ADD COLUMN IF NOT EXISTS owner_faction VARCHAR(80)")
            await connection.execute("ALTER TABLE territories ADD COLUMN IF NOT EXISTS faction_attack_active BOOLEAN NOT NULL DEFAULT FALSE")
            await connection.execute("ALTER TABLE territories ADD COLUMN IF NOT EXISTS faction_name VARCHAR(80)")
            await connection.execute("ALTER TABLE territories ADD COLUMN IF NOT EXISTS faction_attack_started_at TIMESTAMP")
            await connection.execute("ALTER TABLE territories ADD COLUMN IF NOT EXISTS faction_attack_ends_at TIMESTAMP")
            await connection.execute("ALTER TABLE territories ADD COLUMN IF NOT EXISTS last_faction_attack_at TIMESTAMP")
            await connection.execute("ALTER TABLE territories ADD COLUMN IF NOT EXISTS last_faction_result VARCHAR(32)")
            await connection.execute("ALTER TABLE territories ADD COLUMN IF NOT EXISTS last_faction_result_at TIMESTAMP")
            await connection.execute(
                """
                INSERT INTO territories (name)
                SELECT v.name
                FROM (
                    VALUES
                        ('Kingsfall'),
                        ('Ironcrest'),
                        ('Stormhold'),
                        ('Goldhaven'),
                        ('Highwatch'),
                        ('Redstone Keep'),
                        ('Frostguard'),
                        ('Valoria'),
                        ('Drakenfell'),
                        ('Thornwall')
                ) AS v(name)
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM territories t
                    WHERE LOWER(t.name) = LOWER(v.name)
                )
                """
            )
            await connection.execute(
                """
                INSERT INTO shop_items (item_key, item_name, item_description, price, category, is_active)
                VALUES
                    ('xp_boost_1h', 'XP Boost 1h', 'Active your leveling journey: grants a personal XP bonus token for 1 hour.', 350, 'boost', TRUE),
                    ('lucky_crate', 'Lucky Crate', 'A crate with random economy surprises (future expansion item).', 500, 'crate', TRUE),
                    ('profile_badge', 'Profile Badge', 'Collectible profile badge to show your support in profile cards.', 750, 'cosmetic', TRUE)
                ON CONFLICT (item_key) DO NOTHING
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


def _territory_score(row: dict[str, Any]) -> int:
    owned_count = int(row.get("owned_count") or 0)
    total_defense = int(row.get("total_defense") or 0)
    reward_rate = int(row.get("reward_rate") or 0)
    conquest_pot = int(row.get("conquest_pot") or 0)
    return (owned_count * 180) + (total_defense * 35) + (reward_rate * 4) + (conquest_pot // 10)


def _territory_league_for_score(score: int) -> str:
    for league_name, minimum_score in TERRITORY_LEAGUES:
        if score >= minimum_score:
            return league_name
    return "Abismo"


def _territory_world_by_map() -> dict[int, dict[str, Any]]:
    return {int(item["id"]): item for item in TERRITORY_WORLD_MAPS}


def _territory_resource_name(icon: str) -> str:
    return TERRITORY_RESOURCE_BASE_NAME.get(icon, "Recurso")


def _territory_quality_from_roll(roll: int) -> str:
    for max_roll, label in TERRITORY_RESOURCE_QUALITY_TABLE:
        if roll <= max_roll:
            return label
    return "Comum"


def _territory_world_payload() -> dict[str, Any]:
    return {
        "maps": [
            {
                "id": int(map_item["id"]),
                "cities": [
                    {
                        "id": str(city["id"]),
                        "name": str(city["name"]),
                        "gx": int(city["gx"]),
                        "gy": int(city["gy"]),
                        "tax_rate": float(city["tax_rate"]),
                    }
                    for city in map_item.get("cities", [])
                ],
            }
            for map_item in TERRITORY_WORLD_MAPS
        ],
        "gather_cooldown_seconds": TERRITORY_RESOURCE_GATHER_COOLDOWN_SECONDS,
    }


def _territory_prime_window_closed(map_id: int, now: datetime | None = None) -> bool:
    moment = now or datetime.utcnow()
    schedule = TERRITORY_PRIME_SCHEDULE_BY_MAP.get(int(map_id))
    if schedule is None:
        return False
    current_minutes = moment.hour * 60 + moment.minute
    end_minutes = int(schedule["end_hour"]) * 60 + int(schedule.get("end_minute", 0))
    return current_minutes >= end_minutes


async def _process_faction_activity(connection: Any) -> list[dict[str, Any]]:
    now = datetime.utcnow()
    alerts_started: list[dict[str, Any]] = []
    rows = await connection.fetch(
        """
        SELECT
            id,
            name,
            owner_id,
            owner_faction,
            defense_level,
            faction_attack_active,
            faction_name,
            faction_attack_ends_at,
            last_faction_attack_at
        FROM territories
        FOR UPDATE
        """
    )

    for row in rows:
        territory_id = int(row.get("id") or 0)
        owner_id = _extract_discord_id(row.get("owner_id"))
        owner_faction = str(row.get("owner_faction") or "").strip() or None
        defense_level = int(row.get("defense_level") or 1)
        active = bool(row.get("faction_attack_active"))
        faction_name = str(row.get("faction_name") or "").strip() or random.choice(TERRITORY_FACTIONS)
        ends_at = row.get("faction_attack_ends_at")
        last_attack_at = row.get("last_faction_attack_at")

        if active and ends_at is not None:
            ends_dt = ends_at.replace(tzinfo=None) if getattr(ends_at, "tzinfo", None) else ends_at
            if ends_dt <= now:
                faction_wins = False
                if owner_id is not None:
                    faction_win_chance = min(0.8, max(0.22, 0.66 - (defense_level * 0.08)))
                    faction_wins = random.random() < faction_win_chance

                if faction_wins:
                    await connection.execute(
                        """
                        UPDATE territories
                        SET
                            owner_id = NULL,
                            owner_faction = $1,
                            called_at = CURRENT_TIMESTAMP,
                            attack_time = CURRENT_TIMESTAMP,
                            faction_attack_active = FALSE,
                            faction_name = NULL,
                            faction_attack_started_at = NULL,
                            faction_attack_ends_at = NULL,
                            last_faction_result = 'lost_to_faction',
                            last_faction_result_at = CURRENT_TIMESTAMP
                        WHERE id = $2
                        """,
                        faction_name,
                        territory_id,
                    )
                else:
                    await connection.execute(
                        """
                        UPDATE territories
                        SET
                            faction_attack_active = FALSE,
                            faction_name = NULL,
                            faction_attack_started_at = NULL,
                            faction_attack_ends_at = NULL,
                            last_faction_result = 'faction_failed',
                            last_faction_result_at = CURRENT_TIMESTAMP
                        WHERE id = $1
                        """,
                        territory_id,
                    )
                continue

        if active:
            continue
        if owner_id is None:
            continue
        if owner_faction is not None:
            continue

        if last_attack_at is not None:
            last_attack_dt = last_attack_at.replace(tzinfo=None) if getattr(last_attack_at, "tzinfo", None) else last_attack_at
            elapsed = (now - last_attack_dt).total_seconds()
            if elapsed < TERRITORY_FACTION_ATTACK_MIN_INTERVAL_SECONDS:
                continue

        if random.random() > 0.18:
            continue

        selected_faction = random.choice(TERRITORY_FACTIONS)
        ends_at_new = now + timedelta(minutes=TERRITORY_FACTION_ATTACK_DURATION_MINUTES)
        await connection.execute(
            """
            UPDATE territories
            SET
                faction_attack_active = TRUE,
                faction_name = $1,
                faction_attack_started_at = CURRENT_TIMESTAMP,
                faction_attack_ends_at = $2,
                last_faction_attack_at = CURRENT_TIMESTAMP,
                last_faction_result = 'invasion_started',
                last_faction_result_at = CURRENT_TIMESTAMP
            WHERE id = $3
            """,
            selected_faction,
            ends_at_new,
            territory_id,
        )
        alerts_started.append(
            {
                "territory_id": territory_id,
                "territory_name": str(row.get("name") or "Território"),
                "owner_id": str(owner_id),
                "faction_name": selected_faction,
                "ends_at": ends_at_new.isoformat(),
                "event_type": "faction_started",
            }
        )

    return alerts_started


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


async def _fetch_guild_member_display_names(guild_id: str, user_ids: list[Any]) -> dict[str, str]:
    token = os.getenv("DISCORD_BOT_TOKEN", "").strip()
    if not token:
        return {}

    normalized_ids: list[str] = []
    seen_ids: set[str] = set()
    for user_id in user_ids:
        user_id_str = str(user_id or "").strip()
        if not user_id_str or user_id_str in seen_ids:
            continue
        seen_ids.add(user_id_str)
        normalized_ids.append(user_id_str)

    if not normalized_ids:
        return {}

    auth_header = {"Authorization": f"Bot {token}"}

    async def _fetch_one(user_id: str) -> tuple[str, str | None]:
        try:
            response = await asyncio.to_thread(
                _discord_request,
                f"{DISCORD_API_BASE}/guilds/{guild_id}/members/{user_id}",
                method="GET",
                headers=auth_header,
            )
        except Exception:
            return user_id, None

        if not isinstance(response, dict):
            return user_id, None

        user = response.get("user") if isinstance(response.get("user"), dict) else {}
        nickname = str(response.get("nick") or "").strip()
        global_name = str(user.get("global_name") or "").strip()
        username = str(user.get("username") or "").strip()
        display_name = nickname or global_name or username
        return user_id, (display_name or None)

    results = await asyncio.gather(*(_fetch_one(user_id) for user_id in normalized_ids))
    return {user_id: display_name for user_id, display_name in results if display_name}


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
                    auto_role_id,
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

    voice_drops_enabled = row.get("voice_drops_enabled")
    if voice_drops_enabled is not None:
        state["voice_drops"]["enabled"] = bool(voice_drops_enabled)

    voice_drops_channel_id = row.get("voice_drops_channel_id")
    if voice_drops_channel_id is not None:
        state["voice_drops"]["announce_channel"] = _id_to_input_value(voice_drops_channel_id, state["voice_drops"].get("announce_channel", ""))

    for source_key, target_key in (
        ("voice_drops_interval_minutes", "interval_minutes"),
        ("voice_drops_reminder_minutes", "reminder_minutes"),
        ("voice_drops_min_members", "min_members"),
        ("voice_drops_min_amount", "reward_min"),
        ("voice_drops_max_amount", "reward_max"),
        ("voice_drops_daily_cap", "daily_cap"),
        ("voice_drops_party_bonus_percent", "party_bonus_percent"),
    ):
        source_value = row.get(source_key)
        if source_value is not None:
            state["voice_drops"][target_key] = int(source_value)

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
        state["entry_exit"]["auto_role"] = _id_to_input_value(entry_exit_embed.get("auto_role_id"), state["entry_exit"].get("auto_role", ""))
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
    auto_role_id = _extract_discord_id(entry_exit.get("auto_role"))
    leave_channel_id = _extract_discord_id(entry_exit.get("leave_channel"))
    voice_drops = state.get("voice_drops", {})
    reward_min = max(1, int(voice_drops.get("reward_min") or 20))
    reward_max = max(reward_min, int(voice_drops.get("reward_max") or 45))
    reminder_minutes = max(0, min(int(voice_drops.get("reminder_minutes") or 15), int(voice_drops.get("interval_minutes") or 15)))
    voice_drops_channel_id = _extract_discord_id(voice_drops.get("announce_channel"))

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
                    voice_drops_enabled,
                    voice_drops_channel_id,
                    voice_drops_interval_minutes,
                    voice_drops_reminder_minutes,
                    voice_drops_min_members,
                    voice_drops_min_amount,
                    voice_drops_max_amount,
                    voice_drops_daily_cap,
                    voice_drops_party_bonus_percent,
                    modmail_auto_close_hours,
                    updated_at
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9,
                    $10, $11, $12, $13, $14, $15, $16, $17, $18,
                    $19, $20, $21, $22, $23, $24, $25, $26, $27,
                    $28, $29, $30, $31, $32, $33, $34, $35, $36, CURRENT_TIMESTAMP
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
                    voice_drops_enabled = EXCLUDED.voice_drops_enabled,
                    voice_drops_channel_id = EXCLUDED.voice_drops_channel_id,
                    voice_drops_interval_minutes = EXCLUDED.voice_drops_interval_minutes,
                    voice_drops_reminder_minutes = EXCLUDED.voice_drops_reminder_minutes,
                    voice_drops_min_members = EXCLUDED.voice_drops_min_members,
                    voice_drops_min_amount = EXCLUDED.voice_drops_min_amount,
                    voice_drops_max_amount = EXCLUDED.voice_drops_max_amount,
                    voice_drops_daily_cap = EXCLUDED.voice_drops_daily_cap,
                    voice_drops_party_bonus_percent = EXCLUDED.voice_drops_party_bonus_percent,
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
                bool(voice_drops.get("enabled")),
                voice_drops_channel_id,
                max(5, int(voice_drops.get("interval_minutes") or 15)),
                reminder_minutes,
                max(2, int(voice_drops.get("min_members") or 2)),
                reward_min,
                reward_max,
                max(reward_max, int(voice_drops.get("daily_cap") or 500)),
                max(0, int(voice_drops.get("party_bonus_percent") or 10)),
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
                    auto_role_id,
                    leave_enabled,
                    leave_channel_id,
                    leave_title,
                    leave_description,
                    leave_color,
                    updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
                ON CONFLICT (guild_id)
                DO UPDATE SET
                    welcome_enabled = EXCLUDED.welcome_enabled,
                    welcome_channel_id = EXCLUDED.welcome_channel_id,
                    welcome_title = EXCLUDED.welcome_title,
                    welcome_description = EXCLUDED.welcome_description,
                    welcome_color = EXCLUDED.welcome_color,
                    auto_role_id = EXCLUDED.auto_role_id,
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
                auto_role_id,
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


def _require_session_user_id(request: Request) -> int:
    user = request.session.get("user")
    user_id = _extract_discord_id(user.get("id") if isinstance(user, dict) else None)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Authenticated user id missing")
    return user_id


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


def _season_bounds() -> tuple[str, datetime, datetime]:
    now = datetime.utcnow()
    season_key = now.strftime("%Y-%m")
    starts_at = datetime(now.year, now.month, 1)
    if now.month == 12:
        ends_at = datetime(now.year + 1, 1, 1)
    else:
        ends_at = datetime(now.year, now.month + 1, 1)
    return season_key, starts_at, ends_at


def _slugify_blog_title(title: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", str(title).lower()).strip("-")
    if not cleaned:
        cleaned = "post"
    return cleaned[:120]


async def _fetch_important_events(guild_id: str, limit: int = 30) -> list[dict[str, Any]]:
    logs = await _fetch_audit_logs(guild_id, period="30d", limit=max(10, min(limit, 200)))
    merged: list[dict[str, Any]] = []

    for item in logs:
        merged.append(
            {
                "source": "audit",
                "kind": str(item.get("action") or "unknown"),
                "severity": "medium" if str(item.get("action") or "").startswith("automod") else "low",
                "created_at": str(item.get("created_at") or ""),
                "detail": str(item.get("reason") or item.get("action") or "Audit event"),
                "data": item,
            }
        )

    pool = _db_pool()
    guild_id_int = _extract_discord_id(guild_id)
    if pool is None or guild_id_int is None:
        merged.sort(key=lambda e: str(e.get("created_at") or ""), reverse=True)
        return merged[:limit]

    try:
        async with pool.acquire() as connection:
            raid_rows = await connection.fetch(
                """
                SELECT id, join_count, window_seconds, action, lock_until, happened_at, notes
                FROM raid_incidents
                WHERE guild_id = $1
                ORDER BY happened_at DESC
                LIMIT $2
                """,
                guild_id_int,
                max(10, min(limit, 200)),
            )
            econ_rows = await connection.fetch(
                """
                SELECT id, user_id, delta, tx_type, metadata, created_at
                FROM economy_transactions
                WHERE guild_id = $1
                ORDER BY created_at DESC
                LIMIT $2
                """,
                guild_id_int,
                max(10, min(limit, 200)),
            )
    except Exception:
        raid_rows = []
        econ_rows = []

    for row in raid_rows:
        happened_at = row.get("happened_at")
        severity = "critical" if int(row.get("join_count") or 0) >= 12 else "high"
        merged.append(
            {
                "source": "raid",
                "kind": "raid_incident",
                "severity": severity,
                "created_at": happened_at.isoformat() if happened_at and hasattr(happened_at, "isoformat") else "",
                "detail": f"Raid guard triggered: {int(row.get('join_count') or 0)} joins/{int(row.get('window_seconds') or 0)}s",
                "data": {
                    "id": int(row.get("id") or 0),
                    "action": str(row.get("action") or "kick"),
                    "lock_until": row.get("lock_until").isoformat() if row.get("lock_until") and hasattr(row.get("lock_until"), "isoformat") else None,
                    "notes": str(row.get("notes") or ""),
                },
            }
        )

    for row in econ_rows:
        created_at = row.get("created_at")
        delta = int(row.get("delta") or 0)
        tx_type = str(row.get("tx_type") or "unknown")
        severity = "medium" if abs(delta) >= 1000 or tx_type.startswith("transfer") else "low"
        merged.append(
            {
                "source": "economy",
                "kind": tx_type,
                "severity": severity,
                "created_at": created_at.isoformat() if created_at and hasattr(created_at, "isoformat") else "",
                "detail": f"{tx_type}: {delta:+d} Lumicoins",
                "data": {
                    "id": int(row.get("id") or 0),
                    "user_id": str(row.get("user_id") or ""),
                    "delta": delta,
                    "metadata": row.get("metadata") if isinstance(row.get("metadata"), dict) else {},
                },
            }
        )

    merged.sort(key=lambda e: str(e.get("created_at") or ""), reverse=True)
    return merged[:limit]


async def _detect_smart_alerts(guild_id: str, state: dict[str, Any]) -> list[dict[str, Any]]:
    logs = await _fetch_audit_logs(guild_id, period="24h", limit=500)
    now = datetime.utcnow()
    alert_items: list[dict[str, Any]] = []
    guild_id_int = _extract_discord_id(guild_id)

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

    pool = _db_pool()
    if pool is not None and guild_id_int is not None:
        try:
            async with pool.acquire() as connection:
                raid_count = await connection.fetchval(
                    """
                    SELECT COUNT(*)
                    FROM raid_incidents
                    WHERE guild_id = $1
                      AND happened_at >= CURRENT_TIMESTAMP - INTERVAL '30 minutes'
                    """,
                    guild_id_int,
                )
                transfer_spike = await connection.fetchrow(
                    """
                    SELECT COALESCE(MAX(cnt), 0) AS max_cnt, COALESCE(MAX(volume), 0) AS max_volume
                    FROM (
                        SELECT user_id, COUNT(*) AS cnt, SUM(ABS(delta)) AS volume
                        FROM economy_transactions
                        WHERE guild_id = $1
                          AND tx_type IN ('transfer_out', 'transfer_in')
                          AND created_at >= CURRENT_TIMESTAMP - INTERVAL '15 minutes'
                        GROUP BY user_id
                    ) t
                    """,
                    guild_id_int,
                )
        except Exception:
            raid_count = 0
            transfer_spike = None

        if int(raid_count or 0) >= 1:
            alert_items.append(
                {
                    "type": "raid_incident",
                    "severity": "critical",
                    "title": "Raid incident registered",
                    "detail": f"{int(raid_count or 0)} raid incident(s) in the last 30 minutes.",
                }
            )

        max_cnt = int(transfer_spike.get("max_cnt") or 0) if transfer_spike else 0
        max_volume = int(transfer_spike.get("max_volume") or 0) if transfer_spike else 0
        if max_cnt >= 6 or max_volume >= 5000:
            alert_items.append(
                {
                    "type": "economy_transfer_spike",
                    "severity": "high",
                    "title": "Suspicious economy movement",
                    "detail": f"A user made {max_cnt} transfer operations (volume {max_volume}) in 15 minutes.",
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
        "voice_drops": VoiceDropsSettings().model_dump(),
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
    normalized["voice_drops"].update(raw_state.get("voice_drops", {}))

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

    interval_minutes = max(5, int(normalized["voice_drops"].get("interval_minutes") or 15))
    reminder_minutes = max(0, int(normalized["voice_drops"].get("reminder_minutes") or 15))
    reward_min = max(1, int(normalized["voice_drops"].get("reward_min") or 20))
    reward_max = max(reward_min, int(normalized["voice_drops"].get("reward_max") or 45))
    normalized["voice_drops"]["interval_minutes"] = min(interval_minutes, 120)
    normalized["voice_drops"]["reminder_minutes"] = min(reminder_minutes, normalized["voice_drops"]["interval_minutes"])
    normalized["voice_drops"]["reward_min"] = reward_min
    normalized["voice_drops"]["reward_max"] = reward_max
    normalized["voice_drops"]["daily_cap"] = max(reward_max, int(normalized["voice_drops"].get("daily_cap") or 500))
    normalized["voice_drops"]["min_members"] = max(2, int(normalized["voice_drops"].get("min_members") or 2))
    normalized["voice_drops"]["party_bonus_percent"] = max(0, int(normalized["voice_drops"].get("party_bonus_percent") or 10))

    available_cogs = _read_available_cogs()
    loaded_cogs = raw_state.get("cogs", {})
    normalized["cogs"] = {name: bool(loaded_cogs.get(name, True)) for name in available_cogs}
    return normalized


def _load_state_container() -> dict[str, Any]:
    if not STATE_FILE.exists():
        container = {"guild_states": {}, "staged_states": {}, "mk_scripts": {}}
        _save_state(container)
        return container

    try:
        with STATE_FILE.open("r", encoding="utf-8") as f:
            raw = json.load(f)
    except (json.JSONDecodeError, OSError):
        raw = {"guild_states": {}, "staged_states": {}, "mk_scripts": {}}

    container = {"guild_states": {}, "staged_states": {}, "mk_scripts": {}}
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

    if isinstance(raw, dict) and isinstance(raw.get("mk_scripts"), dict):
        for gid, status in raw.get("mk_scripts", {}).items():
            if not isinstance(gid, str) or not isinstance(status, dict):
                continue
            container["mk_scripts"][gid] = {
                "bot_active": bool(status.get("bot_active")),
                "launch_count": max(0, int(status.get("launch_count") or 0)),
                "last_launch_at": str(status.get("last_launch_at") or ""),
                "last_validation_status": str(status.get("last_validation_status") or ""),
                "last_flow_summary": str(status.get("last_flow_summary") or ""),
                "last_blocks": max(0, int(status.get("last_blocks") or 0)),
                "last_links": max(0, int(status.get("last_links") or 0)),
                "updated_by": str(status.get("updated_by") or ""),
            }

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


def _get_mk_script_status_for_guild(guild_id: str) -> dict[str, Any]:
    container = _load_state_container()
    status = container.setdefault("mk_scripts", {}).get(guild_id)
    if not isinstance(status, dict):
        return {
            "bot_active": False,
            "launch_count": 0,
            "last_launch_at": "",
            "last_validation_status": "",
            "last_flow_summary": "",
            "last_blocks": 0,
            "last_links": 0,
            "updated_by": "",
        }
    return status


def _set_mk_script_status_for_guild(guild_id: str, status: dict[str, Any]) -> dict[str, Any]:
    container = _load_state_container()
    mk_scripts = container.setdefault("mk_scripts", {})
    current = mk_scripts.get(guild_id) if isinstance(mk_scripts.get(guild_id), dict) else {}

    merged = {
        "bot_active": bool(status.get("bot_active", current.get("bot_active", False))),
        "launch_count": max(0, int(status.get("launch_count", current.get("launch_count", 0)) or 0)),
        "last_launch_at": str(status.get("last_launch_at", current.get("last_launch_at", "")) or ""),
        "last_validation_status": str(status.get("last_validation_status", current.get("last_validation_status", "")) or ""),
        "last_flow_summary": str(status.get("last_flow_summary", current.get("last_flow_summary", "")) or ""),
        "last_blocks": max(0, int(status.get("last_blocks", current.get("last_blocks", 0)) or 0)),
        "last_links": max(0, int(status.get("last_links", current.get("last_links", 0)) or 0)),
        "updated_by": str(status.get("updated_by", current.get("updated_by", "")) or ""),
    }

    mk_scripts[guild_id] = merged
    _save_state(container)
    return merged


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
    app.state.db_pool = None
    app.state.db_bootstrap_task = asyncio.create_task(_bootstrap_database(app))
    try:
        yield
    finally:
        bootstrap_task = getattr(app.state, "db_bootstrap_task", None)
        if bootstrap_task is not None and not bootstrap_task.done():
            bootstrap_task.cancel()
            with suppress(asyncio.CancelledError):
                await bootstrap_task

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


@app.get("/commands")
@app.get("/commands.html")
async def commands_page() -> FileResponse:
    return FileResponse(WEB_ROOT / "commands.html")


@app.get("/terms")
@app.get("/terms.html")
async def terms_page() -> Response:
    terms_path = WEB_ROOT / "terms.html"
    if terms_path.exists():
        return FileResponse(terms_path)

    fallback = """
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Luma Terms of Service</title></head>
<body>
<h1>Terms of Service</h1>
<p>By using the Luma bot, you agree to comply with Discord rules and applicable laws.</p>
<p>Server owners are responsible for moderator permissions and bot usage in their servers.</p>
<p>Service availability may vary due to maintenance, API limits, or infrastructure events.</p>
<p>Terms may be updated over time. Continued usage indicates acceptance of updates.</p>
</body>
</html>
"""
    return HTMLResponse(content=fallback)


@app.get("/privacy")
@app.get("/privacy.html")
async def privacy_page() -> Response:
    privacy_path = WEB_ROOT / "privacy.html"
    if privacy_path.exists():
        return FileResponse(privacy_path)

    fallback = """
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Luma Privacy Policy</title></head>
<body>
<h1>Privacy Policy</h1>
<p>Luma processes technical server data needed for bot and dashboard operation.</p>
<p>This may include guild configuration data, moderation logs, and support workflow records.</p>
<p>Luma does not sell personal data and uses data only for service operation and security.</p>
<p>This policy may be updated when technical or legal requirements change.</p>
</body>
</html>
"""
    return HTMLResponse(content=fallback)


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


@app.get("/dashboard/levels")
async def dashboard_levels(request: Request) -> Response:
    if not _is_authenticated(request):
        return RedirectResponse(url="/auth/login?next=/dashboard/levels", status_code=302)
    return FileResponse(WEB_ROOT / "dashboard" / "levels.html")


@app.get("/dashboard/economy")
async def dashboard_economy(request: Request) -> Response:
    if not _is_authenticated(request):
        return RedirectResponse(url="/auth/login?next=/dashboard/economy", status_code=302)
    return FileResponse(WEB_ROOT / "dashboard" / "economy.html")


@app.get("/dashboard/territories")
async def dashboard_territories(request: Request) -> Response:
    if not _is_authenticated(request):
        return RedirectResponse(url="/auth/login?next=/dashboard/territories", status_code=302)
    return FileResponse(WEB_ROOT / "dashboard" / "territories.html")


@app.get("/dashboard/style.css")
async def dashboard_territories_style() -> Response:
    return FileResponse(WEB_ROOT / "dashboard" / "style.css")


@app.get("/dashboard/scripts/{script_name}")
async def dashboard_territories_scripts(script_name: str) -> Response:
    allowed = {"map.js", "ui.js"}
    if script_name not in allowed:
        raise HTTPException(status_code=404, detail="Script not found")
    return FileResponse(WEB_ROOT / "dashboard" / "scripts" / script_name)


@app.get("/dashboard/blog")
async def dashboard_blog(request: Request) -> Response:
    if not _is_authenticated(request):
        return RedirectResponse(url="/auth/login?next=/dashboard/blog", status_code=302)
    return FileResponse(WEB_ROOT / "dashboard" / "blog.html")


@app.get("/dashboard/mk-script")
async def dashboard_mk_script(request: Request) -> Response:
    if not _is_authenticated(request):
        return RedirectResponse(url="/auth/login?next=/dashboard/mk-script", status_code=302)
    return FileResponse(WEB_ROOT / "dashboard" / "mk-script.html")


@app.get("/dashboard/entry-exit")
async def dashboard_entry_exit(request: Request) -> Response:
    if not _is_authenticated(request):
        return RedirectResponse(url="/auth/login?next=/dashboard/entry-exit", status_code=302)
    return FileResponse(WEB_ROOT / "dashboard" / "entry-exit.html")


@app.get("/api/dashboard/levels")
async def get_leveling_settings(request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id_str = str(active_guild.get("id"))

    try:
        guild_id_int = int(guild_id_str)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid guild id")

    pool = _db_pool()
    if pool is None:
        return {"ok": True, "active_guild_id": guild_id_str, "leveling_enabled": False, "xp_multiplier": 1.0, "cooldown_seconds": 45, "level_up_message": "Congratulations {user}, you have reached level {level}!", "leaderboard": []}

    try:
        async with pool.acquire() as connection:
            guild_row = await connection.fetchrow(
                "SELECT leveling_enabled FROM guilds WHERE guild_id = $1",
                guild_id_int,
            )
            settings_row = await connection.fetchrow(
                "SELECT xp_multiplier, cooldown_seconds, level_up_message FROM leveling_settings WHERE guild_id = $1",
                guild_id_int,
            )
            lb_rows = await connection.fetch(
                "SELECT user_id, xp, messages_count FROM user_levels WHERE guild_id = $1 ORDER BY xp DESC LIMIT 15",
                guild_id_int,
            )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    leveling_enabled = bool(guild_row["leveling_enabled"]) if guild_row and guild_row["leveling_enabled"] is not None else False
    xp_multiplier = float(settings_row["xp_multiplier"]) if settings_row and settings_row["xp_multiplier"] is not None else 1.0
    cooldown_seconds = int(settings_row["cooldown_seconds"]) if settings_row and settings_row["cooldown_seconds"] is not None else 45
    level_up_message = str(settings_row["level_up_message"] or "") if settings_row else "Congratulations {user}, you have reached level {level}!"
    member_names = await _fetch_guild_member_display_names(guild_id_str, [row["user_id"] for row in lb_rows])

    def _level_from_xp(xp: int) -> int:
        if xp <= 0:
            return 1
        return int((xp / 100) ** 0.5) + 1

    leaderboard = [
        {
            "rank": idx,
            "user_id": str(row["user_id"]),
            "display_name": member_names.get(str(row["user_id"])) or f"User {row['user_id']}",
            "xp": int(row["xp"]),
            "level": _level_from_xp(int(row["xp"])),
            "messages": int(row["messages_count"] or 0),
        }
        for idx, row in enumerate(lb_rows, start=1)
    ]

    return {
        "ok": True,
        "active_guild_id": guild_id_str,
        "leveling_enabled": leveling_enabled,
        "xp_multiplier": xp_multiplier,
        "cooldown_seconds": cooldown_seconds,
        "level_up_message": level_up_message,
        "leaderboard": leaderboard,
    }


@app.get("/api/dashboard/economy/overview")
async def dashboard_economy_overview(request: Request) -> dict[str, Any]:
    _require_auth(request)
    user_id = _require_session_user_id(request)
    active_guild = _require_active_guild(request)
    guild_id_int = _extract_discord_id(active_guild.get("id"))
    pool = _db_pool()
    if pool is None or guild_id_int is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    async with pool.acquire() as connection:
        await connection.execute(
            """
            INSERT INTO economy (user_id, balance)
            VALUES ($1, 0)
            ON CONFLICT (user_id) DO NOTHING
            """,
            user_id,
        )
        row = await connection.fetchrow(
            "SELECT balance, last_daily FROM economy WHERE user_id = $1",
            user_id,
        )
        inventory = await connection.fetch(
            """
            SELECT i.item_key, s.item_name, i.quantity
            FROM user_inventory i
            JOIN shop_items s ON s.item_key = i.item_key
            WHERE i.user_id = $1 AND i.quantity > 0
            ORDER BY i.quantity DESC, s.item_name ASC
            """,
            user_id,
        )
        badges = await connection.fetch(
            """
            SELECT badge_key, unlocked_at
            FROM user_profile_badges
            WHERE user_id = $1
            ORDER BY unlocked_at ASC
            """,
            user_id,
        )
        effects = await connection.fetch(
            """
            SELECT effect_key, expires_at
            FROM user_item_effects
            WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP
            ORDER BY expires_at ASC
            """,
            user_id,
        )
        voice_self = await connection.fetchrow(
            """
            SELECT total_amount, total_intervals, last_drop_at
            FROM user_voice_drops_daily
            WHERE guild_id = $1 AND user_id = $2 AND day_key = CURRENT_DATE
            """,
            guild_id_int,
            user_id,
        )
        voice_guild = await connection.fetchrow(
            """
            SELECT
                COALESCE(SUM(total_amount), 0) AS total_amount,
                COALESCE(SUM(total_intervals), 0) AS total_intervals,
                COALESCE(COUNT(*), 0) AS participant_count
            FROM user_voice_drops_daily
            WHERE guild_id = $1 AND day_key = CURRENT_DATE
            """,
            guild_id_int,
        )

    balance = int(row.get("balance") or 0) if row else 0
    last_daily = row.get("last_daily") if row else None
    now = datetime.utcnow()
    daily_remaining_seconds = 0
    if last_daily is not None:
        last_daily_naive = last_daily.replace(tzinfo=None) if getattr(last_daily, "tzinfo", None) else last_daily
        remaining = (last_daily_naive + timedelta(hours=24) - now).total_seconds()
        daily_remaining_seconds = max(0, int(remaining))

    return {
        "ok": True,
        "user_id": str(user_id),
        "balance": balance,
        "daily_remaining_seconds": daily_remaining_seconds,
        "inventory": [
            {
                "item_key": str(item.get("item_key") or ""),
                "item_name": str(item.get("item_name") or ""),
                "quantity": int(item.get("quantity") or 0),
            }
            for item in inventory
        ],
        "badges": [
            {
                "badge_key": str(item.get("badge_key") or ""),
                "unlocked_at": item.get("unlocked_at").isoformat() if item.get("unlocked_at") else None,
            }
            for item in badges
        ],
        "active_effects": [
            {
                "effect_key": str(item.get("effect_key") or ""),
                "expires_at": item.get("expires_at").isoformat() if item.get("expires_at") else None,
            }
            for item in effects
        ],
        "voice_drops_summary": {
            "today_total": int(voice_self.get("total_amount") or 0) if voice_self else 0,
            "today_intervals": int(voice_self.get("total_intervals") or 0) if voice_self else 0,
            "last_drop_at": voice_self.get("last_drop_at").isoformat() if voice_self and voice_self.get("last_drop_at") else None,
            "guild_total_today": int(voice_guild.get("total_amount") or 0) if voice_guild else 0,
            "guild_intervals_today": int(voice_guild.get("total_intervals") or 0) if voice_guild else 0,
            "guild_participants_today": int(voice_guild.get("participant_count") or 0) if voice_guild else 0,
        },
    }


@app.get("/api/dashboard/economy/season")
async def dashboard_economy_season(request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id_int = _extract_discord_id(active_guild.get("id"))
    pool = _db_pool()
    if pool is None or guild_id_int is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    season_key, starts_at, ends_at = _season_bounds()

    async with pool.acquire() as connection:
        await connection.execute(
            """
            INSERT INTO economy_seasons (season_key, starts_at, ends_at, is_active)
            VALUES ($1, $2, $3, TRUE)
            ON CONFLICT (season_key) DO UPDATE
            SET starts_at = EXCLUDED.starts_at,
                ends_at = EXCLUDED.ends_at,
                is_active = TRUE
            """,
            season_key,
            starts_at,
            ends_at,
        )
        await connection.execute(
            "UPDATE economy_seasons SET is_active = FALSE WHERE season_key <> $1",
            season_key,
        )
        rows = await connection.fetch(
            """
            SELECT user_id, COALESCE(SUM(delta), 0) AS score
            FROM economy_transactions
            WHERE guild_id = $1
              AND created_at >= $2
              AND created_at < $3
            GROUP BY user_id
            ORDER BY score DESC
            LIMIT 10
            """,
            guild_id_int,
            starts_at,
            ends_at,
        )

    member_names = await _fetch_guild_member_display_names(str(active_guild.get("id") or ""), [item.get("user_id") for item in rows])

    return {
        "ok": True,
        "season_key": season_key,
        "starts_at": starts_at.isoformat(),
        "ends_at": ends_at.isoformat(),
        "leaderboard": [
            {
                "rank": idx,
                "user_id": str(item.get("user_id") or ""),
                "display_name": member_names.get(str(item.get("user_id") or "")) or f"User {item.get('user_id') or '-'}",
                "score": int(item.get("score") or 0),
            }
            for idx, item in enumerate(rows, start=1)
        ],
    }


@app.get("/api/dashboard/economy/transactions")
async def dashboard_economy_transactions(
    request: Request,
    limit: int = Query(default=40, ge=1, le=200),
) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id_int = _extract_discord_id(active_guild.get("id"))
    pool = _db_pool()
    if pool is None or guild_id_int is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    async with pool.acquire() as connection:
        rows = await connection.fetch(
            """
            SELECT id, user_id, delta, balance_after, tx_type, metadata, created_at
            FROM economy_transactions
            WHERE guild_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            """,
            guild_id_int,
            limit,
        )

    return {
        "ok": True,
        "transactions": [
            {
                "id": int(item.get("id") or 0),
                "user_id": str(item.get("user_id") or ""),
                "delta": int(item.get("delta") or 0),
                "balance_after": int(item.get("balance_after") or 0),
                "tx_type": str(item.get("tx_type") or "unknown"),
                "metadata": item.get("metadata") if isinstance(item.get("metadata"), dict) else {},
                "created_at": item.get("created_at").isoformat() if item.get("created_at") and hasattr(item.get("created_at"), "isoformat") else None,
            }
            for item in rows
        ],
    }


@app.get("/api/dashboard/economy/stats")
async def dashboard_economy_stats(request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id_int = _extract_discord_id(active_guild.get("id"))
    pool = _db_pool()
    if pool is None or guild_id_int is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    async with pool.acquire() as connection:
        totals = await connection.fetchrow(
            """
            SELECT
                COALESCE(COUNT(*), 0) AS tx_count,
                COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS minted,
                COALESCE(SUM(CASE WHEN delta < 0 THEN ABS(delta) ELSE 0 END), 0) AS spent,
                COALESCE(COUNT(*) FILTER (WHERE tx_type = 'daily'), 0) AS daily_claims,
                COALESCE(COUNT(*) FILTER (WHERE tx_type LIKE 'transfer%'), 0) AS transfers
            FROM economy_transactions
            WHERE guild_id = $1
              AND created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
            """,
            guild_id_int,
        )
        top_earners = await connection.fetch(
            """
            SELECT user_id, COALESCE(SUM(delta), 0) AS net
            FROM economy_transactions
            WHERE guild_id = $1
              AND created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
            GROUP BY user_id
            ORDER BY net DESC
            LIMIT 5
            """,
            guild_id_int,
        )

    member_names = await _fetch_guild_member_display_names(str(active_guild.get("id") or ""), [item.get("user_id") for item in top_earners])

    return {
        "ok": True,
        "stats": {
            "tx_count_7d": int(totals.get("tx_count") or 0),
            "minted_7d": int(totals.get("minted") or 0),
            "spent_7d": int(totals.get("spent") or 0),
            "daily_claims_7d": int(totals.get("daily_claims") or 0),
            "transfers_7d": int(totals.get("transfers") or 0),
        },
        "top_earners": [
            {
                "user_id": str(item.get("user_id") or ""),
                "display_name": member_names.get(str(item.get("user_id") or "")) or f"User {item.get('user_id') or '-'}",
                "net": int(item.get("net") or 0),
            }
            for item in top_earners
        ],
    }


@app.get("/api/dashboard/economy/shop")
async def dashboard_economy_shop(request: Request) -> dict[str, Any]:
    _require_auth(request)
    pool = _db_pool()
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    async with pool.acquire() as connection:
        rows = await connection.fetch(
            """
            SELECT item_key, item_name, item_description, price, category
            FROM shop_items
            WHERE is_active = TRUE
            ORDER BY price ASC
            """
        )

    return {
        "ok": True,
        "items": [
            {
                "item_key": str(item.get("item_key") or ""),
                "item_name": str(item.get("item_name") or ""),
                "item_description": str(item.get("item_description") or ""),
                "price": int(item.get("price") or 0),
                "category": str(item.get("category") or "utility"),
            }
            for item in rows
        ],
    }


@app.post("/api/dashboard/economy/daily")
async def dashboard_economy_daily(request: Request) -> dict[str, Any]:
    _require_auth(request)
    user_id = _require_session_user_id(request)
    active_guild = _require_active_guild(request)
    guild_id_int = _extract_discord_id(active_guild.get("id"))
    pool = _db_pool()
    if pool is None or guild_id_int is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    async with pool.acquire() as connection:
        async with connection.transaction():
            await connection.execute(
                """
                INSERT INTO economy (user_id, balance)
                VALUES ($1, 0)
                ON CONFLICT (user_id) DO NOTHING
                """,
                user_id,
            )
            row = await connection.fetchrow(
                "SELECT balance, last_daily FROM economy WHERE user_id = $1 FOR UPDATE",
                user_id,
            )

            now = datetime.utcnow()
            last_daily = row.get("last_daily") if row else None
            if last_daily is not None:
                last_daily_naive = last_daily.replace(tzinfo=None) if getattr(last_daily, "tzinfo", None) else last_daily
                remaining = (last_daily_naive + timedelta(hours=24) - now).total_seconds()
                if remaining > 0:
                    return {
                        "ok": False,
                        "cooldown": True,
                        "remaining_seconds": int(remaining),
                    }

            rarity = random.choices(
                [
                    ("common", 100),
                    ("rare", 200),
                    ("epic", 500),
                    ("legendary", 1000),
                ],
                weights=[70, 20, 9, 1],
                k=1,
            )[0]
            reward = int(rarity[1])

            new_balance = await connection.fetchval(
                """
                UPDATE economy
                SET balance = balance + $1,
                    last_daily = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $2
                RETURNING balance
                """,
                reward,
                user_id,
            )
            await connection.execute(
                """
                INSERT INTO economy_transactions (user_id, guild_id, delta, balance_after, tx_type, metadata)
                VALUES ($1, $2, $3, $4, 'daily', $5::jsonb)
                """,
                user_id,
                guild_id_int,
                reward,
                int(new_balance or 0),
                json.dumps({"source": "dashboard", "rarity": str(rarity[0])}),
            )

    return {
        "ok": True,
        "reward": reward,
        "rarity": str(rarity[0]),
        "balance": int(new_balance or 0),
    }


@app.post("/api/dashboard/economy/buy")
async def dashboard_economy_buy(payload: EconomyBuyPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    user_id = _require_session_user_id(request)
    active_guild = _require_active_guild(request)
    guild_id_int = _extract_discord_id(active_guild.get("id"))
    pool = _db_pool()
    if pool is None or guild_id_int is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    async with pool.acquire() as connection:
        async with connection.transaction():
            await connection.execute(
                """
                INSERT INTO economy (user_id, balance)
                VALUES ($1, 0)
                ON CONFLICT (user_id) DO NOTHING
                """,
                user_id,
            )
            item = await connection.fetchrow(
                """
                SELECT item_key, item_name, price, is_active
                FROM shop_items
                WHERE LOWER(item_key) = LOWER($1)
                """,
                payload.item_key,
            )
            if item is None or not bool(item.get("is_active")):
                raise HTTPException(status_code=404, detail="Item unavailable")

            total_cost = int(item.get("price") or 0) * int(payload.quantity)
            current_balance = await connection.fetchval(
                "SELECT balance FROM economy WHERE user_id = $1 FOR UPDATE",
                user_id,
            )
            current_balance = int(current_balance or 0)
            if current_balance < total_cost:
                raise HTTPException(status_code=400, detail="Insufficient balance")

            new_balance = await connection.fetchval(
                """
                UPDATE economy
                SET balance = balance - $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $2
                RETURNING balance
                """,
                total_cost,
                user_id,
            )

            new_quantity = await connection.fetchval(
                """
                INSERT INTO user_inventory (user_id, item_key, quantity, updated_at)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, item_key)
                DO UPDATE SET
                    quantity = user_inventory.quantity + EXCLUDED.quantity,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING quantity
                """,
                user_id,
                str(item.get("item_key")),
                int(payload.quantity),
            )
            await connection.execute(
                """
                INSERT INTO economy_transactions (user_id, guild_id, delta, balance_after, tx_type, metadata)
                VALUES ($1, $2, $3, $4, 'shop_buy', $5::jsonb)
                """,
                user_id,
                guild_id_int,
                -int(total_cost),
                int(new_balance or 0),
                json.dumps({"source": "dashboard", "item_key": str(item.get("item_key")), "quantity": int(payload.quantity)}),
            )

    return {
        "ok": True,
        "item_key": str(item.get("item_key") or ""),
        "item_name": str(item.get("item_name") or ""),
        "quantity": int(payload.quantity),
        "total_cost": int(total_cost),
        "inventory_quantity": int(new_quantity or 0),
        "balance": int(new_balance or 0),
    }


@app.post("/api/dashboard/economy/use")
async def dashboard_economy_use(payload: EconomyUsePayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    user_id = _require_session_user_id(request)
    active_guild = _require_active_guild(request)
    guild_id_int = _extract_discord_id(active_guild.get("id"))
    pool = _db_pool()
    if pool is None or guild_id_int is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    async with pool.acquire() as connection:
        async with connection.transaction():
            item = await connection.fetchrow(
                "SELECT item_key, item_name FROM shop_items WHERE LOWER(item_key) = LOWER($1)",
                payload.item_key,
            )
            if item is None:
                raise HTTPException(status_code=404, detail="Item not found")

            inventory_qty = await connection.fetchval(
                """
                SELECT quantity
                FROM user_inventory
                WHERE user_id = $1 AND item_key = $2
                FOR UPDATE
                """,
                user_id,
                str(item.get("item_key")),
            )
            inventory_qty = int(inventory_qty or 0)
            if inventory_qty <= 0:
                raise HTTPException(status_code=400, detail="Item not owned")

            normalized = str(item.get("item_key") or "").lower()

            if normalized == "xp_boost_1h":
                await connection.execute(
                    """
                    INSERT INTO user_item_effects (user_id, effect_key, expires_at, updated_at)
                    VALUES ($1, 'xp_boost', CURRENT_TIMESTAMP + INTERVAL '1 hour', CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id, effect_key)
                    DO UPDATE SET
                        expires_at = CASE
                            WHEN user_item_effects.expires_at > CURRENT_TIMESTAMP
                                THEN user_item_effects.expires_at + INTERVAL '1 hour'
                            ELSE CURRENT_TIMESTAMP + INTERVAL '1 hour'
                        END,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    user_id,
                )
                await connection.execute(
                    """
                    UPDATE user_inventory
                    SET quantity = quantity - 1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = $1 AND item_key = $2
                    """,
                    user_id,
                    str(item.get("item_key")),
                )
                return {
                    "ok": True,
                    "item_key": normalized,
                    "effect": "xp_boost",
                    "message": "XP boost enabled for 1 hour",
                }

            if normalized == "lucky_crate":
                reward = int(random.choice([120, 180, 250, 400, 700, 1000]))
                await connection.execute(
                    """
                    UPDATE user_inventory
                    SET quantity = quantity - 1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = $1 AND item_key = $2
                    """,
                    user_id,
                    str(item.get("item_key")),
                )
                await connection.execute(
                    """
                    INSERT INTO economy (user_id, balance)
                    VALUES ($1, 0)
                    ON CONFLICT (user_id) DO NOTHING
                    """,
                    user_id,
                )
                new_balance = await connection.fetchval(
                    """
                    UPDATE economy
                    SET balance = balance + $1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = $2
                    RETURNING balance
                    """,
                    reward,
                    user_id,
                )
                await connection.execute(
                    """
                    INSERT INTO economy_transactions (user_id, guild_id, delta, balance_after, tx_type, metadata)
                    VALUES ($1, $2, $3, $4, 'crate_reward', $5::jsonb)
                    """,
                    user_id,
                    guild_id_int,
                    int(reward),
                    int(new_balance or 0),
                    json.dumps({"source": "dashboard", "item_key": normalized}),
                )
                return {
                    "ok": True,
                    "item_key": normalized,
                    "reward": reward,
                    "balance": int(new_balance or 0),
                    "message": "Lucky crate opened",
                }

            if normalized == "profile_badge":
                await connection.execute(
                    """
                    UPDATE user_inventory
                    SET quantity = quantity - 1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = $1 AND item_key = $2
                    """,
                    user_id,
                    str(item.get("item_key")),
                )
                await connection.execute(
                    """
                    INSERT INTO user_profile_badges (user_id, badge_key)
                    VALUES ($1, 'supporter_badge')
                    ON CONFLICT (user_id, badge_key) DO NOTHING
                    """,
                    user_id,
                )
                return {
                    "ok": True,
                    "item_key": normalized,
                    "badge_key": "supporter_badge",
                    "message": "Profile badge unlocked",
                }

            raise HTTPException(status_code=400, detail="Item has no use action")


@app.get("/api/dashboard/territories/list")
async def dashboard_territories_list(request: Request) -> dict[str, Any]:
    _require_auth(request)
    user_id = _require_session_user_id(request)
    pool = _db_pool()
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    active_guild = _active_guild_from_session(request)
    guild_id_str = str(active_guild.get("id")) if isinstance(active_guild, dict) and active_guild.get("id") else None
    now_utc = datetime.utcnow()
    today_key = now_utc.date()

    async with pool.acquire() as connection:
        async with connection.transaction():
            started_faction_events = await _process_faction_activity(connection)
            await connection.execute(
                """
                INSERT INTO economy (user_id, balance)
                VALUES ($1, 0)
                ON CONFLICT (user_id) DO NOTHING
                """,
                user_id,
            )
            balance = await connection.fetchval("SELECT balance FROM economy WHERE user_id = $1", user_id)
            rows = await connection.fetch(
                """
                SELECT
                    id,
                    name,
                    owner_id,
                    owner_faction,
                    called_at,
                    attack_time,
                    luma_coins,
                    owner_reward_coins,
                    defense_level,
                    faction_attack_active,
                    faction_name,
                    faction_attack_started_at,
                    faction_attack_ends_at
                FROM territories
                ORDER BY id ASC
                """
            )
            gathered_inventory_rows = await connection.fetch(
                """
                SELECT resource_key, resource_name, quality, icon, quantity, total_value
                FROM territory_resource_inventory
                WHERE user_id = $1
                ORDER BY quality DESC, resource_name ASC
                """,
                user_id,
            )
            season_points = await connection.fetchval(
                "SELECT total_points FROM territory_season_points WHERE user_id = $1",
                user_id,
            )
            season_claim_rows = await connection.fetch(
                """
                SELECT map_id
                FROM territory_season_claims
                WHERE user_id = $1 AND day_key = $2
                """,
                user_id,
                today_key,
            )

    owner_ids = [int(row["owner_id"]) for row in rows if row.get("owner_id") is not None]
    owner_names: dict[str, str] = {}
    if guild_id_str and owner_ids:
        owner_names = await _fetch_guild_member_display_names(guild_id_str, owner_ids)

    claimed_map_ids = {int(item.get("map_id") or -1) for item in season_claim_rows}
    started_by_territory = {int(item.get("territory_id") or 0): item for item in started_faction_events}

    def _attack_cooldown_remaining_seconds(row: Any) -> int:
        attack_time = row.get("attack_time")
        if attack_time is None:
            return 0
        attack_dt = attack_time.replace(tzinfo=None) if getattr(attack_time, "tzinfo", None) else attack_time
        elapsed = (now_utc - attack_dt).total_seconds()
        return max(0, int(TERRITORY_ATTACK_COOLDOWN_SECONDS - elapsed))

    def _faction_attack_remaining_seconds(row: Any) -> int:
        if not bool(row.get("faction_attack_active")):
            return 0
        ends_at = row.get("faction_attack_ends_at")
        if ends_at is None:
            return 0
        ends_dt = ends_at.replace(tzinfo=None) if getattr(ends_at, "tzinfo", None) else ends_at
        return max(0, int((ends_dt - now_utc).total_seconds()))

    faction_alerts: list[dict[str, Any]] = []
    for row in rows:
        if not bool(row.get("faction_attack_active")):
            continue
        if _extract_discord_id(row.get("owner_id")) != user_id:
            continue
        territory_id = int(row["id"])
        started_event = started_by_territory.get(territory_id)
        faction_alerts.append(
            {
                "territory_id": territory_id,
                "territory_name": str(row.get("name") or "Território"),
                "faction_name": str(row.get("faction_name") or "Facção"),
                "remaining_seconds": _faction_attack_remaining_seconds(row),
                "event_type": str(started_event.get("event_type") if isinstance(started_event, dict) else "faction_active"),
                "started_at": row.get("faction_attack_started_at").isoformat() if row.get("faction_attack_started_at") else None,
            }
        )

    return {
        "ok": True,
        "current_user_id": str(user_id),
        "balance": int(balance or 0),
        "season_points": int(season_points or 0),
        "season_claimed_maps_today": sorted([value for value in claimed_map_ids if value >= 0]),
        "world": _territory_world_payload(),
        "faction_alerts": faction_alerts,
        "gathered_inventory": [
            {
                "key": str(item.get("resource_key") or ""),
                "name": str(item.get("resource_name") or "Recurso"),
                "quality": str(item.get("quality") or "Comum"),
                "icon": str(item.get("icon") or "🪨"),
                "amount": int(item.get("quantity") or 0),
                "value": int(item.get("total_value") or 0),
            }
            for item in gathered_inventory_rows
        ],
        "territories": [
            {
                "id": int(row["id"]),
                "name": str(row["name"]),
                "owner_id": str(row["owner_id"]) if row.get("owner_id") is not None else None,
                "owner_display": (
                    owner_names.get(str(row["owner_id"]))
                    if row.get("owner_id") is not None
                    else (f"⚔ {str(row.get('owner_faction') or '')}" if row.get("owner_faction") else None)
                ),
                "owner_faction": str(row.get("owner_faction") or "") or None,
                "defense_level": int(row["defense_level"] or 1),
                "luma_coins": int(row["luma_coins"] or 100),
                "owner_reward_coins": int(row["owner_reward_coins"] or 25),
                "called_at": row.get("called_at").isoformat() if row.get("called_at") else None,
                "attack_time": row.get("attack_time").isoformat() if row.get("attack_time") else None,
                "faction_attack_active": bool(row.get("faction_attack_active")),
                "faction_name": str(row.get("faction_name") or "") or None,
                "faction_attack_started_at": row.get("faction_attack_started_at").isoformat() if row.get("faction_attack_started_at") else None,
                "faction_attack_ends_at": row.get("faction_attack_ends_at").isoformat() if row.get("faction_attack_ends_at") else None,
                "faction_attack_remaining_seconds": _faction_attack_remaining_seconds(row),
                "attack_cooldown_remaining_seconds": _attack_cooldown_remaining_seconds(row),
                "attack_cooldown_total_seconds": TERRITORY_ATTACK_COOLDOWN_SECONDS,
                "is_mine": row.get("owner_id") == user_id,
                "league": _territory_league_for_score(
                    (int(row["defense_level"] or 1) * 35)
                    + (int(row["owner_reward_coins"] or 25) * 4)
                    + (int(row["luma_coins"] or 100) // 10)
                ) if row.get("owner_id") is not None else ("Conquistador" if row.get("owner_faction") else "Abismo"),
            }
            for row in rows
        ],
    }


@app.get("/api/dashboard/territories/world")
async def dashboard_territories_world(request: Request) -> dict[str, Any]:
    _require_auth(request)
    return {
        "ok": True,
        "world": _territory_world_payload(),
    }


@app.post("/api/dashboard/territories/season/claim")
async def dashboard_territories_season_claim(payload: TerritorySeasonClaimPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    user_id = _require_session_user_id(request)
    pool = _db_pool()
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    map_id = int(payload.map_id)
    if map_id not in TERRITORY_PRIME_SCHEDULE_BY_MAP:
        return {"ok": False, "message": "Mapa inválido para resgate de temporada."}

    now_utc = datetime.utcnow()
    if not _territory_prime_window_closed(map_id, now_utc):
        return {"ok": False, "message": "Recompensa liberada apenas após o fim do prime time."}

    day_key = now_utc.date()

    async with pool.acquire() as connection:
        async with connection.transaction():
            existing_claim = await connection.fetchrow(
                """
                SELECT points
                FROM territory_season_claims
                WHERE user_id = $1 AND map_id = $2 AND day_key = $3
                """,
                user_id,
                map_id,
                day_key,
            )
            if existing_claim is not None:
                total_points = await connection.fetchval(
                    "SELECT total_points FROM territory_season_points WHERE user_id = $1",
                    user_id,
                )
                return {
                    "ok": False,
                    "already_claimed": True,
                    "message": "Você já resgatou os pontos deste mapa hoje.",
                    "points": int(existing_claim.get("points") or 0),
                    "season_points": int(total_points or 0),
                }

            holdings = await connection.fetchrow(
                """
                SELECT
                    COALESCE(COUNT(*), 0) AS owned_count,
                    COALESCE(SUM(defense_level), 0) AS defense_sum
                FROM territories
                WHERE owner_id = $1
                """,
                user_id,
            )
            owned_count = int(holdings.get("owned_count") or 0) if holdings else 0
            defense_sum = int(holdings.get("defense_sum") or 0) if holdings else 0

            points = max(10, (owned_count * 25) + (defense_sum * 6))

            await connection.execute(
                """
                INSERT INTO territory_season_claims (user_id, map_id, day_key, points)
                VALUES ($1, $2, $3, $4)
                """,
                user_id,
                map_id,
                day_key,
                points,
            )

            await connection.execute(
                """
                INSERT INTO territory_season_points (user_id, total_points, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id)
                DO UPDATE SET
                    total_points = territory_season_points.total_points + EXCLUDED.total_points,
                    updated_at = CURRENT_TIMESTAMP
                """,
                user_id,
                points,
            )

            season_points = await connection.fetchval(
                "SELECT total_points FROM territory_season_points WHERE user_id = $1",
                user_id,
            )

    return {
        "ok": True,
        "points": points,
        "season_points": int(season_points or 0),
        "map_id": map_id,
        "message": f"Resgate concluído: +{points} pontos da temporada.",
    }


@app.post("/api/dashboard/territories/gather")
async def dashboard_territories_gather(payload: TerritoryGatherPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    user_id = _require_session_user_id(request)
    active_guild = _active_guild_from_session(request)
    guild_id_int = _extract_discord_id(active_guild.get("id")) if isinstance(active_guild, dict) else None
    pool = _db_pool()
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    world_by_map = _territory_world_by_map()
    map_data = world_by_map.get(int(payload.map_id))
    if map_data is None:
        return {"ok": False, "message": "Mapa inválido para coleta."}

    matched_node = None
    for node in map_data.get("resources", []):
        if int(node.get("gx") or -1) == int(payload.node_gx) and int(node.get("gy") or -1) == int(payload.node_gy):
            matched_node = node
            break

    if matched_node is None:
        return {"ok": False, "message": "Esse nó de recurso não pertence ao mapa atual."}

    node_key = f"{int(payload.node_gx)}:{int(payload.node_gy)}"
    now = datetime.utcnow()

    async with pool.acquire() as connection:
        async with connection.transaction():
            cooldown_row = await connection.fetchrow(
                """
                SELECT available_at
                FROM territory_resource_cooldowns
                WHERE user_id = $1 AND map_id = $2 AND node_key = $3
                FOR UPDATE
                """,
                user_id,
                int(payload.map_id),
                node_key,
            )

            if cooldown_row and cooldown_row.get("available_at"):
                available_at = cooldown_row["available_at"]
                available_dt = available_at.replace(tzinfo=None) if getattr(available_at, "tzinfo", None) else available_at
                remaining = (available_dt - now).total_seconds()
                if remaining > 0:
                    return {
                        "ok": False,
                        "cooldown": True,
                        "remaining_seconds": int(remaining),
                        "message": "Esse nó ainda está em recuperação.",
                    }

            roll = random.randint(1, 100)
            quality = _territory_quality_from_roll(roll)
            amount = max(1, (roll + 21) // 22)
            icon = str(matched_node.get("icon") or payload.node_icon)
            name = _territory_resource_name(icon)
            unit_value = int(TERRITORY_RESOURCE_UNIT_VALUE.get(quality, 8))
            total_value = amount * unit_value
            resource_key = f"{name}:{quality}"

            await connection.execute(
                """
                INSERT INTO territory_resource_inventory
                    (user_id, resource_key, resource_name, quality, icon, quantity, total_value, updated_at)
                VALUES
                    ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, resource_key)
                DO UPDATE SET
                    quantity = territory_resource_inventory.quantity + EXCLUDED.quantity,
                    total_value = territory_resource_inventory.total_value + EXCLUDED.total_value,
                    updated_at = CURRENT_TIMESTAMP
                """,
                user_id,
                resource_key,
                name,
                quality,
                icon,
                amount,
                total_value,
            )

            next_available = now + timedelta(seconds=TERRITORY_RESOURCE_GATHER_COOLDOWN_SECONDS)
            await connection.execute(
                """
                INSERT INTO territory_resource_cooldowns
                    (user_id, map_id, node_key, available_at, updated_at)
                VALUES
                    ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id, map_id, node_key)
                DO UPDATE SET
                    available_at = EXCLUDED.available_at,
                    updated_at = CURRENT_TIMESTAMP
                """,
                user_id,
                int(payload.map_id),
                node_key,
                next_available,
            )

            await connection.execute(
                """
                INSERT INTO economy_transactions (user_id, guild_id, delta, balance_after, tx_type, metadata)
                VALUES ($1, $2, 0, NULL, 'territory_gather', $3::jsonb)
                """,
                user_id,
                guild_id_int,
                json.dumps(
                    {
                        "map_id": int(payload.map_id),
                        "node_key": node_key,
                        "resource_key": resource_key,
                        "roll": int(roll),
                        "amount": int(amount),
                        "total_value": int(total_value),
                    }
                ),
            )

            inventory_rows = await connection.fetch(
                """
                SELECT resource_key, resource_name, quality, icon, quantity, total_value
                FROM territory_resource_inventory
                WHERE user_id = $1
                ORDER BY quality DESC, resource_name ASC
                """,
                user_id,
            )

    return {
        "ok": True,
        "loot": {
            "key": resource_key,
            "name": name,
            "quality": quality,
            "icon": icon,
            "amount": int(amount),
            "roll": int(roll),
            "value": int(total_value),
        },
        "gather_cooldown_seconds": TERRITORY_RESOURCE_GATHER_COOLDOWN_SECONDS,
        "inventory": [
            {
                "key": str(item.get("resource_key") or ""),
                "name": str(item.get("resource_name") or "Recurso"),
                "quality": str(item.get("quality") or "Comum"),
                "icon": str(item.get("icon") or "🪨"),
                "amount": int(item.get("quantity") or 0),
                "value": int(item.get("total_value") or 0),
            }
            for item in inventory_rows
        ],
    }


@app.post("/api/dashboard/territories/sell")
async def dashboard_territories_sell(payload: TerritorySellPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    user_id = _require_session_user_id(request)
    active_guild = _active_guild_from_session(request)
    guild_id_int = _extract_discord_id(active_guild.get("id")) if isinstance(active_guild, dict) else None
    pool = _db_pool()
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    world_by_map = _territory_world_by_map()
    map_data = world_by_map.get(int(payload.map_id))
    if map_data is None:
        return {"ok": False, "message": "Mapa inválido para venda."}

    city = None
    for item in map_data.get("cities", []):
        if str(item.get("id") or "") == str(payload.city_id):
            city = item
            break

    if city is None:
        return {"ok": False, "message": "Cidade inválida para este mapa."}

    tax_rate = float(city.get("tax_rate") or 0.1)

    async with pool.acquire() as connection:
        async with connection.transaction():
            inventory_rows = await connection.fetch(
                """
                SELECT resource_key, resource_name, quality, icon, quantity, total_value
                FROM territory_resource_inventory
                WHERE user_id = $1
                FOR UPDATE
                """,
                user_id,
            )

            if not inventory_rows:
                return {"ok": False, "message": "Inventário vazio para venda."}

            gross_value = sum(int(item.get("total_value") or 0) for item in inventory_rows)
            net_value = max(0, int(gross_value * (1 - tax_rate)))
            tax_value = max(0, int(gross_value - net_value))

            await connection.execute(
                """
                INSERT INTO economy (user_id, balance)
                VALUES ($1, 0)
                ON CONFLICT (user_id) DO NOTHING
                """,
                user_id,
            )
            new_balance = await connection.fetchval(
                """
                UPDATE economy
                SET balance = balance + $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $2
                RETURNING balance
                """,
                net_value,
                user_id,
            )

            await connection.execute(
                "DELETE FROM territory_resource_inventory WHERE user_id = $1",
                user_id,
            )

            await connection.execute(
                """
                INSERT INTO economy_transactions (user_id, guild_id, delta, balance_after, tx_type, metadata)
                VALUES ($1, $2, $3, $4, 'territory_market_sale', $5::jsonb)
                """,
                user_id,
                guild_id_int,
                net_value,
                int(new_balance or 0),
                json.dumps(
                    {
                        "map_id": int(payload.map_id),
                        "city_id": str(payload.city_id),
                        "city_name": str(city.get("name") or "Cidade"),
                        "tax_rate": tax_rate,
                        "gross_value": int(gross_value),
                        "tax_value": int(tax_value),
                        "entry_count": len(inventory_rows),
                    }
                ),
            )

    return {
        "ok": True,
        "city": {
            "id": str(city.get("id") or ""),
            "name": str(city.get("name") or "Cidade"),
            "tax_rate": tax_rate,
        },
        "gross": int(gross_value),
        "tax": int(tax_value),
        "net": int(net_value),
        "balance": int(new_balance or 0),
        "sold_entries": [
            {
                "key": str(item.get("resource_key") or ""),
                "name": str(item.get("resource_name") or "Recurso"),
                "quality": str(item.get("quality") or "Comum"),
                "icon": str(item.get("icon") or "🪨"),
                "amount": int(item.get("quantity") or 0),
                "value": int(item.get("total_value") or 0),
            }
            for item in inventory_rows
        ],
    }


@app.post("/api/dashboard/territories/defend")
async def dashboard_territories_defend(payload: TerritoryActionPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    user_id = _require_session_user_id(request)
    pool = _db_pool()
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    async with pool.acquire() as connection:
        async with connection.transaction():
            territory = await connection.fetchrow(
                """
                SELECT id, name, owner_id, defense_level, faction_attack_active, faction_name
                FROM territories
                WHERE id = $1
                FOR UPDATE
                """,
                payload.territory_id,
            )
            if territory is None:
                raise HTTPException(status_code=404, detail="Territory not found")
            if territory.get("owner_id") != user_id:
                return {"ok": False, "message": "Somente o dono pode reforçar esse território."}

            if bool(territory.get("faction_attack_active")):
                faction_name = str(territory.get("faction_name") or "Facção")
                new_defense = await connection.fetchval(
                    """
                    UPDATE territories
                    SET
                        defense_level = LEAST(defense_level + 1, 5),
                        faction_attack_active = FALSE,
                        faction_name = NULL,
                        faction_attack_started_at = NULL,
                        faction_attack_ends_at = NULL,
                        last_faction_result = 'defended',
                        last_faction_result_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                    RETURNING defense_level
                    """,
                    payload.territory_id,
                )
                defense_points = 18
                await connection.execute(
                    """
                    INSERT INTO territory_season_points (user_id, total_points, updated_at)
                    VALUES ($1, $2, CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id)
                    DO UPDATE SET
                        total_points = territory_season_points.total_points + EXCLUDED.total_points,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    user_id,
                    defense_points,
                )
                season_points = await connection.fetchval(
                    "SELECT total_points FROM territory_season_points WHERE user_id = $1",
                    user_id,
                )

                return {
                    "ok": True,
                    "defense_level": int(new_defense or territory.get("defense_level") or 1),
                    "season_points": int(season_points or 0),
                    "message": f"Ataque da {faction_name} repelido. +{defense_points} pontos da temporada.",
                }

            current_defense = int(territory.get("defense_level") or 1)
            if current_defense >= 5:
                return {"ok": False, "message": "Esse território já está no nível máximo de defesa."}

            new_defense = await connection.fetchval(
                """
                UPDATE territories
                SET defense_level = LEAST(defense_level + 1, 5)
                WHERE id = $1
                RETURNING defense_level
                """,
                payload.territory_id,
            )

    return {
        "ok": True,
        "defense_level": int(new_defense or current_defense),
        "message": f"Defesa reforçada para nível {int(new_defense or current_defense)}.",
    }


@app.post("/api/dashboard/territories/upgrade")
async def dashboard_territories_upgrade(payload: TerritoryUpgradePayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    user_id = _require_session_user_id(request)
    active_guild = _active_guild_from_session(request)
    guild_id_int = _extract_discord_id(active_guild.get("id")) if isinstance(active_guild, dict) else None
    pool = _db_pool()
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    tier_map = {
        1: {"cost": 200, "defense": 1},
        2: {"cost": 500, "defense": 3},
        3: {"cost": 1000, "defense": 5},
    }
    tier_info = tier_map[payload.tier]

    async with pool.acquire() as connection:
        async with connection.transaction():
            territory = await connection.fetchrow(
                """
                SELECT id, name, owner_id, defense_level
                FROM territories
                WHERE id = $1
                FOR UPDATE
                """,
                payload.territory_id,
            )
            if territory is None:
                raise HTTPException(status_code=404, detail="Territory not found")
            if territory.get("owner_id") != user_id:
                return {"ok": False, "message": "Somente o dono pode evoluir esse território."}

            current_defense = int(territory.get("defense_level") or 1)
            if current_defense >= 5:
                return {"ok": False, "message": "Esse território já está no nível máximo de defesa."}

            await connection.execute(
                """
                INSERT INTO economy (user_id, balance)
                VALUES ($1, 0)
                ON CONFLICT (user_id) DO NOTHING
                """,
                user_id,
            )
            current_balance = await connection.fetchval(
                "SELECT balance FROM economy WHERE user_id = $1 FOR UPDATE",
                user_id,
            )
            current_balance = int(current_balance or 0)
            if current_balance < int(tier_info["cost"]):
                return {
                    "ok": False,
                    "message": f"Saldo insuficiente para esse upgrade ({tier_info['cost']} coins).",
                    "balance": current_balance,
                }

            new_balance = await connection.fetchval(
                """
                UPDATE economy
                SET balance = balance - $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $2
                RETURNING balance
                """,
                int(tier_info["cost"]),
                user_id,
            )
            new_defense = await connection.fetchval(
                """
                UPDATE territories
                SET defense_level = LEAST(defense_level + $1, 5)
                WHERE id = $2
                RETURNING defense_level
                """,
                int(tier_info["defense"]),
                payload.territory_id,
            )
            await connection.execute(
                """
                INSERT INTO economy_transactions (user_id, guild_id, delta, balance_after, tx_type, metadata)
                VALUES ($1, $2, $3, $4, 'territory_upgrade', $5::jsonb)
                """,
                user_id,
                guild_id_int,
                -int(tier_info["cost"]),
                int(new_balance or 0),
                json.dumps({
                    "territory_id": int(payload.territory_id),
                    "tier": int(payload.tier),
                    "defense_added": int(tier_info["defense"]),
                }),
            )

    return {
        "ok": True,
        "balance": int(new_balance or 0),
        "defense_level": int(new_defense or current_defense),
        "message": f"Upgrade aplicado. Defesa agora no nível {int(new_defense or current_defense)}.",
    }


@app.get("/api/dashboard/territories/leaderboard")
async def dashboard_territories_leaderboard(request: Request) -> dict[str, Any]:
    _require_auth(request)
    user_id = _require_session_user_id(request)
    pool = _db_pool()
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    active_guild = _active_guild_from_session(request)
    guild_id_str = str(active_guild.get("id")) if isinstance(active_guild, dict) and active_guild.get("id") else None

    async with pool.acquire() as connection:
        rows = await connection.fetch(
            """
            SELECT
                owner_id,
                COUNT(*) AS owned_count,
                COALESCE(SUM(defense_level), 0) AS total_defense,
                COALESCE(SUM(owner_reward_coins), 0) AS reward_rate,
                COALESCE(SUM(luma_coins), 0) AS conquest_pot
            FROM territories
            WHERE owner_id IS NOT NULL
            GROUP BY owner_id
            ORDER BY owned_count DESC, total_defense DESC, conquest_pot DESC
            """
        )

    owner_ids = [int(row["owner_id"]) for row in rows if row.get("owner_id") is not None]
    owner_names: dict[str, str] = {}
    if guild_id_str and owner_ids:
        owner_names = await _fetch_guild_member_display_names(guild_id_str, owner_ids)

    leaderboard = []
    my_profile = None
    for index, row in enumerate(rows, start=1):
        score = _territory_score(dict(row))
        entry = {
            "rank": index,
            "user_id": str(row["owner_id"]),
            "display_name": owner_names.get(str(row["owner_id"])) or f"User {row['owner_id']}",
            "owned_count": int(row["owned_count"] or 0),
            "total_defense": int(row["total_defense"] or 0),
            "reward_rate": int(row["reward_rate"] or 0),
            "conquest_pot": int(row["conquest_pot"] or 0),
            "score": score,
            "league": _territory_league_for_score(score),
        }
        leaderboard.append(entry)
        if int(row["owner_id"]) == user_id:
            my_profile = entry

    if my_profile is None:
        my_profile = {
            "rank": None,
            "user_id": str(user_id),
            "display_name": owner_names.get(str(user_id)) or "Você",
            "owned_count": 0,
            "total_defense": 0,
            "reward_rate": 0,
            "conquest_pot": 0,
            "score": 0,
            "league": _territory_league_for_score(0),
        }

    return {
        "ok": True,
        "leagues": [
            {"name": league_name, "minimum_score": minimum_score}
            for league_name, minimum_score in TERRITORY_LEAGUES[::-1]
        ],
        "me": my_profile,
        "leaderboard": leaderboard[:10],
    }


@app.post("/api/dashboard/territories/claim")
async def dashboard_territories_claim(payload: TerritoryActionPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    user_id = _require_session_user_id(request)
    active_guild = _active_guild_from_session(request)
    guild_id_int = _extract_discord_id(active_guild.get("id")) if isinstance(active_guild, dict) else None
    pool = _db_pool()
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    claim_cost = 50

    async with pool.acquire() as connection:
        async with connection.transaction():
            territory = await connection.fetchrow(
                """
                SELECT id, name, owner_id, owner_faction
                FROM territories
                WHERE id = $1
                FOR UPDATE
                """,
                payload.territory_id,
            )
            if territory is None:
                raise HTTPException(status_code=404, detail="Territory not found")
            if territory.get("owner_id") is not None:
                return {"ok": False, "message": "Esse território já possui dono."}
            if territory.get("owner_faction"):
                return {"ok": False, "message": "Esse território está sob domínio de facção. Ataque para retomar."}

            await connection.execute(
                """
                INSERT INTO economy (user_id, balance)
                VALUES ($1, 0)
                ON CONFLICT (user_id) DO NOTHING
                """,
                user_id,
            )
            current_balance = await connection.fetchval(
                "SELECT balance FROM economy WHERE user_id = $1 FOR UPDATE",
                user_id,
            )
            current_balance = int(current_balance or 0)
            if current_balance < claim_cost:
                return {
                    "ok": False,
                    "message": f"Saldo insuficiente para reivindicar (necessário: {claim_cost}).",
                    "balance": current_balance,
                }

            new_balance = await connection.fetchval(
                """
                UPDATE economy
                SET balance = balance - $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $2
                RETURNING balance
                """,
                claim_cost,
                user_id,
            )
            await connection.execute(
                """
                UPDATE territories
                SET
                    owner_id = $1,
                    owner_faction = NULL,
                    called_at = CURRENT_TIMESTAMP,
                    faction_attack_active = FALSE,
                    faction_name = NULL,
                    faction_attack_started_at = NULL,
                    faction_attack_ends_at = NULL
                WHERE id = $2
                """,
                user_id,
                payload.territory_id,
            )
            await connection.execute(
                """
                INSERT INTO economy_transactions (user_id, guild_id, delta, balance_after, tx_type, metadata)
                VALUES ($1, $2, $3, $4, 'territory_claim', $5::jsonb)
                """,
                user_id,
                guild_id_int,
                -claim_cost,
                int(new_balance or 0),
                json.dumps({"territory_id": int(payload.territory_id), "territory_name": str(territory.get("name") or "")}),
            )

    return {
        "ok": True,
        "message": f"Você reivindicou {territory['name']} com sucesso.",
        "balance": int(new_balance or 0),
    }


@app.post("/api/dashboard/territories/attack")
async def dashboard_territories_attack(payload: TerritoryActionPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    user_id = _require_session_user_id(request)
    active_guild = _active_guild_from_session(request)
    guild_id_int = _extract_discord_id(active_guild.get("id")) if isinstance(active_guild, dict) else None
    pool = _db_pool()
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    attack_cost = 100

    async with pool.acquire() as connection:
        async with connection.transaction():
            territory = await connection.fetchrow(
                """
                SELECT id, name, owner_id, owner_faction, defense_level, luma_coins, attack_time
                FROM territories
                WHERE id = $1
                FOR UPDATE
                """,
                payload.territory_id,
            )
            if territory is None:
                raise HTTPException(status_code=404, detail="Territory not found")
            if territory.get("owner_id") == user_id:
                return {"ok": False, "message": "Você não pode atacar seu próprio território."}

            last_attack = territory.get("attack_time")
            if last_attack is not None:
                last_attack_dt = last_attack.replace(tzinfo=None) if getattr(last_attack, "tzinfo", None) else last_attack
                elapsed = (datetime.utcnow() - last_attack_dt).total_seconds()
                remaining = max(0, int(TERRITORY_ATTACK_COOLDOWN_SECONDS - elapsed))
                if remaining > 0:
                    return {
                        "ok": False,
                        "cooldown": True,
                        "remaining_seconds": remaining,
                        "message": "Esse território está em cooldown de ataque.",
                    }

            await connection.execute(
                """
                INSERT INTO economy (user_id, balance)
                VALUES ($1, 0)
                ON CONFLICT (user_id) DO NOTHING
                """,
                user_id,
            )
            current_balance = await connection.fetchval(
                "SELECT balance FROM economy WHERE user_id = $1 FOR UPDATE",
                user_id,
            )
            current_balance = int(current_balance or 0)
            if current_balance < attack_cost:
                return {
                    "ok": False,
                    "message": f"Saldo insuficiente para atacar (necessário: {attack_cost}).",
                    "balance": current_balance,
                }

            balance_after_cost = await connection.fetchval(
                """
                UPDATE economy
                SET balance = balance - $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $2
                RETURNING balance
                """,
                attack_cost,
                user_id,
            )
            await connection.execute(
                """
                INSERT INTO economy_transactions (user_id, guild_id, delta, balance_after, tx_type, metadata)
                VALUES ($1, $2, $3, $4, 'territory_attack_cost', $5::jsonb)
                """,
                user_id,
                guild_id_int,
                -attack_cost,
                int(balance_after_cost or 0),
                json.dumps({"territory_id": int(payload.territory_id), "territory_name": str(territory.get("name") or "")}),
            )

            defense_level = max(1, int(territory.get("defense_level") or 1))
            success_chance = max(0.20, 0.70 - (defense_level * 0.05))
            success = random.random() < success_chance

            if not success:
                await connection.execute(
                    "UPDATE territories SET attack_time = CURRENT_TIMESTAMP WHERE id = $1",
                    payload.territory_id,
                )
                return {
                    "ok": True,
                    "success": False,
                    "message": f"Ataque falhou. Defesa inimiga segurou o território ({int(success_chance * 100)}% de chance).",
                    "balance": int(balance_after_cost or 0),
                }

            conquest_reward = int(territory.get("luma_coins") or 0)
            balance_after_win = await connection.fetchval(
                """
                UPDATE economy
                SET balance = balance + $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $2
                RETURNING balance
                """,
                conquest_reward,
                user_id,
            )
            await connection.execute(
                """
                UPDATE territories
                SET owner_id = $1,
                    owner_faction = NULL,
                    called_at = CURRENT_TIMESTAMP,
                    attack_time = CURRENT_TIMESTAMP,
                    defense_level = 1,
                    faction_attack_active = FALSE,
                    faction_name = NULL,
                    faction_attack_started_at = NULL,
                    faction_attack_ends_at = NULL
                WHERE id = $2
                """,
                user_id,
                payload.territory_id,
            )
            await connection.execute(
                """
                INSERT INTO economy_transactions (user_id, guild_id, delta, balance_after, tx_type, metadata)
                VALUES ($1, $2, $3, $4, 'territory_conquest', $5::jsonb)
                """,
                user_id,
                guild_id_int,
                conquest_reward,
                int(balance_after_win or 0),
                json.dumps({"territory_id": int(payload.territory_id), "territory_name": str(territory.get("name") or "")}),
            )

    return {
        "ok": True,
        "success": True,
        "message": f"Você conquistou {territory['name']} e ganhou {conquest_reward} Luma Coins.",
        "balance": int(balance_after_win or 0),
        "reward": int(conquest_reward),
    }


@app.post("/api/dashboard/territories/collect")
async def dashboard_territories_collect(payload: TerritoryActionPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    user_id = _require_session_user_id(request)
    active_guild = _active_guild_from_session(request)
    guild_id_int = _extract_discord_id(active_guild.get("id")) if isinstance(active_guild, dict) else None
    pool = _db_pool()
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    cooldown_seconds = 3600

    async with pool.acquire() as connection:
        async with connection.transaction():
            territory = await connection.fetchrow(
                """
                SELECT id, name, owner_id, called_at, owner_reward_coins
                FROM territories
                WHERE id = $1
                FOR UPDATE
                """,
                payload.territory_id,
            )
            if territory is None:
                raise HTTPException(status_code=404, detail="Territory not found")
            if territory.get("owner_id") != user_id:
                return {"ok": False, "message": "Somente o dono pode coletar essa recompensa."}

            last_called = territory.get("called_at")
            if last_called is not None:
                last_dt = last_called.replace(tzinfo=None) if getattr(last_called, "tzinfo", None) else last_called
                now = datetime.utcnow()
                elapsed = (now - last_dt).total_seconds()
                if elapsed < cooldown_seconds:
                    return {
                        "ok": False,
                        "cooldown": True,
                        "remaining_seconds": int(cooldown_seconds - elapsed),
                    }

            reward = int(territory.get("owner_reward_coins") or 0)
            await connection.execute(
                """
                INSERT INTO economy (user_id, balance)
                VALUES ($1, 0)
                ON CONFLICT (user_id) DO NOTHING
                """,
                user_id,
            )
            new_balance = await connection.fetchval(
                """
                UPDATE economy
                SET balance = balance + $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $2
                RETURNING balance
                """,
                reward,
                user_id,
            )
            await connection.execute(
                "UPDATE territories SET called_at = CURRENT_TIMESTAMP WHERE id = $1",
                payload.territory_id,
            )
            await connection.execute(
                """
                INSERT INTO economy_transactions (user_id, guild_id, delta, balance_after, tx_type, metadata)
                VALUES ($1, $2, $3, $4, 'territory_collect', $5::jsonb)
                """,
                user_id,
                guild_id_int,
                reward,
                int(new_balance or 0),
                json.dumps({"territory_id": int(payload.territory_id), "territory_name": str(territory.get("name") or "")}),
            )

    return {
        "ok": True,
        "reward": reward,
        "balance": int(new_balance or 0),
        "message": f"Coleta concluída: +{reward} Luma Coins.",
    }


@app.get("/api/dashboard/blog/posts")
async def dashboard_blog_posts(request: Request, limit: int = Query(default=50, ge=1, le=200)) -> dict[str, Any]:
    _require_auth(request)
    user = request.session.get("user")
    user_id = _require_session_user_id(request)

    pool = _db_pool()
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    async with pool.acquire() as connection:
        own_rows = await connection.fetch(
            """
            SELECT id, title, slug, content, is_published, created_at, updated_at, published_at
            FROM blog_posts
            WHERE author_user_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            """,
            user_id,
            limit,
        )
        public_rows = await connection.fetch(
            """
            SELECT id, author_name, title, slug, content, created_at, published_at
            FROM blog_posts
            WHERE is_published = TRUE
            ORDER BY COALESCE(published_at, created_at) DESC
            LIMIT $1
            """,
            min(25, limit),
        )

    return {
        "ok": True,
        "author": {
            "user_id": str(user_id),
            "username": str((user or {}).get("username") or "Dashboard User"),
        },
        "my_posts": [
            {
                "id": int(row.get("id") or 0),
                "title": str(row.get("title") or ""),
                "slug": str(row.get("slug") or ""),
                "content": str(row.get("content") or ""),
                "is_published": bool(row.get("is_published")),
                "created_at": row.get("created_at").isoformat() if row.get("created_at") and hasattr(row.get("created_at"), "isoformat") else None,
                "updated_at": row.get("updated_at").isoformat() if row.get("updated_at") and hasattr(row.get("updated_at"), "isoformat") else None,
                "published_at": row.get("published_at").isoformat() if row.get("published_at") and hasattr(row.get("published_at"), "isoformat") else None,
            }
            for row in own_rows
        ],
        "public_posts": [
            {
                "id": int(row.get("id") or 0),
                "author_name": str(row.get("author_name") or "Luma Team"),
                "title": str(row.get("title") or ""),
                "slug": str(row.get("slug") or ""),
                "content": str(row.get("content") or ""),
                "created_at": row.get("created_at").isoformat() if row.get("created_at") and hasattr(row.get("created_at"), "isoformat") else None,
                "published_at": row.get("published_at").isoformat() if row.get("published_at") and hasattr(row.get("published_at"), "isoformat") else None,
            }
            for row in public_rows
        ],
    }


@app.post("/api/dashboard/blog/posts")
async def dashboard_blog_create_post(payload: BlogPostCreatePayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    user = request.session.get("user")
    user_id = _require_session_user_id(request)
    username = str((user or {}).get("username") or "Dashboard User")

    pool = _db_pool()
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    base_slug = _slugify_blog_title(payload.title)
    slug = base_slug

    async with pool.acquire() as connection:
        for idx in range(0, 20):
            attempt_slug = slug if idx == 0 else f"{base_slug}-{idx + 1}"
            exists = await connection.fetchval("SELECT 1 FROM blog_posts WHERE slug = $1", attempt_slug)
            if not exists:
                slug = attempt_slug
                break

        row = await connection.fetchrow(
            """
            INSERT INTO blog_posts (author_user_id, author_name, title, slug, content, is_published, published_at, updated_at)
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                CASE WHEN $6 THEN CURRENT_TIMESTAMP ELSE NULL END,
                CURRENT_TIMESTAMP
            )
            RETURNING id, title, slug, is_published, created_at, published_at
            """,
            user_id,
            username,
            payload.title.strip(),
            slug,
            payload.content.strip(),
            bool(payload.is_published),
        )

    return {
        "ok": True,
        "post": {
            "id": int(row.get("id") or 0),
            "title": str(row.get("title") or ""),
            "slug": str(row.get("slug") or ""),
            "is_published": bool(row.get("is_published")),
            "created_at": row.get("created_at").isoformat() if row.get("created_at") and hasattr(row.get("created_at"), "isoformat") else None,
            "published_at": row.get("published_at").isoformat() if row.get("published_at") and hasattr(row.get("published_at"), "isoformat") else None,
        },
    }


@app.get("/api/public/news/latest")
async def public_news_latest(after_id: int = Query(default=0, ge=0), limit: int = Query(default=5, ge=1, le=20)) -> dict[str, Any]:
    pool = _db_pool()
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    async with pool.acquire() as connection:
        rows = await connection.fetch(
            """
            SELECT id, author_name, title, slug, content, created_at, published_at
            FROM blog_posts
            WHERE is_published = TRUE
            ORDER BY COALESCE(published_at, created_at) DESC
            LIMIT $1
            """,
            limit,
        )
        newest_id = await connection.fetchval(
            "SELECT COALESCE(MAX(id), 0) FROM blog_posts WHERE is_published = TRUE"
        )

    return {
        "ok": True,
        "newest_id": int(newest_id or 0),
        "has_new": int(newest_id or 0) > int(after_id or 0),
        "posts": [
            {
                "id": int(row.get("id") or 0),
                "author_name": str(row.get("author_name") or "Luma Team"),
                "title": str(row.get("title") or ""),
                "slug": str(row.get("slug") or ""),
                "content": str(row.get("content") or ""),
                "created_at": row.get("created_at").isoformat() if row.get("created_at") and hasattr(row.get("created_at"), "isoformat") else None,
                "published_at": row.get("published_at").isoformat() if row.get("published_at") and hasattr(row.get("published_at"), "isoformat") else None,
            }
            for row in rows
        ],
    }


@app.put("/api/dashboard/levels")
async def update_leveling_settings(payload: LevelingSettingsPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = await _require_dashboard_role(request, "moderator")
    guild_id_str = str(active_guild.get("id"))

    try:
        guild_id_int = int(guild_id_str)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid guild id")

    pool = _db_pool()
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        async with pool.acquire() as connection:
            await connection.execute(
                "INSERT INTO guilds (guild_id) VALUES ($1) ON CONFLICT (guild_id) DO NOTHING",
                guild_id_int,
            )
            await connection.execute(
                "UPDATE guilds SET leveling_enabled = $1 WHERE guild_id = $2",
                payload.leveling_enabled,
                guild_id_int,
            )
            await connection.execute(
                """
                INSERT INTO leveling_settings (guild_id, xp_multiplier, cooldown_seconds, level_up_message)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (guild_id)
                DO UPDATE SET
                    xp_multiplier = EXCLUDED.xp_multiplier,
                    cooldown_seconds = EXCLUDED.cooldown_seconds,
                    level_up_message = EXCLUDED.level_up_message
                """,
                guild_id_int,
                round(payload.xp_multiplier, 2),
                payload.cooldown_seconds,
                payload.level_up_message,
            )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save leveling settings: {exc}") from exc

    user = request.session.get("user")
    moderator_id = _extract_discord_id(user.get("id") if isinstance(user, dict) else None)
    await _log_dashboard_changes(
        guild_id_str,
        moderator_id,
        [f"Leveling enabled: {_format_diff_value(payload.leveling_enabled)}", f"XP multiplier: {payload.xp_multiplier}"],
    )

    return {"ok": True, "active_guild_id": guild_id_str}


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


@app.get("/api/dashboard/mk-script/status")
async def dashboard_mk_script_status(request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))
    dashboard_role = await _dashboard_role_for_user(request, active_guild)
    can_launch = _role_rank(dashboard_role) >= _role_rank("moderator")

    mk_status = _get_mk_script_status_for_guild(guild_id)
    message = (
        "MK Script esta ativo no bot."
        if mk_status.get("bot_active")
        else "MK Script ainda nao foi sincronizado com o bot."
    )
    return {
        "ok": True,
        "active_guild_id": guild_id,
        "dashboard_role": dashboard_role,
        "can_launch": can_launch,
        "mk_status": {
            **mk_status,
            "message": message,
        },
    }


@app.post("/api/dashboard/mk-script/launch")
async def dashboard_mk_script_launch(payload: MKScriptLaunchPayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = await _require_dashboard_role(request, "moderator")
    guild_id = str(active_guild.get("id"))

    user = request.session.get("user")
    updated_by = str(user.get("username") or user.get("id") or "dashboard-user") if isinstance(user, dict) else "dashboard-user"

    previous = _get_mk_script_status_for_guild(guild_id)
    launch_count = max(0, int(previous.get("launch_count") or 0)) + 1
    merged = _set_mk_script_status_for_guild(
        guild_id,
        {
            "bot_active": payload.blocks > 0,
            "launch_count": launch_count,
            "last_launch_at": datetime.utcnow().isoformat() + "Z",
            "last_validation_status": payload.validation_status,
            "last_flow_summary": payload.flow_summary,
            "last_blocks": payload.blocks,
            "last_links": payload.links,
            "updated_by": updated_by,
        },
    )

    return {
        "ok": True,
        "active_guild_id": guild_id,
        "mk_status": {
            **merged,
            "message": "Seu Script MK foi lancado ao bot",
        },
    }


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
    events = await _fetch_important_events(guild_id, limit=limit)
    return {"ok": True, "active_guild_id": guild_id, "events": events, "logs": events}


@app.get("/api/dashboard/activity/stream")
async def dashboard_activity_stream(request: Request) -> StreamingResponse:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))

    async def generator():
        last_seen = ""
        for _ in range(120):
            events = await _fetch_important_events(guild_id, limit=25)
            if events:
                newest = events[0].get("created_at", "")
                if newest and newest != last_seen:
                    last_seen = newest
                    yield f"data: {json.dumps({'events': events[:10], 'logs': events[:10]})}\n\n"
            await asyncio.sleep(5)

    return StreamingResponse(generator(), media_type="text/event-stream")


@app.get("/api/dashboard/events/important")
async def dashboard_important_events(
    request: Request,
    limit: int = Query(default=30, ge=1, le=200),
) -> dict[str, Any]:
    _require_auth(request)
    active_guild = _require_active_guild(request)
    guild_id = str(active_guild.get("id"))
    events = await _fetch_important_events(guild_id, limit=limit)
    return {"ok": True, "active_guild_id": guild_id, "events": events}


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


@app.put("/api/dashboard/economy/voice-drops")
async def update_voice_drops(payload: VoiceDropsUpdatePayload, request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = await _require_dashboard_role(request, "admin")
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))

    state = await _get_effective_state_for_guild(guild_id, guild_name)
    previous_state = json.loads(json.dumps(state))

    normalized_payload = payload.model_dump()
    normalized_payload["reward_max"] = max(int(normalized_payload.get("reward_max") or 0), int(normalized_payload.get("reward_min") or 0))
    normalized_payload["daily_cap"] = max(int(normalized_payload["reward_max"]), int(normalized_payload.get("daily_cap") or 0))
    normalized_payload["reminder_minutes"] = min(int(normalized_payload.get("reminder_minutes") or 0), int(normalized_payload.get("interval_minutes") or 15))

    state["voice_drops"].update(normalized_payload)
    state = await _persist_state_for_guild(guild_id, guild_name, state)

    changes = _collect_setup_changes(previous_state, state)
    user = request.session.get("user")
    moderator_id = _extract_discord_id(user.get("id") if isinstance(user, dict) else None)
    await _create_snapshot(guild_id, state, created_by=moderator_id, source="voice_drops", changes=changes)
    await _log_dashboard_changes(guild_id, moderator_id, changes)

    return {
        "ok": True,
        "active_guild_id": guild_id,
        "state": _state_with_metrics(state),
        "applied_changes": changes,
    }


@app.put("/api/dashboard/entry-exit")
async def update_entry_exit_settings(payload: EntryExitEmbedSettings, request: Request) -> dict[str, Any]:
    _require_auth(request)
    active_guild = await _require_dashboard_role(request, "admin")
    guild_id = str(active_guild.get("id"))
    guild_name = str(active_guild.get("name", f"Guild {guild_id}"))

    state = await _get_effective_state_for_guild(guild_id, guild_name)
    previous_state = json.loads(json.dumps(state))
    state["entry_exit"].update(payload.model_dump())
    state = await _persist_state_for_guild(guild_id, guild_name, state)

    changes = _collect_setup_changes(previous_state, state)
    user = request.session.get("user")
    moderator_id = _extract_discord_id(user.get("id") if isinstance(user, dict) else None)
    await _create_snapshot(guild_id, state, created_by=moderator_id, source="entry_exit", changes=changes)
    await _log_dashboard_changes(guild_id, moderator_id, changes)

    return {
        "ok": True,
        "active_guild_id": guild_id,
        "state": _state_with_metrics(state),
        "applied_changes": changes,
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