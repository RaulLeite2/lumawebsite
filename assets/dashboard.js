let dashboardContext = null;

const page = document.body.dataset.page || "overview";

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
    const refs = {
        name: document.getElementById("guild-name"),
        language: document.getElementById("guild-language"),
        log: document.getElementById("guild-log"),
    };

    if (!refs.name) return;
    refs.name.value = g.guild_name;
    refs.language.value = g.language;
    refs.log.value = g.log_channel;
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

function renderPage(context) {
    renderCommon(context);
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
        await loadSession();
        await loadState();
    } catch (error) {
        flash("Failed to load dashboard");
    }
})();
