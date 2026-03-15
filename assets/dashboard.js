let dashboardContext = null;
let setupDirty = false;
let setupDirtyTrackingBound = false;
let setupResources = { text_channels: [], categories: [], roles: [] };
let selectedModmailRoles = [];
let selectedAutoImmuneRoles = [];
let liveActivityEventSource = null;
let warnFlowSteps = [];

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

function renderAutoImmuneRoleChips() {
    const list = document.getElementById("auto-immune-role-list");
    const hint = document.getElementById("auto-immune-hint");
    if (!list) return;

    list.innerHTML = "";
    if (!selectedAutoImmuneRoles.length) {
        const hint = document.createElement("span");
        hint.className = "save-hint";
        hint.textContent = "No custom immune roles selected.";
        list.appendChild(hint);
        if (document.getElementById("auto-immune-hint")) {
            document.getElementById("auto-immune-hint").textContent = "AutoMod immunity list is empty. Admin and moderation permissions remain immune by default.";
        }
        return;
    }

    selectedAutoImmuneRoles.forEach((roleId) => {
        const role = (setupResources.roles || []).find((item) => item.id === roleId);
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "role-chip";
        chip.dataset.roleId = roleId;
        chip.textContent = role ? `@${role.name} (ID: ${roleId})` : `ID: ${roleId}`;
        chip.addEventListener("click", () => chip.classList.toggle("selected"));
        list.appendChild(chip);
    });

    if (hint) {
        hint.textContent = `${selectedAutoImmuneRoles.length} immune role(s): ${selectedAutoImmuneRoles.join(", ")}`;
    }
}

function applyResourceSelectors(context) {
    setupResources = context.resources || { text_channels: [], categories: [], roles: [] };
    populateSelect(document.getElementById("guild-log"), setupResources.text_channels || [], "Choose a default log channel");
    populateSelect(document.getElementById("log-audit-channel"), setupResources.text_channels || [], "Choose an audit channel");
    populateSelect(document.getElementById("log-ban-channel"), setupResources.text_channels || [], "Choose a ban log channel");
    populateSelect(document.getElementById("modmail-channel"), setupResources.categories || [], "Choose a modmail category");
    populateSelect(document.getElementById("welcome-channel"), setupResources.text_channels || [], "Choose welcome channel");
    populateSelect(document.getElementById("leave-channel"), setupResources.text_channels || [], "Choose leave channel");
    populateRoleSelect(document.getElementById("auto-role"), setupResources.roles || []);
    populateRoleSelect(document.getElementById("auto-immune-role-picker"), setupResources.roles || []);
    populateRoleSelect(document.getElementById("modmail-role-picker"), setupResources.roles || []);
}

function getWarnEscalationStepsFromForm() {
    const flowRows = Array.from(document.querySelectorAll("#warn-flow-list .warn-flow-item"));
    if (flowRows.length) {
        const fromEditor = flowRows.map((row) => ({
            threshold: Number(row.querySelector("input")?.value || 1),
            action: row.querySelector("select")?.value || "timeout",
        }));
        const sanitizedEditor = fromEditor
            .filter((step) => Number.isFinite(step.threshold) && step.threshold >= 1)
            .sort((a, b) => a.threshold - b.threshold);
        if (sanitizedEditor.length) {
            return sanitizedEditor;
        }
    }

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

function renderWarnFlowEditor(steps) {
    const list = document.getElementById("warn-flow-list");
    if (!list) return;

    const sanitized = (Array.isArray(steps) ? steps : [])
        .map((item) => ({
            threshold: Number(item.threshold || 1),
            action: String(item.action || "timeout"),
        }))
        .filter((item) => Number.isFinite(item.threshold) && item.threshold >= 1);

    warnFlowSteps = sanitized.length ? sanitized : [{ threshold: 3, action: "timeout" }];
    list.innerHTML = "";

    warnFlowSteps.forEach((step, index) => {
        const row = document.createElement("div");
        row.className = "warn-flow-item";
        row.draggable = true;
        row.dataset.index = String(index);
        row.innerHTML = `
            <span class="drag-handle" title="Drag to reorder">::</span>
            <label>At</label>
            <input type="number" min="1" max="100" value="${step.threshold}">
            <span>warns apply</span>
            <select>
                <option value="timeout" ${step.action === "timeout" ? "selected" : ""}>Timeout</option>
                <option value="kick" ${step.action === "kick" ? "selected" : ""}>Kick</option>
                <option value="ban" ${step.action === "ban" ? "selected" : ""}>Ban</option>
                <option value="mute" ${step.action === "mute" ? "selected" : ""}>Mute</option>
            </select>
            <button type="button" class="btn danger warn-flow-remove">Remove</button>
        `;

        const thresholdInput = row.querySelector("input");
        const actionSelect = row.querySelector("select");
        const removeButton = row.querySelector(".warn-flow-remove");

        thresholdInput?.addEventListener("input", () => updateSetupDirtyState(true));
        actionSelect?.addEventListener("change", () => updateSetupDirtyState(true));
        removeButton?.addEventListener("click", () => {
            row.remove();
            updateSetupDirtyState(true);
        });

        row.addEventListener("dragstart", () => row.classList.add("dragging"));
        row.addEventListener("dragend", () => row.classList.remove("dragging"));

        list.appendChild(row);
    });

    if (!list.dataset.dragBound) {
        list.addEventListener("dragover", (event) => {
            event.preventDefault();
            const dragging = list.querySelector(".warn-flow-item.dragging");
            if (!dragging) return;
            const after = Array.from(list.querySelectorAll(".warn-flow-item:not(.dragging)"))
                .find((item) => {
                    const rect = item.getBoundingClientRect();
                    return event.clientY < rect.top + rect.height / 2;
                });
            if (after) list.insertBefore(dragging, after);
            else list.appendChild(dragging);
        });
        list.dataset.dragBound = "1";
    }
}

function bindSetupDirtyTracking() {
    if (page !== "guild-settings" || setupDirtyTrackingBound) return;

    const trackedSelector = "#guild-language, #guild-log, #auto-enabled, #auto-antiflood, #auto-invite, #auto-link, #auto-caps, #auto-threshold, #auto-role, #auto-immune-role-picker, #warn-public-reason, #warn-dm-user, #warn-step-1-threshold, #warn-step-1-action, #warn-step-2-threshold, #warn-step-2-action, #warn-step-3-threshold, #warn-step-3-action, #log-enabled, #log-moderation, #log-ban-events, #log-join-leave, #log-message-delete, #log-modmail, #log-audit-channel, #log-ban-channel, #modmail-enabled, #modmail-anonymous, #modmail-idle, #modmail-channel, #modmail-role-picker, #modmail-hours, #welcome-enabled, #welcome-channel, #welcome-title, #welcome-description, #welcome-color, #leave-enabled, #leave-channel, #leave-title, #leave-description, #leave-color, input[data-setup-cog]";

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
    const automation = context.state.automation;
    const refs = {
        enabled: document.getElementById("mod-enabled"),
        flood: document.getElementById("mod-flood"),
        limit: document.getElementById("mod-limit"),
        action: document.getElementById("mod-action"),
        modmail: document.getElementById("mod-modmail"),
        tickets: document.getElementById("mod-tickets"),
        autoInvite: document.getElementById("auto-invite"),
        autoLink: document.getElementById("auto-link"),
        autoCaps: document.getElementById("auto-caps"),
        autoThreshold: document.getElementById("auto-threshold"),
        autoRole: document.getElementById("auto-role"),
    };

    if (!refs.enabled) return;
    applyResourceSelectors(context);
    refs.enabled.checked = m.enabled;
    refs.flood.checked = m.smart_antiflood;
    refs.limit.value = m.warning_limit;
    refs.action.value = m.default_action;
    refs.modmail.checked = m.modmail_enabled;
    refs.tickets.checked = m.tickets_enabled;

    if (refs.autoInvite) refs.autoInvite.checked = Boolean(automation.invite_filter);
    if (refs.autoLink) refs.autoLink.checked = Boolean(automation.link_filter);
    if (refs.autoCaps) refs.autoCaps.checked = Boolean(automation.caps_filter);
    if (refs.autoThreshold) refs.autoThreshold.value = Number(automation.spam_threshold || 6);
    if (refs.autoRole) {
        ensureOption(refs.autoRole, automation.quarantine_role, automation.quarantine_role);
        refs.autoRole.value = automation.quarantine_role || "";
    }

    selectedAutoImmuneRoles = Array.isArray(automation.immune_roles)
        ? [...new Set(automation.immune_roles.filter(Boolean).map(String))]
        : [];
    renderAutoImmuneRoleChips();
}

function renderGuildSettings(context) {
    const g = context.state.guild;
    const moderation = context.state.moderation;
    const automation = context.state.automation;
    const warnings = context.state.warnings;
    const logs = context.state.logs;
    const modmail = context.state.modmail;
    const entryExit = context.state.entry_exit || {};
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
        welcomeEnabled: document.getElementById("welcome-enabled"),
        welcomeChannel: document.getElementById("welcome-channel"),
        welcomeTitle: document.getElementById("welcome-title"),
        welcomeDescription: document.getElementById("welcome-description"),
        welcomeColor: document.getElementById("welcome-color"),
        leaveEnabled: document.getElementById("leave-enabled"),
        leaveChannel: document.getElementById("leave-channel"),
        leaveTitle: document.getElementById("leave-title"),
        leaveDescription: document.getElementById("leave-description"),
        leaveColor: document.getElementById("leave-color"),
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
    selectedAutoImmuneRoles = Array.isArray(automation.immune_roles)
        ? [...new Set(automation.immune_roles.filter(Boolean).map(String))]
        : [];
    renderAutoImmuneRoleChips();

    refs.warnEnabled.checked = true;
    refs.warnEnabled.disabled = true;
    refs.warnPublicReason.checked = warnings.public_reason_prompt;
    refs.warnDmUser.checked = warnings.dm_user;

    const steps = Array.isArray(warnings.escalation_steps) && warnings.escalation_steps.length
        ? warnings.escalation_steps
        : [{ threshold: 3, action: "timeout" }, { threshold: 6, action: "kick" }, { threshold: 9, action: "ban" }];
    const safe = [steps[0], steps[1] || steps[0], steps[2] || steps[1] || steps[0]];
    renderWarnFlowEditor(steps);
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

    if (refs.welcomeEnabled) refs.welcomeEnabled.checked = Boolean(entryExit.welcome_enabled);
    if (refs.welcomeChannel) {
        ensureOption(refs.welcomeChannel, entryExit.welcome_channel, entryExit.welcome_channel);
        refs.welcomeChannel.value = entryExit.welcome_channel || "";
    }
    if (refs.welcomeTitle) refs.welcomeTitle.value = entryExit.welcome_title || "Bem-vindo(a), {member}!";
    if (refs.welcomeDescription) refs.welcomeDescription.value = entryExit.welcome_description || "Aproveite sua estadia em **{guild}**.";
    if (refs.welcomeColor) refs.welcomeColor.value = entryExit.welcome_color || "#57cc99";

    if (refs.leaveEnabled) refs.leaveEnabled.checked = Boolean(entryExit.leave_enabled);
    if (refs.leaveChannel) {
        ensureOption(refs.leaveChannel, entryExit.leave_channel, entryExit.leave_channel);
        refs.leaveChannel.value = entryExit.leave_channel || "";
    }
    if (refs.leaveTitle) refs.leaveTitle.value = entryExit.leave_title || "Ate logo, {member}.";
    if (refs.leaveDescription) refs.leaveDescription.value = entryExit.leave_description || "{member} saiu de **{guild}**.";
    if (refs.leaveColor) refs.leaveColor.value = entryExit.leave_color || "#ef476f";

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
        const action = item.action || "config_update";
        const target = item.user_id ? `Target: ${item.user_id}` : "";
        const channel = item.channel_id ? `Channel: ${item.channel_id}` : "";
        row.innerHTML = `
            <h3>[${action}] ${item.reason || "Configuration update"}</h3>
            <p>By: ${item.moderator_id || "unknown"}</p>
            <p>${target} ${channel}</p>
            <p>${when}</p>
        `;
        feed.appendChild(row);
    });
}

function renderLiveActivity(logs) {
    const feed = document.getElementById("live-activity-feed");
    if (!feed) return;
    feed.innerHTML = "";

    const items = Array.isArray(logs) ? logs.slice(0, 20) : [];
    if (!items.length) {
        const empty = document.createElement("article");
        empty.className = "log-item";
        empty.innerHTML = "<h3>No recent activity</h3><p>New moderation and setup events will appear here in real time.</p>";
        feed.appendChild(empty);
        return;
    }

    items.forEach((item) => {
        const row = document.createElement("article");
        row.className = "log-item";
        const when = item.created_at ? new Date(item.created_at).toLocaleTimeString() : "-";
        row.innerHTML = `
            <h3>${item.action || "event"}</h3>
            <p>${item.reason || "No details"}</p>
            <p>${when}</p>
        `;
        feed.appendChild(row);
    });
}

function renderHealthMetrics(health) {
    const refs = {
        warns: document.getElementById("health-warns"),
        banRate: document.getElementById("health-ban-rate"),
        spamBlocks: document.getElementById("health-spam-blocks"),
        openTickets: document.getElementById("health-open-tickets"),
    };
    if (!refs.warns) return;
    refs.warns.textContent = String(health.warns ?? 0);
    refs.banRate.textContent = `${Number(health.ban_rate ?? 0).toFixed(2)}%`;
    refs.spamBlocks.textContent = String(health.spam_blocks ?? 0);
    refs.openTickets.textContent = String(health.open_tickets ?? 0);
}

async function loadHealthMetrics() {
    const period = document.getElementById("health-period")?.value || "24h";
    const response = await api(`/api/dashboard/health?period=${encodeURIComponent(period)}`);
    renderHealthMetrics(response.health || {});
}

async function loadLiveActivity() {
    const response = await api("/api/dashboard/activity/recent?limit=40");
    renderLiveActivity(response.logs || []);
}

function startActivityStream() {
    if (liveActivityEventSource) {
        liveActivityEventSource.close();
        liveActivityEventSource = null;
    }
    if (page !== "overview") return;

    const stream = new EventSource("/api/dashboard/activity/stream");
    liveActivityEventSource = stream;
    stream.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data || "{}");
            if (Array.isArray(data.logs)) {
                renderLiveActivity(data.logs);
            }
        } catch (error) {
            // Ignore malformed stream chunks.
        }
    };
    stream.onerror = () => {
        // Stream may close on network transitions; keep existing feed snapshot.
    };
}

function currentAuditFilterQuery() {
    const period = document.getElementById("audit-period")?.value || "24h";
    const action = document.getElementById("audit-action")?.value?.trim() || "";
    const moderator = document.getElementById("audit-moderator")?.value?.trim() || "";
    const user = document.getElementById("audit-user")?.value?.trim() || "";
    const channel = document.getElementById("audit-channel")?.value?.trim() || "";
    const params = new URLSearchParams({ period });
    if (action) params.set("action", action);
    if (moderator) params.set("moderator_id", moderator);
    if (user) params.set("user_id", user);
    if (channel) params.set("channel_id", channel);
    return params.toString();
}

async function runAutoModSimulation() {
    const message = document.getElementById("automod-simulator-message")?.value?.trim() || "";
    const result = document.getElementById("automod-simulator-result");
    if (!result) return;
    if (!message) {
        flash("Write a message to simulate");
        return;
    }

    try {
        const response = await api("/api/dashboard/automod/simulate", {
            method: "POST",
            body: JSON.stringify({ message }),
        });
        const simulation = response.simulation || {};
        const rules = Array.isArray(simulation.rules) ? simulation.rules : [];
        result.innerHTML = "";

        const item = document.createElement("article");
        item.className = "log-item";
        item.innerHTML = `
            <h3>${simulation.triggered ? "Rule Triggered" : "No Rule Triggered"}</h3>
            <p>Suggested action: ${simulation.suggested_action || "timeout"}</p>
            <p>Message length: ${simulation.message_length || 0}</p>
        `;
        result.appendChild(item);

        if (rules.length) {
            rules.forEach((rule) => {
                const row = document.createElement("article");
                row.className = "log-item";
                row.innerHTML = `<h3>${rule.rule}</h3><p>${rule.reason}</p>`;
                result.appendChild(row);
            });
        }
    } catch (error) {
        flash("Failed to run AutoMod simulation");
    }
}

function applyPreviewTokens(template, guildName) {
    return String(template || "")
        .replace(/\{member\}/g, "@ExampleMember")
        .replace(/\{guild\}/g, guildName || "Your Guild");
}

function renderEntryExitPreview(kind) {
    const isWelcome = kind === "welcome";
    const titleInput = document.getElementById(isWelcome ? "welcome-title" : "leave-title");
    const descInput = document.getElementById(isWelcome ? "welcome-description" : "leave-description");
    const colorInput = document.getElementById(isWelcome ? "welcome-color" : "leave-color");
    const card = document.getElementById(isWelcome ? "welcome-preview-card" : "leave-preview-card");
    const titleEl = document.getElementById(isWelcome ? "welcome-preview-title" : "leave-preview-title");
    const descEl = document.getElementById(isWelcome ? "welcome-preview-description" : "leave-preview-description");

    if (!titleInput || !descInput || !colorInput || !card || !titleEl || !descEl) return;

    const guildName = dashboardContext?.state?.guild?.guild_name || "Your Guild";
    const title = applyPreviewTokens(titleInput.value.trim(), guildName);
    const description = applyPreviewTokens(descInput.value.trim(), guildName);
    const rawColor = colorInput.value.trim() || (isWelcome ? "#57cc99" : "#ef476f");
    const safeColor = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(rawColor) ? rawColor : (isWelcome ? "#57cc99" : "#ef476f");

    titleEl.textContent = title || (isWelcome ? "Bem-vindo(a), @ExampleMember!" : "Ate logo, @ExampleMember.");
    descEl.textContent = description || (isWelcome ? "Aproveite sua estadia em **Your Guild**." : "@ExampleMember saiu de **Your Guild**.");
    card.style.borderLeft = `5px solid ${safeColor}`;
    card.hidden = false;
}

function bindEntryExitPreviewButtons() {
    const welcomeBtn = document.getElementById("preview-welcome-embed");
    if (welcomeBtn) {
        welcomeBtn.addEventListener("click", () => renderEntryExitPreview("welcome"));
    }

    const leaveBtn = document.getElementById("preview-leave-embed");
    if (leaveBtn) {
        leaveBtn.addEventListener("click", () => renderEntryExitPreview("leave"));
    }
}

async function loadConfigLogs() {
    const query = currentAuditFilterQuery();
    const response = await api(`/api/dashboard/audit?${query}`);
    renderConfigLogs(response.logs || []);
    try {
        const badge = await api("/api/dashboard/config-logs");
        updateConfigLogBadge(badge.unread || 0);
    } catch (error) {
        // Keep audit data even if unread badge update fails.
    }
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
    if (page === "overview") {
        await loadHealthMetrics();
        await loadLiveActivity();
        startActivityStream();
    }
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
                invite_filter: document.getElementById("auto-invite")?.checked ?? true,
                link_filter: document.getElementById("auto-link")?.checked ?? true,
                caps_filter: document.getElementById("auto-caps")?.checked ?? false,
                spam_threshold: Number(document.getElementById("auto-threshold")?.value || 6),
                quarantine_role: document.getElementById("auto-role")?.value?.trim() || "",
                immune_roles: [...selectedAutoImmuneRoles],
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

    const runSimulation = document.getElementById("run-automod-simulator");
    if (runSimulation) {
        runSimulation.addEventListener("click", runAutoModSimulation);
    }

    const refreshHealth = document.getElementById("refresh-health");
    if (refreshHealth) {
        refreshHealth.addEventListener("click", async () => {
            try {
                await loadHealthMetrics();
                flash("Health metrics refreshed");
            } catch (error) {
                flash("Failed to refresh health metrics");
            }
        });
    }

    const applyAuditFilters = document.getElementById("apply-audit-filters");
    if (applyAuditFilters) {
        applyAuditFilters.addEventListener("click", async () => {
            try {
                await loadConfigLogs();
                flash("Audit filters applied");
            } catch (error) {
                flash("Failed to load audit logs");
            }
        });
    }

    const exportAuditCsv = document.getElementById("export-audit-csv");
    if (exportAuditCsv) {
        exportAuditCsv.addEventListener("click", () => {
            const query = currentAuditFilterQuery();
            window.location.href = `/api/dashboard/audit/export?format=csv&${query}`;
        });
    }

    const exportAuditJson = document.getElementById("export-audit-json");
    if (exportAuditJson) {
        exportAuditJson.addEventListener("click", () => {
            const query = currentAuditFilterQuery();
            window.location.href = `/api/dashboard/audit/export?format=json&${query}`;
        });
    }

    const addWarnFlowStep = document.getElementById("warn-flow-add-step");
    if (addWarnFlowStep) {
        addWarnFlowStep.addEventListener("click", () => {
            const current = getWarnEscalationStepsFromForm();
            const nextThreshold = Math.max(...current.map((step) => Number(step.threshold || 1)), 1) + 1;
            current.push({ threshold: nextThreshold, action: "timeout" });
            renderWarnFlowEditor(current);
            updateSetupDirtyState(true);
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
                    immune_roles: [...selectedAutoImmuneRoles],
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
                entry_exit: {
                    welcome_enabled: document.getElementById("welcome-enabled").checked,
                    welcome_channel: document.getElementById("welcome-channel").value.trim(),
                    welcome_title: document.getElementById("welcome-title").value.trim(),
                    welcome_description: document.getElementById("welcome-description").value.trim(),
                    welcome_color: document.getElementById("welcome-color").value.trim() || "#57cc99",
                    leave_enabled: document.getElementById("leave-enabled").checked,
                    leave_channel: document.getElementById("leave-channel").value.trim(),
                    leave_title: document.getElementById("leave-title").value.trim(),
                    leave_description: document.getElementById("leave-description").value.trim(),
                    leave_color: document.getElementById("leave-color").value.trim() || "#ef476f",
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

    const addImmuneRole = document.getElementById("auto-immune-role-add");
    if (addImmuneRole) {
        addImmuneRole.addEventListener("click", () => {
            const picker = document.getElementById("auto-immune-role-picker");
            if (!picker || !picker.value) return;
            if (!selectedAutoImmuneRoles.includes(picker.value)) {
                selectedAutoImmuneRoles.push(picker.value);
                renderAutoImmuneRoleChips();
                updateSetupDirtyState(true);
            }
        });
    }

    const removeImmuneRole = document.getElementById("auto-immune-role-remove");
    if (removeImmuneRole) {
        removeImmuneRole.addEventListener("click", () => {
            const selectedChips = Array.from(document.querySelectorAll("#auto-immune-role-list .role-chip.selected"));
            if (!selectedChips.length) return;
            const removeSet = new Set(selectedChips.map((item) => item.dataset.roleId));
            selectedAutoImmuneRoles = selectedAutoImmuneRoles.filter((roleId) => !removeSet.has(roleId));
            renderAutoImmuneRoleChips();
            updateSetupDirtyState(true);
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
        bindEntryExitPreviewButtons();
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
