let dashboardContext = null;
let setupDirty = false;
let setupDirtyTrackingBound = false;
let setupResources = { text_channels: [], categories: [], roles: [] };
let selectedModmailRoles = [];

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

function updateConfigLogBadge(unreadCount) {
    const badges = document.querySelectorAll(".config-log-dot");
    badges.forEach((badge) => {
        const value = Number(unreadCount || 0);
        if (value > 0) {
            badge.hidden = false;
            badge.textContent = value > 99 ? "99+" : String(value);
        } else {
            badge.hidden = true;
            badge.textContent = "0";
        }
    });
}

function updateSetupDirtyState(isDirty, message) {
    setupDirty = isDirty;
    const hint = document.getElementById("setup-dirty-state");
    const saveButton = document.getElementById("save-setup");
    if (hint) {
        hint.textContent = message || (isDirty ? "You have unsaved changes in this setup." : "Everything saved for this guild.");
        hint.classList.toggle("is-dirty", isDirty);
        hint.classList.toggle("is-clean", !isDirty);
    }
    if (saveButton) {
        saveButton.textContent = isDirty ? "Save Bot Setup" : "Saved";
    }
}

function playApplySound() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        const tones = [660, 880, 990];
        tones.forEach((freq, index) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, now + index * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.06, now + index * 0.08 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.08 + 0.09);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + index * 0.08);
            osc.stop(now + index * 0.08 + 0.1);
        });
    } catch (error) {
        // Browser may block sound until user interaction; ignore silently.
    }
}

function showSetupSaveBanner(state, changes = []) {
    const banner = document.getElementById("setup-save-banner");
    if (!banner || !state) return;

    const title = document.getElementById("setup-save-title");
    const detail = document.getElementById("setup-save-detail");
    const meta = document.getElementById("setup-save-meta");
    const status = document.getElementById("setup-save-state");
    const list = document.getElementById("setup-save-list");
    const guildName = state.guild?.guild_name || "this guild";
    const enabledCogs = Object.values(state.cogs || {}).filter(Boolean).length;
    const logStreams = [state.logs?.moderation, state.logs?.ban_events, state.logs?.join_leave, state.logs?.message_delete, state.logs?.modmail_transcripts].filter(Boolean).length;

    banner.hidden = false;
    if (status) status.textContent = "Saved";
    if (title) title.textContent = "Configuration updated successfully";
    if (detail) detail.textContent = `${guildName} now has ${enabledCogs} enabled modules and ${logStreams} active log streams.`;
    if (meta) meta.textContent = `Last sync at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
    if (list) {
        list.innerHTML = "";
        const items = changes.length ? changes.slice(0, 8) : ["No setting changed (values already matched)."];
        items.forEach((change) => {
            const li = document.createElement("li");
            li.textContent = change;
            list.appendChild(li);
        });
    }
}

function ensureOption(selectEl, value, label) {
    if (!selectEl || !value) return;
    const exists = Array.from(selectEl.options).some((opt) => opt.value === value);
    if (exists) return;
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label || value;
    selectEl.appendChild(option);
}

function populateSelect(selectEl, options, placeholder = "Not configured") {
    if (!selectEl) return;
    const previousValue = selectEl.value;
    selectEl.innerHTML = "";

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = placeholder;
    selectEl.appendChild(empty);

    options.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = `#${item.name}`;
        selectEl.appendChild(option);
    });

    if (previousValue) {
        ensureOption(selectEl, previousValue, previousValue);
        selectEl.value = previousValue;
    }
}

function populateRoleSelect(selectEl, roles) {
    if (!selectEl) return;
    const previousValue = selectEl.value;
    selectEl.innerHTML = "";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Select a role";
    selectEl.appendChild(empty);

    roles.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = `@${item.name}`;
        selectEl.appendChild(option);
    });

    if (previousValue) selectEl.value = previousValue;
}

function renderModmailRoleChips() {
    const list = document.getElementById("modmail-role-list");
    if (!list) return;

    list.innerHTML = "";
    if (!selectedModmailRoles.length) {
        const hint = document.createElement("span");
        hint.className = "save-hint";
        hint.textContent = "No alert roles selected.";
        list.appendChild(hint);
        return;
    }

    selectedModmailRoles.forEach((roleId) => {
        const role = (setupResources.roles || []).find((item) => item.id === roleId);
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "role-chip";
        chip.dataset.roleId = roleId;
        chip.textContent = role ? `@${role.name}` : roleId;
        chip.addEventListener("click", () => {
            chip.classList.toggle("selected");
        });
        list.appendChild(chip);
    });
}

function applyResourceSelectors(context) {
    setupResources = context.resources || { text_channels: [], categories: [], roles: [] };
    populateSelect(document.getElementById("guild-log"), setupResources.text_channels || [], "Choose a default log channel");
    populateSelect(document.getElementById("log-audit-channel"), setupResources.text_channels || [], "Choose an audit channel");
    populateSelect(document.getElementById("log-ban-channel"), setupResources.text_channels || [], "Choose a ban log channel");
    populateSelect(document.getElementById("modmail-channel"), setupResources.categories || [], "Choose a modmail category");
    populateRoleSelect(document.getElementById("auto-role"), setupResources.roles || []);
    populateRoleSelect(document.getElementById("modmail-role-picker"), setupResources.roles || []);
}

function getWarnEscalationStepsFromForm() {
    const steps = [
        {
            threshold: Number(document.getElementById("warn-step-1-threshold")?.value || 3),
            action: document.getElementById("warn-step-1-action")?.value || "timeout",
        },
        {
            threshold: Number(document.getElementById("warn-step-2-threshold")?.value || 6),
            action: document.getElementById("warn-step-2-action")?.value || "kick",
        },
        {
            threshold: Number(document.getElementById("warn-step-3-threshold")?.value || 9),
            action: document.getElementById("warn-step-3-action")?.value || "ban",
        },
    ];

    const sanitized = steps
        .filter((step) => Number.isFinite(step.threshold) && step.threshold >= 1)
        .sort((a, b) => a.threshold - b.threshold);

    return sanitized.length ? sanitized : [{ threshold: 3, action: "timeout" }];
}

function bindSetupDirtyTracking() {
    if (page !== "guild-settings" || setupDirtyTrackingBound) return;

    const trackedSelector = "#guild-language, #guild-log, #auto-enabled, #auto-antiflood, #auto-invite, #auto-link, #auto-caps, #auto-threshold, #auto-role, #warn-public-reason, #warn-dm-user, #warn-step-1-threshold, #warn-step-1-action, #warn-step-2-threshold, #warn-step-2-action, #warn-step-3-threshold, #warn-step-3-action, #log-enabled, #log-moderation, #log-ban-events, #log-join-leave, #log-message-delete, #log-modmail, #log-audit-channel, #log-ban-channel, #modmail-enabled, #modmail-anonymous, #modmail-idle, #modmail-channel, #modmail-role-picker, #modmail-hours, input[data-setup-cog]";

    const markDirty = (event) => {
        const target = event.target;
        if (!(target instanceof Element) || !target.matches(trackedSelector)) return;
        updateSetupDirtyState(true);
    };

    document.addEventListener("input", markDirty);
    document.addEventListener("change", markDirty);
    setupDirtyTrackingBound = true;
}

function bindSetupTopicNav() {
    if (page !== "guild-settings") return;

    const links = Array.from(document.querySelectorAll(".topic-link"));
    const sections = Array.from(document.querySelectorAll(".setup-topic"));
    if (!links.length) return;

    const activateTopic = (targetId) => {
        links.forEach((item) => {
            item.classList.toggle("active", item.getAttribute("href") === `#${targetId}`);
        });
        sections.forEach((section) => {
            section.hidden = section.id !== targetId;
        });
    };

    activateTopic("topic-foundation");

    links.forEach((link) => {
        link.addEventListener("click", (event) => {
            event.preventDefault();
            const targetId = (link.getAttribute("href") || "").replace("#", "");
            if (!targetId) return;
            activateTopic(targetId);
        });
    });
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
        autoAntiFlood: document.getElementById("auto-antiflood"),
        autoInvite: document.getElementById("auto-invite"),
        autoLink: document.getElementById("auto-link"),
        autoCaps: document.getElementById("auto-caps"),
        autoThreshold: document.getElementById("auto-threshold"),
        autoRole: document.getElementById("auto-role"),
        warnEnabled: document.getElementById("warn-enabled"),
        warnPublicReason: document.getElementById("warn-public-reason"),
        warnDmUser: document.getElementById("warn-dm-user"),
        warnStep1Threshold: document.getElementById("warn-step-1-threshold"),
        warnStep1Action: document.getElementById("warn-step-1-action"),
        warnStep2Threshold: document.getElementById("warn-step-2-threshold"),
        warnStep2Action: document.getElementById("warn-step-2-action"),
        warnStep3Threshold: document.getElementById("warn-step-3-threshold"),
        warnStep3Action: document.getElementById("warn-step-3-action"),
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
        modmailHours: document.getElementById("modmail-hours"),
        protectionCount: document.getElementById("setup-protection-count"),
        logCount: document.getElementById("setup-log-count"),
        warnActionSummary: document.getElementById("setup-warn-action"),
    };

    if (!refs.name) return;

    const activeGuild = (context.guilds || []).find((guild) => guild.id === context.active_guild_id);
    refs.name.value = activeGuild?.name || g.guild_name;
    refs.language.value = g.language;
    applyResourceSelectors(context);
    ensureOption(refs.log, g.log_channel, g.log_channel);
    refs.log.value = g.log_channel;

    refs.autoEnabled.checked = warnings.enabled;
    refs.autoAntiFlood.checked = moderation.smart_antiflood;
    refs.autoInvite.checked = automation.invite_filter;
    refs.autoLink.checked = automation.link_filter;
    refs.autoCaps.checked = automation.caps_filter;
    refs.autoThreshold.value = automation.spam_threshold;
    ensureOption(refs.autoRole, automation.quarantine_role, automation.quarantine_role);
    refs.autoRole.value = automation.quarantine_role;

    refs.warnEnabled.checked = true;
    refs.warnEnabled.disabled = true;
    refs.warnPublicReason.checked = warnings.public_reason_prompt;
    refs.warnDmUser.checked = warnings.dm_user;

    const steps = Array.isArray(warnings.escalation_steps) && warnings.escalation_steps.length
        ? warnings.escalation_steps
        : [{ threshold: 3, action: "timeout" }, { threshold: 6, action: "kick" }, { threshold: 9, action: "ban" }];
    const safe = [steps[0], steps[1] || steps[0], steps[2] || steps[1] || steps[0]];
    refs.warnStep1Threshold.value = safe[0].threshold;
    refs.warnStep1Action.value = safe[0].action;
    refs.warnStep2Threshold.value = safe[1].threshold;
    refs.warnStep2Action.value = safe[1].action;
    refs.warnStep3Threshold.value = safe[2].threshold;
    refs.warnStep3Action.value = safe[2].action;

    refs.logEnabled.checked = logs.enabled;
    refs.logModeration.checked = logs.moderation;
    refs.logBanEvents.checked = logs.ban_events;
    refs.logJoinLeave.checked = logs.join_leave;
    refs.logMessageDelete.checked = logs.message_delete;
    refs.logModmail.checked = logs.modmail_transcripts;
    ensureOption(refs.logAuditChannel, logs.audit_channel, logs.audit_channel);
    refs.logAuditChannel.value = logs.audit_channel;
    ensureOption(refs.logBanChannel, logs.ban_channel, logs.ban_channel);
    refs.logBanChannel.value = logs.ban_channel;

    refs.modmailEnabled.checked = modmail.enabled;
    refs.modmailAnonymous.checked = modmail.anonymous_replies;
    refs.modmailIdle.checked = modmail.close_on_idle;
    ensureOption(refs.modmailChannel, modmail.inbox_channel, modmail.inbox_channel);
    refs.modmailChannel.value = modmail.inbox_channel;
    refs.modmailHours.value = modmail.auto_close_hours;
    selectedModmailRoles = Array.isArray(modmail.alert_roles)
        ? [...new Set(modmail.alert_roles.filter(Boolean).map(String))]
        : (modmail.alert_role ? [String(modmail.alert_role)] : []);
    renderModmailRoleChips();

    refs.protectionCount.textContent = String(metrics.protection_layers ?? 0);
    refs.logCount.textContent = String(metrics.logs_enabled ?? 0);
    refs.warnActionSummary.textContent = String(safe[0].action || moderation.default_action).toUpperCase();

    updateSetupDirtyState(false);

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

    const locked = new Set(context.locked_cogs || []);
    const isDev = Boolean(context.is_dev_user);

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

        const toggle = tile.querySelector("input[data-setup-cog]");
        if (toggle && locked.has(name) && !isDev) {
            toggle.disabled = true;
            tile.querySelector("p").textContent = "Locked module: only bot developer can disable this cog.";
        }

        list.appendChild(tile);
    });
}

function renderConfigLogs(logs) {
    const feed = document.getElementById("config-log-feed");
    if (!feed) return;

    feed.innerHTML = "";
    if (!logs.length) {
        const empty = document.createElement("article");
        empty.className = "log-item";
        empty.innerHTML = "<h3>No config changes yet</h3><p>When setup changes are applied, they will appear here.</p>";
        feed.appendChild(empty);
        return;
    }

    logs.forEach((item) => {
        const row = document.createElement("article");
        row.className = "log-item";
        const when = item.created_at ? new Date(item.created_at).toLocaleString() : "Unknown time";
        row.innerHTML = `
            <h3>${item.reason || "Configuration update"}</h3>
            <p>By: ${item.moderator_id || "unknown"}</p>
            <p>${when}</p>
        `;
        feed.appendChild(row);
    });
}

async function loadConfigLogs() {
    const response = await api("/api/dashboard/config-logs");
    renderConfigLogs(response.logs || []);
    updateConfigLogBadge(response.unread || 0);
}

function renderPage(context) {
    renderCommon(context);
    if (page === "servers") renderServers(context);
    if (page === "overview") renderOverview(context);
    if (page === "moderation") renderModeration(context);
    if (page === "guild-settings") renderGuildSettings(context);
    if (page === "cogs") renderCogs(context);
    if (page === "config-logs") renderConfigLogs(context.logs || []);
}

async function loadState() {
    const payload = await api("/api/dashboard/state");
    dashboardContext = payload;
    updateConfigLogBadge(payload.config_logs_unread || 0);
    renderPage(payload);
    setGuildSwitcher(payload.guilds || [], payload.active_guild_id);
    if (page === "config-logs") {
        await loadConfigLogs();
    }
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

            const warningSteps = getWarnEscalationStepsFromForm();
            const firstStep = warningSteps[0];
            const currentModeration = dashboardContext?.state?.moderation || {};
            const payload = {
                guild: {
                    guild_name: document.getElementById("guild-name").value.trim(),
                    language: document.getElementById("guild-language").value,
                    log_channel: document.getElementById("guild-log").value.trim(),
                },
                moderation: {
                    enabled: true,
                    smart_antiflood: document.getElementById("auto-antiflood").checked,
                    warning_limit: Number(firstStep.threshold || 3),
                    default_action: firstStep.action === "timeout" ? "mute" : firstStep.action,
                    modmail_enabled: document.getElementById("modmail-enabled").checked,
                    tickets_enabled: Boolean(currentModeration.tickets_enabled),
                },
                automation: {
                    enabled: document.getElementById("auto-antiflood").checked,
                    invite_filter: document.getElementById("auto-invite").checked,
                    link_filter: document.getElementById("auto-link").checked,
                    caps_filter: document.getElementById("auto-caps").checked,
                    spam_threshold: Number(document.getElementById("auto-threshold").value || 6),
                    quarantine_role: document.getElementById("auto-role").value.trim(),
                },
                warnings: {
                    enabled: true,
                    public_reason_prompt: document.getElementById("warn-public-reason").checked,
                    dm_user: document.getElementById("warn-dm-user").checked,
                    threshold: Number(firstStep.threshold || 3),
                    escalate_to: firstStep.action,
                    escalation_steps: warningSteps,
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
                    alert_role: selectedModmailRoles[0] || "",
                    alert_roles: [...selectedModmailRoles],
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
                showSetupSaveBanner(res.state, res.applied_changes || []);
                playApplySound();
                updateSetupDirtyState(false, "Everything saved for this guild.");
                try {
                    const logSync = await api("/api/dashboard/config-logs");
                    updateConfigLogBadge(logSync.unread || 0);
                } catch (error) {
                    // If log fetch fails we still keep setup save as successful.
                }
                flash("Bot setup updated");
            } catch (error) {
                flash("Failed to update bot setup");
            }
        });
    }

    const addRole = document.getElementById("modmail-role-add");
    if (addRole) {
        addRole.addEventListener("click", () => {
            const picker = document.getElementById("modmail-role-picker");
            if (!picker || !picker.value) return;
            if (!selectedModmailRoles.includes(picker.value)) {
                selectedModmailRoles.push(picker.value);
                renderModmailRoleChips();
                updateSetupDirtyState(true);
            }
        });
    }

    const removeRole = document.getElementById("modmail-role-remove");
    if (removeRole) {
        removeRole.addEventListener("click", () => {
            const selectedChips = Array.from(document.querySelectorAll("#modmail-role-list .role-chip.selected"));
            if (!selectedChips.length) return;
            const removeSet = new Set(selectedChips.map((item) => item.dataset.roleId));
            selectedModmailRoles = selectedModmailRoles.filter((roleId) => !removeSet.has(roleId));
            renderModmailRoleChips();
            updateSetupDirtyState(true);
        });
    }

    const ackLogs = document.getElementById("ack-config-logs");
    if (ackLogs) {
        ackLogs.addEventListener("click", async () => {
            try {
                await api("/api/dashboard/config-logs/ack", { method: "POST", body: "{}" });
                updateConfigLogBadge(0);
                flash("Config logs marked as read");
            } catch (error) {
                flash("Failed to update log notification state");
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
        bindSetupDirtyTracking();
        bindSetupTopicNav();
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
            try {
                const badgeData = await api("/api/dashboard/config-logs");
                updateConfigLogBadge(badgeData.unread || 0);
            } catch (error) {
                updateConfigLogBadge(0);
            }
            return;
        }

        await loadState();
    } catch (error) {
        flash("Failed to load dashboard");
    }
})();
