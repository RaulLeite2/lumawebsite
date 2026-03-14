let dashboardContext = null;

const page = document.body.dataset.page || "overview";

const COG_DESCRIPTIONS = {
    admin: "Administrative commands and permission-gated controls.",
    ai: "Assistant commands and AI-powered responses.",
    events: "Server event listeners and automated reactions.",
    help: "Help menus and usage guidance for members.",
    levels: "XP, rank progression and engagement rewards.",
    mail: "Modmail conversations and staff inbox workflows.",
    meme: "Fun content commands and entertainment features.",
    mod: "Moderation actions, warns, bans and staff tooling.",
    rolepanel: "Self-role and reaction-based role assignment panels.",
    setup: "Initial configuration commands and guided setup tools.",
    stats: "Guild metrics, counters and visibility widgets.",
    ticket: "Ticket flows, support panels and close actions.",
};

function flash(message) {
    const el = document.getElementById("flash");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 1800);
}

async function api(path, options = {}) {
    const response = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });

    if (response.status === 401) {
        const next = encodeURIComponent(window.location.pathname || "/dashboard/overview");
        window.location.href = `/auth/login?next=${next}`;
        throw new Error("Authentication required");
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.detail || "Request failed");
    }
    return data;
}

function setUser(session) {
    const userBox = document.getElementById("session-user");
    if (!userBox) return;

    const user = session.user || {};
    const label = user.global_name || user.username || "Unknown";
    userBox.textContent = `Signed in as ${label}`;
}

function setGuildSwitcher(guilds, activeGuildId) {
    const select = document.getElementById("guild-select");
    if (!select) return;

    select.innerHTML = "";
    if (!guilds.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No servers available";
        select.appendChild(option);
        select.disabled = true;
        return;
    }

    select.disabled = false;
    guilds.forEach((guild) => {
        const option = document.createElement("option");
        option.value = guild.id;
        option.textContent = guild.name;
        if (guild.id === activeGuildId) option.selected = true;
        select.appendChild(option);
    });
}

function renderCommon(context) {
    const state = context.state;

    const ids = {
        warnings: document.getElementById("metric-warnings"),
        tickets: document.getElementById("metric-tickets"),
        modmail: document.getElementById("metric-modmail"),
        cogs: document.getElementById("metric-cogs"),
        guildName: document.getElementById("metric-guild-name"),
    };

    if (ids.warnings) ids.warnings.textContent = state.metrics.warnings_24h;
    if (ids.tickets) ids.tickets.textContent = state.metrics.open_tickets;
    if (ids.modmail) ids.modmail.textContent = state.metrics.modmail_threads;
    if (ids.cogs) ids.cogs.textContent = state.metrics.cogs_enabled;
    if (ids.guildName) ids.guildName.textContent = state.guild.guild_name;
}

function renderOverview(context) {
    const target = document.getElementById("overview-cogs");
    if (!target) return;

    target.innerHTML = "";
    Object.entries(context.state.cogs).forEach(([name, enabled]) => {
        const row = document.createElement("div");
        row.className = "switch-row";
        row.innerHTML = `<span>${name}</span><span>${enabled ? "Enabled" : "Disabled"}</span>`;
        target.appendChild(row);
    });
}

function renderServers(context) {
    const grid = document.getElementById("servers-grid");
    if (!grid) return;

    const guilds = context.guilds || [];
    const counts = context.guild_counts || {};
    const manageableCount = Number.isFinite(counts.configurable) ? counts.configurable : guilds.filter((g) => g.configurable).length;
    const totalCount = Number.isFinite(counts.total) ? counts.total : guilds.length;

    const totalEl = document.getElementById("servers-total");
    const manageableEl = document.getElementById("servers-manageable");
    if (totalEl) totalEl.textContent = String(totalCount);
    if (manageableEl) manageableEl.textContent = String(manageableCount);

    grid.innerHTML = "";

    if (!guilds.length) {
        const empty = document.createElement("article");
        empty.className = "server-card";
        empty.innerHTML = `
            <div class="server-meta">
                <span class="server-fallback">?</span>
                <div class="server-text">
                    <div class="server-name">No servers found</div>
                    <div class="server-role">Try logging out and in again to refresh Discord guild permissions.</div>
                </div>
            </div>
        `;
        grid.appendChild(empty);
        return;
    }

    guilds.forEach((guild) => {
        const card = document.createElement("article");
        card.className = "server-card";

        const iconMarkup = guild.icon
            ? `<img class="server-icon" src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128" alt="${guild.name}">`
            : `<span class="server-fallback">${(guild.name || "?").slice(0, 1).toUpperCase()}</span>`;

        const role = guild.owner ? "Owner" : guild.configurable ? "Administrator" : "Member";
        const disabledAttr = guild.configurable ? "" : "disabled";
        const buttonLabel = guild.configurable ? "Configure" : "No Access";
        card.innerHTML = `
            <div class="server-meta">
                ${iconMarkup}
                <div class="server-text">
                    <div class="server-name">${guild.name}</div>
                    <div class="server-role">${role}</div>
                </div>
            </div>
            <button class="btn primary" data-configure-guild="${guild.id}" ${disabledAttr}>${buttonLabel}</button>
        `;

        grid.appendChild(card);
    });
}

function renderModeration(context) {
    const m = context.state.moderation;
    const refs = {
        enabled: document.getElementById("mod-enabled"),
        flood: document.getElementById("mod-flood"),
        limit: document.getElementById("mod-limit"),
        action: document.getElementById("mod-action"),
        modmail: document.getElementById("mod-modmail"),
        tickets: document.getElementById("mod-tickets"),
    };

    if (!refs.enabled) return;
    refs.enabled.checked = m.enabled;
    refs.flood.checked = m.smart_antiflood;
    refs.limit.value = m.warning_limit;
    refs.action.value = m.default_action;
    refs.modmail.checked = m.modmail_enabled;
    refs.tickets.checked = m.tickets_enabled;
}

function renderGuildSettings(context) {
    const g = context.state.guild;
    const moderation = context.state.moderation;
    const automation = context.state.automation;
    const warnings = context.state.warnings;
    const logs = context.state.logs;
    const modmail = context.state.modmail;
    const metrics = context.state.metrics || {};

    const refs = {
        name: document.getElementById("guild-name"),
        language: document.getElementById("guild-language"),
        log: document.getElementById("guild-log"),
        autoEnabled: document.getElementById("auto-enabled"),
        autoInvite: document.getElementById("auto-invite"),
        autoLink: document.getElementById("auto-link"),
        autoCaps: document.getElementById("auto-caps"),
        autoThreshold: document.getElementById("auto-threshold"),
        autoRole: document.getElementById("auto-role"),
        warnEnabled: document.getElementById("warn-enabled"),
        warnPublicReason: document.getElementById("warn-public-reason"),
        warnDmUser: document.getElementById("warn-dm-user"),
        warnThreshold: document.getElementById("warn-threshold"),
        warnAction: document.getElementById("warn-action"),
        logEnabled: document.getElementById("log-enabled"),
        logModeration: document.getElementById("log-moderation"),
        logBanEvents: document.getElementById("log-ban-events"),
        logJoinLeave: document.getElementById("log-join-leave"),
        logMessageDelete: document.getElementById("log-message-delete"),
        logModmail: document.getElementById("log-modmail"),
        logAuditChannel: document.getElementById("log-audit-channel"),
        logBanChannel: document.getElementById("log-ban-channel"),
        modmailEnabled: document.getElementById("modmail-enabled"),
        modmailAnonymous: document.getElementById("modmail-anonymous"),
        modmailIdle: document.getElementById("modmail-idle"),
        modmailChannel: document.getElementById("modmail-channel"),
        modmailRole: document.getElementById("modmail-role"),
        modmailHours: document.getElementById("modmail-hours"),
        protectionCount: document.getElementById("setup-protection-count"),
        logCount: document.getElementById("setup-log-count"),
        warnActionSummary: document.getElementById("setup-warn-action"),
    };

    if (!refs.name) return;

    refs.name.value = g.guild_name;
    refs.language.value = g.language;
    refs.log.value = g.log_channel;

    refs.autoEnabled.checked = automation.enabled;
    refs.autoInvite.checked = automation.invite_filter;
    refs.autoLink.checked = automation.link_filter;
    refs.autoCaps.checked = automation.caps_filter;
    refs.autoThreshold.value = automation.spam_threshold;
    refs.autoRole.value = automation.quarantine_role;

    refs.warnEnabled.checked = warnings.enabled;
    refs.warnPublicReason.checked = warnings.public_reason_prompt;
    refs.warnDmUser.checked = warnings.dm_user;
    refs.warnThreshold.value = warnings.threshold;
    refs.warnAction.value = warnings.escalate_to;

    refs.logEnabled.checked = logs.enabled;
    refs.logModeration.checked = logs.moderation;
    refs.logBanEvents.checked = logs.ban_events;
    refs.logJoinLeave.checked = logs.join_leave;
    refs.logMessageDelete.checked = logs.message_delete;
    refs.logModmail.checked = logs.modmail_transcripts;
    refs.logAuditChannel.value = logs.audit_channel;
    refs.logBanChannel.value = logs.ban_channel;

    refs.modmailEnabled.checked = modmail.enabled;
    refs.modmailAnonymous.checked = modmail.anonymous_replies;
    refs.modmailIdle.checked = modmail.close_on_idle;
    refs.modmailChannel.value = modmail.inbox_channel;
    refs.modmailRole.value = modmail.alert_role;
    refs.modmailHours.value = modmail.auto_close_hours;

    refs.protectionCount.textContent = String(metrics.protection_layers ?? 0);
    refs.logCount.textContent = String(metrics.logs_enabled ?? 0);
    refs.warnActionSummary.textContent = String(warnings.escalate_to || moderation.default_action).toUpperCase();

    renderSetupCogs(context);
}

function renderCogs(context) {
    const list = document.getElementById("cogs-list");
    if (!list) return;

    list.innerHTML = "";
    Object.entries(context.state.cogs).forEach(([name, enabled]) => {
        const row = document.createElement("label");
        row.className = "switch-row";
        row.style.padding = "0.34rem 0";

        const title = document.createElement("span");
        title.textContent = name;
        row.appendChild(title);

        const toggle = document.createElement("input");
        toggle.type = "checkbox";
        toggle.className = "switch";
        toggle.checked = enabled;
        toggle.dataset.cog = name;
        row.appendChild(toggle);

        list.appendChild(row);
    });
}

function renderSetupCogs(context) {
    const list = document.getElementById("setup-cogs-list");
    if (!list) return;

    list.innerHTML = "";
    Object.entries(context.state.cogs).forEach(([name, enabled]) => {
        const tile = document.createElement("label");
        tile.className = "cog-tile";

        tile.innerHTML = `
            <header>
                <strong>${name}</strong>
                <input type="checkbox" class="switch" data-setup-cog="${name}" ${enabled ? "checked" : ""}>
            </header>
            <p>${COG_DESCRIPTIONS[name] || "Module controls for this guild."}</p>
        `;

        list.appendChild(tile);
    });
}

function renderPage(context) {
    renderCommon(context);
    if (page === "servers") renderServers(context);
    if (page === "overview") renderOverview(context);
    if (page === "moderation") renderModeration(context);
    if (page === "guild-settings") renderGuildSettings(context);
    if (page === "cogs") renderCogs(context);
}

async function loadState() {
    const payload = await api("/api/dashboard/state");
    dashboardContext = payload;
    renderPage(payload);
    setGuildSwitcher(payload.guilds || [], payload.active_guild_id);
}

async function loadSession() {
    const session = await api("/api/auth/session");
    if (!session.authenticated) {
        const next = encodeURIComponent(window.location.pathname || "/dashboard/overview");
        window.location.href = `/auth/login?next=${next}`;
        return;
    }

    setUser(session);
    setGuildSwitcher(session.guilds || [], session.active_guild_id || "");
}

function bindGuildSwitcher() {
    const select = document.getElementById("guild-select");
    if (!select) return;

    select.addEventListener("change", async () => {
        try {
            await api("/api/dashboard/active-guild", {
                method: "PUT",
                body: JSON.stringify({ guild_id: select.value }),
            });
            await loadState();
            flash("Guild switched");
        } catch (error) {
            flash("Failed to switch guild");
        }
    });
}

function bindPageActions() {
    const serversGrid = document.getElementById("servers-grid");
    if (serversGrid) {
        serversGrid.addEventListener("click", async (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;

            const guildId = target.dataset.configureGuild;
            if (!guildId) return;

            try {
                await api("/api/dashboard/active-guild", {
                    method: "PUT",
                    body: JSON.stringify({ guild_id: guildId }),
                });
                window.location.href = "/dashboard/overview";
            } catch (error) {
                flash("Failed to select guild");
            }
        });
    }

    const saveModeration = document.getElementById("save-moderation");
    if (saveModeration) {
        saveModeration.addEventListener("click", async () => {
            const payload = {
                enabled: document.getElementById("mod-enabled").checked,
                smart_antiflood: document.getElementById("mod-flood").checked,
                warning_limit: Number(document.getElementById("mod-limit").value || 3),
                default_action: document.getElementById("mod-action").value,
                modmail_enabled: document.getElementById("mod-modmail").checked,
                tickets_enabled: document.getElementById("mod-tickets").checked,
            };
            try {
                const res = await api("/api/dashboard/moderation", {
                    method: "PUT",
                    body: JSON.stringify(payload),
                });
                dashboardContext.state = res.state;
                renderPage(dashboardContext);
                flash("Moderation updated");
            } catch (error) {
                flash("Failed to update moderation");
            }
        });
    }

    const saveGuild = document.getElementById("save-guild");
    if (saveGuild) {
        saveGuild.addEventListener("click", async () => {
            const payload = {
                guild_name: document.getElementById("guild-name").value.trim(),
                language: document.getElementById("guild-language").value,
                log_channel: document.getElementById("guild-log").value.trim(),
            };
            try {
                const res = await api("/api/dashboard/guild", {
                    method: "PUT",
                    body: JSON.stringify(payload),
                });
                dashboardContext.state = res.state;
                renderPage(dashboardContext);
                flash("Guild settings updated");
            } catch (error) {
                flash("Failed to update guild settings");
            }
        });
    }

    const saveSetup = document.getElementById("save-setup");
    if (saveSetup) {
        saveSetup.addEventListener("click", async () => {
            const setupToggles = document.querySelectorAll("input[data-setup-cog]");
            const cogs = {};
            setupToggles.forEach((toggle) => {
                cogs[toggle.dataset.setupCog] = toggle.checked;
            });

            const warnAction = document.getElementById("warn-action").value;
            const currentModeration = dashboardContext?.state?.moderation || {};
            const payload = {
                guild: {
                    guild_name: document.getElementById("guild-name").value.trim(),
                    language: document.getElementById("guild-language").value,
                    log_channel: document.getElementById("guild-log").value.trim(),
                },
                moderation: {
                    enabled: document.getElementById("warn-enabled").checked || document.getElementById("auto-enabled").checked,
                    smart_antiflood: document.getElementById("auto-enabled").checked,
                    warning_limit: Number(document.getElementById("warn-threshold").value || 3),
                    default_action: warnAction === "timeout" ? "mute" : warnAction,
                    modmail_enabled: document.getElementById("modmail-enabled").checked,
                    tickets_enabled: Boolean(currentModeration.tickets_enabled),
                },
                automation: {
                    enabled: document.getElementById("auto-enabled").checked,
                    invite_filter: document.getElementById("auto-invite").checked,
                    link_filter: document.getElementById("auto-link").checked,
                    caps_filter: document.getElementById("auto-caps").checked,
                    spam_threshold: Number(document.getElementById("auto-threshold").value || 6),
                    quarantine_role: document.getElementById("auto-role").value.trim(),
                },
                warnings: {
                    enabled: document.getElementById("warn-enabled").checked,
                    public_reason_prompt: document.getElementById("warn-public-reason").checked,
                    dm_user: document.getElementById("warn-dm-user").checked,
                    threshold: Number(document.getElementById("warn-threshold").value || 3),
                    escalate_to: warnAction,
                },
                logs: {
                    enabled: document.getElementById("log-enabled").checked,
                    moderation: document.getElementById("log-moderation").checked,
                    ban_events: document.getElementById("log-ban-events").checked,
                    join_leave: document.getElementById("log-join-leave").checked,
                    message_delete: document.getElementById("log-message-delete").checked,
                    modmail_transcripts: document.getElementById("log-modmail").checked,
                    audit_channel: document.getElementById("log-audit-channel").value.trim(),
                    ban_channel: document.getElementById("log-ban-channel").value.trim(),
                },
                modmail: {
                    enabled: document.getElementById("modmail-enabled").checked,
                    anonymous_replies: document.getElementById("modmail-anonymous").checked,
                    close_on_idle: document.getElementById("modmail-idle").checked,
                    inbox_channel: document.getElementById("modmail-channel").value.trim(),
                    alert_role: document.getElementById("modmail-role").value.trim(),
                    auto_close_hours: Number(document.getElementById("modmail-hours").value || 48),
                },
                cogs,
            };

            try {
                const res = await api("/api/dashboard/setup", {
                    method: "PUT",
                    body: JSON.stringify(payload),
                });
                dashboardContext.state = res.state;
                renderPage(dashboardContext);
                flash("Bot setup updated");
            } catch (error) {
                flash("Failed to update bot setup");
            }
        });
    }

    const saveCogs = document.getElementById("save-cogs");
    if (saveCogs) {
        saveCogs.addEventListener("click", async () => {
            const toggles = document.querySelectorAll("input[data-cog]");
            const cogs = {};
            toggles.forEach((toggle) => {
                cogs[toggle.dataset.cog] = toggle.checked;
            });
            try {
                const res = await api("/api/dashboard/cogs", {
                    method: "PUT",
                    body: JSON.stringify({ cogs }),
                });
                dashboardContext.state = res.state;
                renderPage(dashboardContext);
                flash("Cogs updated");
            } catch (error) {
                flash("Failed to update cogs");
            }
        });
    }

    const reset = document.getElementById("reset-guild");
    if (reset) {
        reset.addEventListener("click", async () => {
            try {
                const res = await api("/api/dashboard/reset", { method: "POST", body: "{}" });
                dashboardContext.state = res.state;
                renderPage(dashboardContext);
                flash("Guild dashboard reset");
            } catch (error) {
                flash("Failed to reset guild dashboard");
            }
        });
    }
}

(async function boot() {
    try {
        bindGuildSwitcher();
        bindPageActions();
        const session = await api("/api/auth/session");
        if (!session.authenticated) {
            const next = encodeURIComponent(window.location.pathname || "/dashboard/servers");
            window.location.href = `/auth/login?next=${next}`;
            return;
        }

        setUser(session);
        setGuildSwitcher(session.guilds || [], session.active_guild_id || "");

        if (page === "servers") {
            dashboardContext = session;
            renderServers(session);
            return;
        }

        await loadState();
    } catch (error) {
        flash("Failed to load dashboard");
    }
})();
