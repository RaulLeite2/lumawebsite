let dashboardContext = null;
let setupDirty = false;
let setupDirtyTrackingBound = false;
let setupResources = { text_channels: [], categories: [], roles: [] };
let selectedModmailRoles = [];
let selectedAutoImmuneRoles = [];
let liveActivityEventSource = null;
let warnFlowSteps = [];
let dashboardLang = "en";

const I18N = {
    en: {
        nav_servers: "Servers",
        nav_overview: "Overview",
        nav_moderation: "Moderation",
        nav_setup: "Bot Setup",
        nav_cogs: "Cogs",
        nav_audit: "Audit Center",
        logout: "Logout",
        signed_in_as: "Signed in as",
        no_servers_available: "No servers available",
        unknown: "Unknown",
        enabled: "Enabled",
        disabled: "Disabled",
        owner: "Owner",
        administrator: "Administrator",
        member: "Member",
        configure: "Configure",
        no_access: "No Access",
        no_servers_found: "No servers found",
        refresh_permissions_hint: "Try logging out and in again to refresh Discord guild permissions.",
        setup_unsaved_hint: "You have unsaved changes in this setup.",
        setup_saved_hint: "Everything saved for this guild.",
        save_bot_setup: "Save Bot Setup",
        saved: "Saved",
        no_staging_found: "No staging configuration found",
        alerts_refresh_success: "Smart alerts refreshed",
        alerts_refresh_error: "Failed to refresh alerts",
        loading_guild_status: "Loading guild status...",
    },
    pt: {
        nav_servers: "Servidores",
        nav_overview: "Visao Geral",
        nav_moderation: "Moderacao",
        nav_setup: "Configuracao do Bot",
        nav_cogs: "Cogs",
        nav_audit: "Central de Auditoria",
        logout: "Sair",
        signed_in_as: "Conectado como",
        no_servers_available: "Nenhum servidor disponivel",
        unknown: "Desconhecido",
        enabled: "Ativado",
        disabled: "Desativado",
        owner: "Dono",
        administrator: "Administrador",
        member: "Membro",
        configure: "Configurar",
        no_access: "Sem Acesso",
        no_servers_found: "Nenhum servidor encontrado",
        refresh_permissions_hint: "Tente sair e entrar novamente para atualizar as permissoes de guild do Discord.",
        setup_unsaved_hint: "Voce tem alteracoes nao salvas neste setup.",
        setup_saved_hint: "Tudo salvo para esta guild.",
        save_bot_setup: "Salvar Setup do Bot",
        saved: "Salvo",
        no_staging_found: "Nenhuma configuracao de staging encontrada",
        alerts_refresh_success: "Alertas inteligentes atualizados",
        alerts_refresh_error: "Falha ao atualizar alertas",
        loading_guild_status: "Carregando status da guild...",
    },
    es: {
        nav_servers: "Servidores",
        nav_overview: "Resumen",
        nav_moderation: "Moderacion",
        nav_setup: "Configuracion del Bot",
        nav_cogs: "Cogs",
        nav_audit: "Centro de Auditoria",
        logout: "Salir",
        signed_in_as: "Conectado como",
        no_servers_available: "No hay servidores disponibles",
        unknown: "Desconocido",
        enabled: "Activado",
        disabled: "Desactivado",
        owner: "Propietario",
        administrator: "Administrador",
        member: "Miembro",
        configure: "Configurar",
        no_access: "Sin Acceso",
        no_servers_found: "No se encontraron servidores",
        refresh_permissions_hint: "Intenta cerrar sesion y entrar de nuevo para actualizar los permisos del servidor en Discord.",
        setup_unsaved_hint: "Tienes cambios sin guardar en esta configuracion.",
        setup_saved_hint: "Todo guardado para este servidor.",
        save_bot_setup: "Guardar Configuracion del Bot",
        saved: "Guardado",
        no_staging_found: "No se encontro configuracion de staging",
        alerts_refresh_success: "Alertas inteligentes actualizadas",
        alerts_refresh_error: "Error al actualizar alertas",
        loading_guild_status: "Cargando estado del servidor...",
    },
};

const STATIC_TRANSLATIONS = {
    "Choose a Server": { pt: "Escolha um Servidor", en: "Choose a Server", es: "Elige un Servidor" },
    "Your Servers": { pt: "Seus Servidores", en: "Your Servers", es: "Tus Servidores" },
    "Guild Home": { pt: "Painel da Guild", en: "Guild Home", es: "Inicio del Servidor" },
    "Focus Mode": { pt: "Modo Foco", en: "Focus Mode", es: "Modo Enfoque" },
    "Server Health": { pt: "Saude do Servidor", en: "Server Health", es: "Salud del Servidor" },
    "Live Activity Feed": { pt: "Feed de Atividade ao Vivo", en: "Live Activity Feed", es: "Feed de Actividad en Vivo" },
    "Risk Heatmap": { pt: "Mapa de Calor de Risco", en: "Risk Heatmap", es: "Mapa de Calor de Riesgo" },
    "Refresh Heatmap": { pt: "Atualizar Mapa", en: "Refresh Heatmap", es: "Actualizar Mapa" },
    "Smart Alerts": { pt: "Alertas Inteligentes", en: "Smart Alerts", es: "Alertas Inteligentes" },
    "Refresh Alerts": { pt: "Atualizar Alertas", en: "Refresh Alerts", es: "Actualizar Alertas" },
    "Moderation Configuration": { pt: "Configuracao de Moderacao", en: "Moderation Configuration", es: "Configuracion de Moderacion" },
    "Save Moderation": { pt: "Salvar Moderacao", en: "Save Moderation", es: "Guardar Moderacion" },
    "AutoMod Simulator": { pt: "Simulador de AutoMod", en: "AutoMod Simulator", es: "Simulador de AutoMod" },
    "Run Simulation": { pt: "Executar Simulacao", en: "Run Simulation", es: "Ejecutar Simulacion" },
    "Cog Manager": { pt: "Gerenciador de Cogs", en: "Cog Manager", es: "Gestor de Cogs" },
    "Save Cogs": { pt: "Salvar Cogs", en: "Save Cogs", es: "Guardar Cogs" },
    "Audit Center": { pt: "Central de Auditoria", en: "Audit Center", es: "Centro de Auditoria" },
    "Mark As Read": { pt: "Marcar como Lido", en: "Mark As Read", es: "Marcar como Leido" },
    "Apply Filters": { pt: "Aplicar Filtros", en: "Apply Filters", es: "Aplicar Filtros" },
    "Export CSV": { pt: "Exportar CSV", en: "Export CSV", es: "Exportar CSV" },
    "Export JSON": { pt: "Exportar JSON", en: "Export JSON", es: "Exportar JSON" },
    "Save Role": { pt: "Salvar Perfil", en: "Save Role", es: "Guardar Rol" },
    "Refresh": { pt: "Atualizar", en: "Refresh", es: "Actualizar" },
    "Logout": { pt: "Sair", en: "Logout", es: "Salir" },
    "Last 24h": { pt: "Ultimas 24h", en: "Last 24h", es: "Ultimas 24h" },
    "Last 7d": { pt: "Ultimos 7d", en: "Last 7d", es: "Ultimos 7d" },
    "Last 30d": { pt: "Ultimos 30d", en: "Last 30d", es: "Ultimos 30d" },
};

function translateStaticText(text) {
    if (!text) return text;
    const value = STATIC_TRANSLATIONS[text.trim()];
    return value?.[dashboardLang] || text;
}

const FLASH_TRANSLATION_KEYS = {
    "Guild switched": "guild_switched",
    "Failed to switch guild": "guild_switch_error",
    "Failed to select guild": "guild_select_error",
    "Moderation updated": "moderation_updated",
    "Failed to update moderation": "moderation_update_error",
    "Write a message to simulate": "simulator_missing_message",
    "Failed to run AutoMod simulation": "simulator_error",
    "Health metrics refreshed": "health_refresh_success",
    "Failed to refresh health metrics": "health_refresh_error",
    "Risk heatmap refreshed": "heatmap_refresh_success",
    "Failed to refresh risk heatmap": "heatmap_refresh_error",
    "Audit filters applied": "audit_filter_success",
    "Failed to load audit logs": "audit_filter_error",
    "Guild settings updated": "guild_settings_updated",
    "Failed to update guild settings": "guild_settings_error",
    "Bot setup updated": "setup_updated",
    "Failed to update bot setup": "setup_error",
    "Saved to staging": "staging_saved",
    "Failed to save staging config": "staging_save_error",
    "Staging loaded into form": "staging_loaded",
    "Failed to load staging config": "staging_load_error",
    "Staging applied to production": "staging_applied",
    "Failed to apply staging": "staging_apply_error",
    "Staging discarded": "staging_discarded",
    "Failed to discard staging": "staging_discard_error",
    "Preset applied to staging": "preset_staging_ok",
    "Failed to apply preset to staging": "preset_staging_error",
    "Preset applied to production": "preset_prod_ok",
    "Failed to apply preset to production": "preset_prod_error",
    "Config logs marked as read": "logs_marked_read",
    "Failed to update log notification state": "logs_marked_error",
    "Provide a user ID": "role_missing_user",
    "Dashboard role saved": "role_saved",
    "Failed to save dashboard role": "role_save_error",
    "Roles refreshed": "roles_refreshed",
    "Failed to load roles": "roles_error",
    "Snapshots refreshed": "snapshots_refreshed",
    "Failed to refresh snapshots": "snapshots_refresh_error",
    "Snapshot rollback applied": "snapshot_rollback_ok",
    "Failed to rollback snapshot": "snapshot_rollback_error",
    "Cogs updated": "cogs_updated",
    "Failed to update cogs": "cogs_update_error",
    "Guild dashboard reset": "dashboard_reset_ok",
    "Failed to reset guild dashboard": "dashboard_reset_error",
    "Focus mode enabled": "focus_on",
    "Focus mode disabled": "focus_off",
    "Smart alerts refreshed": "alerts_refresh_success",
    "Failed to refresh alerts": "alerts_refresh_error",
    "Failed to load dashboard": "dashboard_load_error",
};

const FLASH_TRANSLATIONS = {
    en: {
        guild_switched: "Guild switched",
        guild_switch_error: "Failed to switch guild",
        guild_select_error: "Failed to select guild",
        moderation_updated: "Moderation updated",
        moderation_update_error: "Failed to update moderation",
        simulator_missing_message: "Write a message to simulate",
        simulator_error: "Failed to run AutoMod simulation",
        health_refresh_success: "Health metrics refreshed",
        health_refresh_error: "Failed to refresh health metrics",
        heatmap_refresh_success: "Risk heatmap refreshed",
        heatmap_refresh_error: "Failed to refresh risk heatmap",
        audit_filter_success: "Audit filters applied",
        audit_filter_error: "Failed to load audit logs",
        guild_settings_updated: "Guild settings updated",
        guild_settings_error: "Failed to update guild settings",
        setup_updated: "Bot setup updated",
        setup_error: "Failed to update bot setup",
        staging_saved: "Saved to staging",
        staging_save_error: "Failed to save staging config",
        staging_loaded: "Staging loaded into form",
        staging_load_error: "Failed to load staging config",
        staging_applied: "Staging applied to production",
        staging_apply_error: "Failed to apply staging",
        staging_discarded: "Staging discarded",
        staging_discard_error: "Failed to discard staging",
        preset_staging_ok: "Preset applied to staging",
        preset_staging_error: "Failed to apply preset to staging",
        preset_prod_ok: "Preset applied to production",
        preset_prod_error: "Failed to apply preset to production",
        logs_marked_read: "Config logs marked as read",
        logs_marked_error: "Failed to update log notification state",
        role_missing_user: "Provide a user ID",
        role_saved: "Dashboard role saved",
        role_save_error: "Failed to save dashboard role",
        roles_refreshed: "Roles refreshed",
        roles_error: "Failed to load roles",
        snapshots_refreshed: "Snapshots refreshed",
        snapshots_refresh_error: "Failed to refresh snapshots",
        snapshot_rollback_ok: "Snapshot rollback applied",
        snapshot_rollback_error: "Failed to rollback snapshot",
        cogs_updated: "Cogs updated",
        cogs_update_error: "Failed to update cogs",
        dashboard_reset_ok: "Guild dashboard reset",
        dashboard_reset_error: "Failed to reset guild dashboard",
        focus_on: "Focus mode enabled",
        focus_off: "Focus mode disabled",
        alerts_refresh_success: "Smart alerts refreshed",
        alerts_refresh_error: "Failed to refresh alerts",
        dashboard_load_error: "Failed to load dashboard",
    },
    pt: {
        guild_switched: "Guild alterada",
        guild_switch_error: "Falha ao trocar de guild",
        guild_select_error: "Falha ao selecionar a guild",
        moderation_updated: "Moderacao atualizada",
        moderation_update_error: "Falha ao atualizar moderacao",
        simulator_missing_message: "Escreva uma mensagem para simular",
        simulator_error: "Falha ao executar simulacao do AutoMod",
        health_refresh_success: "Saude do servidor atualizada",
        health_refresh_error: "Falha ao atualizar saude do servidor",
        heatmap_refresh_success: "Mapa de risco atualizado",
        heatmap_refresh_error: "Falha ao atualizar mapa de risco",
        audit_filter_success: "Filtros de auditoria aplicados",
        audit_filter_error: "Falha ao carregar logs de auditoria",
        guild_settings_updated: "Configuracoes da guild atualizadas",
        guild_settings_error: "Falha ao atualizar configuracoes da guild",
        setup_updated: "Setup do bot atualizado",
        setup_error: "Falha ao atualizar setup do bot",
        staging_saved: "Salvo no staging",
        staging_save_error: "Falha ao salvar configuracao no staging",
        staging_loaded: "Staging carregado no formulario",
        staging_load_error: "Falha ao carregar staging",
        staging_applied: "Staging aplicado em producao",
        staging_apply_error: "Falha ao aplicar staging",
        staging_discarded: "Staging descartado",
        staging_discard_error: "Falha ao descartar staging",
        preset_staging_ok: "Preset aplicado no staging",
        preset_staging_error: "Falha ao aplicar preset no staging",
        preset_prod_ok: "Preset aplicado em producao",
        preset_prod_error: "Falha ao aplicar preset em producao",
        logs_marked_read: "Logs marcados como lidos",
        logs_marked_error: "Falha ao atualizar notificacao dos logs",
        role_missing_user: "Informe um ID de usuario",
        role_saved: "Permissao do dashboard salva",
        role_save_error: "Falha ao salvar permissao do dashboard",
        roles_refreshed: "Permissoes atualizadas",
        roles_error: "Falha ao carregar permissoes",
        snapshots_refreshed: "Snapshots atualizados",
        snapshots_refresh_error: "Falha ao atualizar snapshots",
        snapshot_rollback_ok: "Rollback do snapshot aplicado",
        snapshot_rollback_error: "Falha ao aplicar rollback do snapshot",
        cogs_updated: "Cogs atualizados",
        cogs_update_error: "Falha ao atualizar cogs",
        dashboard_reset_ok: "Dashboard da guild resetado",
        dashboard_reset_error: "Falha ao resetar dashboard da guild",
        focus_on: "Modo foco ativado",
        focus_off: "Modo foco desativado",
        alerts_refresh_success: "Alertas inteligentes atualizados",
        alerts_refresh_error: "Falha ao atualizar alertas",
        dashboard_load_error: "Falha ao carregar dashboard",
    },
    es: {
        guild_switched: "Servidor cambiado",
        guild_switch_error: "Error al cambiar de servidor",
        guild_select_error: "Error al seleccionar el servidor",
        moderation_updated: "Moderacion actualizada",
        moderation_update_error: "Error al actualizar moderacion",
        simulator_missing_message: "Escribe un mensaje para simular",
        simulator_error: "Error al ejecutar la simulacion de AutoMod",
        health_refresh_success: "Salud del servidor actualizada",
        health_refresh_error: "Error al actualizar la salud del servidor",
        heatmap_refresh_success: "Mapa de riesgo actualizado",
        heatmap_refresh_error: "Error al actualizar mapa de riesgo",
        audit_filter_success: "Filtros de auditoria aplicados",
        audit_filter_error: "Error al cargar logs de auditoria",
        guild_settings_updated: "Configuracion del servidor actualizada",
        guild_settings_error: "Error al actualizar configuracion del servidor",
        setup_updated: "Configuracion del bot actualizada",
        setup_error: "Error al actualizar configuracion del bot",
        staging_saved: "Guardado en staging",
        staging_save_error: "Error al guardar configuracion en staging",
        staging_loaded: "Staging cargado en el formulario",
        staging_load_error: "Error al cargar staging",
        staging_applied: "Staging aplicado a produccion",
        staging_apply_error: "Error al aplicar staging",
        staging_discarded: "Staging descartado",
        staging_discard_error: "Error al descartar staging",
        preset_staging_ok: "Preset aplicado en staging",
        preset_staging_error: "Error al aplicar preset en staging",
        preset_prod_ok: "Preset aplicado en produccion",
        preset_prod_error: "Error al aplicar preset en produccion",
        logs_marked_read: "Logs marcados como leidos",
        logs_marked_error: "Error al actualizar notificacion de logs",
        role_missing_user: "Ingresa un ID de usuario",
        role_saved: "Permiso del dashboard guardado",
        role_save_error: "Error al guardar permiso del dashboard",
        roles_refreshed: "Permisos actualizados",
        roles_error: "Error al cargar permisos",
        snapshots_refreshed: "Snapshots actualizados",
        snapshots_refresh_error: "Error al actualizar snapshots",
        snapshot_rollback_ok: "Rollback del snapshot aplicado",
        snapshot_rollback_error: "Error al aplicar rollback del snapshot",
        cogs_updated: "Cogs actualizados",
        cogs_update_error: "Error al actualizar cogs",
        dashboard_reset_ok: "Dashboard del servidor reiniciado",
        dashboard_reset_error: "Error al reiniciar dashboard del servidor",
        focus_on: "Modo enfoque activado",
        focus_off: "Modo enfoque desactivado",
        alerts_refresh_success: "Alertas inteligentes actualizadas",
        alerts_refresh_error: "Error al actualizar alertas",
        dashboard_load_error: "Error al cargar dashboard",
    },
};

function t(key, fallback = "") {
    return I18N[dashboardLang]?.[key] || I18N.en[key] || fallback || key;
}

function tf(message) {
    const key = FLASH_TRANSLATION_KEYS[message];
    if (!key) return message;
    return FLASH_TRANSLATIONS[dashboardLang]?.[key] || FLASH_TRANSLATIONS.en[key] || message;
}

function setLang(nextLang) {
    const safe = ["pt", "en", "es"].includes(nextLang) ? nextLang : "en";
    dashboardLang = safe;
    try {
        localStorage.setItem("dashboardLang", safe);
    } catch (error) {
        // Ignore storage issues.
    }
    document.documentElement.lang = safe;
}

function inferLangFromState() {
    const fromState = dashboardContext?.state?.guild?.language;
    if (["pt", "en", "es"].includes(fromState)) return fromState;
    try {
        const cached = localStorage.getItem("dashboardLang");
        if (["pt", "en", "es"].includes(cached)) return cached;
    } catch (error) {
        // Ignore storage issues.
    }
    const nav = (navigator.language || "en").toLowerCase();
    if (nav.startsWith("pt")) return "pt";
    if (nav.startsWith("es")) return "es";
    return "en";
}

function ensureLanguageSelector() {
    const actions = document.querySelector(".topbar .actions");
    if (!actions) return;

    let select = document.getElementById("ui-lang-select");
    if (!select) {
        select = document.createElement("select");
        select.id = "ui-lang-select";
        select.innerHTML = `
            <option value="pt">PT</option>
            <option value="en">EN</option>
            <option value="es">ES</option>
        `;
        const logoutLink = actions.querySelector('a[href="/auth/logout"]');
        if (logoutLink) actions.insertBefore(select, logoutLink);
        else actions.appendChild(select);

        select.addEventListener("change", () => {
            setLang(select.value);
            if (dashboardContext) {
                renderPage(dashboardContext);
                if (page === "config-logs") {
                    renderDashboardRoles({
                        current_role: dashboardContext.current_dashboard_role,
                        entries: dashboardContext.dashboard_roles,
                    });
                }
            }
            applyStaticTranslations();
        });
    }
    select.value = dashboardLang;
}

function applyStaticTranslations() {
    const navLinks = document.querySelectorAll(".sidebar .nav a");
    if (navLinks.length >= 6) {
        navLinks[0].childNodes[0].nodeValue = t("nav_servers", "Servers");
        navLinks[1].childNodes[0].nodeValue = t("nav_overview", "Overview");
        navLinks[2].childNodes[0].nodeValue = t("nav_moderation", "Moderation");
        navLinks[3].childNodes[0].nodeValue = t("nav_setup", "Bot Setup");
        navLinks[4].childNodes[0].nodeValue = t("nav_cogs", "Cogs");
        navLinks[5].childNodes[0].nodeValue = t("nav_audit", "Audit Center");
    }

    const logoutLinks = document.querySelectorAll('a[href="/auth/logout"]');
    logoutLinks.forEach((node) => {
        node.textContent = t("logout", "Logout");
    });

    const statusDay = document.getElementById("status-of-day");
    if (statusDay && /Loading guild status/i.test(statusDay.textContent || "")) {
        statusDay.textContent = t("loading_guild_status", "Loading guild status...");
    }

    const textNodes = document.querySelectorAll("h1, h2, h3, h4, p, span, button, label, small, option");
    textNodes.forEach((node) => {
        if (node.closest(".sidebar .nav") || node.id === "status-of-day") return;
        const source = node.dataset.i18nSource || node.textContent.trim();
        if (!source) return;
        if (!node.dataset.i18nSource) node.dataset.i18nSource = source;
        const translated = translateStaticText(source);
        if (translated !== source) node.textContent = translated;
    });

    const placeholders = document.querySelectorAll("input[placeholder], textarea[placeholder]");
    placeholders.forEach((node) => {
        const source = node.dataset.i18nPlaceholder || node.getAttribute("placeholder") || "";
        if (!source) return;
        if (!node.dataset.i18nPlaceholder) node.dataset.i18nPlaceholder = source;
        const translated = translateStaticText(source);
        if (translated !== source) node.setAttribute("placeholder", translated);
    });
}

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

function flash(message, type = "info") {
    const el = document.getElementById("flash");
    if (!el) return;
    el.classList.remove("success", "error");
    if (type === "success") el.classList.add("success");
    if (type === "error") el.classList.add("error");
    el.textContent = tf(message);
    el.classList.add("show");
    setTimeout(() => {
        el.classList.remove("show", "success", "error");
    }, 1900);
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
        hint.textContent = message || (isDirty ? t("setup_unsaved_hint", "You have unsaved changes in this setup.") : t("setup_saved_hint", "Everything saved for this guild."));
        hint.classList.toggle("is-dirty", isDirty);
        hint.classList.toggle("is-clean", !isDirty);
    }
    if (saveButton) {
        saveButton.textContent = isDirty ? t("save_bot_setup", "Save Bot Setup") : t("saved", "Saved");
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
        refreshSetupChangePreview();
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
    userBox.textContent = `${t("signed_in_as", "Signed in as")} ${label}`;
}

function setGuildSwitcher(guilds, activeGuildId) {
    const select = document.getElementById("guild-select");
    if (!select) return;

    select.innerHTML = "";
    if (!guilds.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = t("no_servers_available", "No servers available");
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
                    <div class="server-name">${t("no_servers_found", "No servers found")}</div>
                    <div class="server-role">${t("refresh_permissions_hint", "Try logging out and in again to refresh Discord guild permissions.")}</div>
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

        const role = guild.owner ? t("owner", "Owner") : guild.configurable ? t("administrator", "Administrator") : t("member", "Member");
        const disabledAttr = guild.configurable ? "" : "disabled";
        const buttonLabel = guild.configurable ? t("configure", "Configure") : t("no_access", "No Access");
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
        stagingStatus: document.getElementById("staging-status"),
        presetSelect: document.getElementById("preset-select"),
    };

    if (!refs.name) return;

    const activeGuild = (context.guilds || []).find((guild) => guild.id === context.active_guild_id);
    refs.name.value = activeGuild?.name || g.guild_name;
    if (refs.presetSelect && Array.isArray(context.preset_names) && context.preset_names.length) {
        refs.presetSelect.innerHTML = "";
        context.preset_names.forEach((presetName) => {
            const option = document.createElement("option");
            option.value = presetName;
            option.textContent = presetName;
            refs.presetSelect.appendChild(option);
        });
    }
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
    if (refs.stagingStatus) {
        refs.stagingStatus.textContent = context.has_staging
            ? "Staging config available for this guild."
            : "No staging config loaded.";
    }

    updateSetupDirtyState(false);
    refreshSetupChangePreview();

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

function renderStatusOfDay(health) {
    const target = document.getElementById("status-of-day");
    if (!target) return;
    const warns = Number(health?.warns || 0);
    const spam = Number(health?.spam_blocks || 0);
    const banRate = Number(health?.ban_rate || 0);

    let tone = "Stable";
    let detail = "Moderation load is calm and under control.";
    if (warns >= 10 || spam >= 12 || banRate >= 30) {
        tone = "High Pressure";
        detail = "Staff attention recommended: elevated moderation pressure detected.";
    } else if (warns >= 5 || spam >= 6 || banRate >= 15) {
        tone = "Watch";
        detail = "Traffic is active with moderate moderation risk.";
    }

    target.textContent = `${tone}: ${detail}`;
}

function renderSparkline(points) {
    const svg = document.getElementById("overview-sparkline");
    if (!svg) return;
    const values = Array.isArray(points) && points.length ? points : [0, 0, 0, 0, 0, 0];
    const width = 360;
    const height = 120;
    const max = Math.max(...values, 1);

    const pathPoints = values
        .map((value, index) => {
            const x = (index / Math.max(values.length - 1, 1)) * width;
            const y = height - (value / max) * (height - 12) - 6;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ");

    svg.innerHTML = `
        <polyline fill="none" stroke="rgba(102,216,255,0.35)" stroke-width="8" points="${pathPoints}" stroke-linecap="round" stroke-linejoin="round"></polyline>
        <polyline fill="none" stroke="rgba(42,165,255,0.95)" stroke-width="3" points="${pathPoints}" stroke-linecap="round" stroke-linejoin="round"></polyline>
    `;
}

function renderRiskHeatmap(heatmap) {
    const container = document.getElementById("risk-heatmap");
    if (!container) return;
    container.innerHTML = "";

    const rows = Array.isArray(heatmap?.rows) ? heatmap.rows : [];
    if (!rows.length) {
        const empty = document.createElement("article");
        empty.className = "log-item";
        empty.innerHTML = "<h3>No risk data</h3><p>No channel-hour risk signals in this period.</p>";
        container.appendChild(empty);
        return;
    }

    const max = Number(heatmap?.max_score || 1);
    rows.forEach((row) => {
        const wrapper = document.createElement("div");
        wrapper.className = "risk-row";

        const label = document.createElement("div");
        label.className = "risk-label";
        label.textContent = row.channel_id === "unknown" ? "Unknown channel" : `#${row.channel_id}`;
        wrapper.appendChild(label);

        const scores = Array.isArray(row.scores) ? row.scores : [];
        for (let hour = 0; hour < 24; hour += 1) {
            const score = Number(scores[hour] || 0);
            const cell = document.createElement("div");
            cell.className = "risk-cell";
            const pct = max > 0 ? score / max : 0;
            const level = score <= 0 ? 0 : Math.min(5, Math.max(1, Math.ceil(pct * 5)));
            if (level > 0) cell.classList.add(`level-${level}`);
            cell.title = `Hour ${String(hour).padStart(2, "0")}:00 | Score ${score}`;
            wrapper.appendChild(cell);
        }

        container.appendChild(wrapper);
    });
}

function showSkeleton(containerId, lines = 3) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    for (let i = 0; i < lines; i += 1) {
        const line = document.createElement("div");
        line.className = "skeleton";
        line.style.height = i === 0 ? "20px" : "14px";
        line.style.marginBottom = "0.45rem";
        container.appendChild(line);
    }
}

function toggleFocusMode() {
    const enabled = document.body.classList.toggle("focus-mode");
    flash(enabled ? "Focus mode enabled" : "Focus mode disabled", "success");
}

function refreshSetupChangePreview() {
    const panel = document.getElementById("setup-change-preview");
    const list = document.getElementById("setup-change-preview-list");
    if (!panel || !list || page !== "guild-settings" || !dashboardContext?.state) return;

    const current = dashboardContext.state;
    const payload = buildSetupPayloadFromForm();
    const checks = [
        ["Language", current.guild?.language, payload.guild.language],
        ["AutoMod invite filter", current.automation?.invite_filter, payload.automation.invite_filter],
        ["AutoMod link filter", current.automation?.link_filter, payload.automation.link_filter],
        ["AutoMod caps filter", current.automation?.caps_filter, payload.automation.caps_filter],
        ["Spam threshold", current.automation?.spam_threshold, payload.automation.spam_threshold],
        ["Warn ladder", JSON.stringify(current.warnings?.escalation_steps || []), JSON.stringify(payload.warnings.escalation_steps || [])],
        ["Modmail enabled", current.modmail?.enabled, payload.modmail.enabled],
        ["Welcome embed enabled", current.entry_exit?.welcome_enabled, payload.entry_exit.welcome_enabled],
        ["Leave embed enabled", current.entry_exit?.leave_enabled, payload.entry_exit.leave_enabled],
        ["Cogs", JSON.stringify(current.cogs || {}), JSON.stringify(payload.cogs || {})],
    ];

    const changed = checks.filter((item) => item[1] !== item[2]);
    if (!changed.length) {
        panel.hidden = true;
        list.innerHTML = "";
        return;
    }

    panel.hidden = false;
    list.innerHTML = "";
    changed.slice(0, 10).forEach((item) => {
        const row = document.createElement("article");
        row.className = "log-item";
        row.innerHTML = `<h3>${item[0]}</h3><p>Current: ${String(item[1])}</p><p>New: ${String(item[2])}</p>`;
        list.appendChild(row);
    });
}

function renderSmartAlerts(alerts) {
    const feed = document.getElementById("smart-alerts-feed");
    if (!feed) return;
    feed.innerHTML = "";

    const items = Array.isArray(alerts) ? alerts : [];
    items.forEach((item) => {
        const row = document.createElement("article");
        row.className = "log-item";
        row.innerHTML = `
            <h3>${item.title || "Alert"}</h3>
            <p>Severity: ${(item.severity || "low").toUpperCase()}</p>
            <p>${item.detail || ""}</p>
        `;
        feed.appendChild(row);
    });
}

function renderDashboardRoles(data) {
    const list = document.getElementById("dashboard-role-list");
    if (!list) return;
    list.innerHTML = "";

    const currentRole = data?.current_role || "viewer";
    const header = document.createElement("article");
    header.className = "log-item";
    header.innerHTML = `<h3>Your role: ${currentRole}</h3><p>Use admin/owner role to manage dashboard permissions.</p>`;
    list.appendChild(header);

    const entries = Array.isArray(data?.entries) ? data.entries : [];
    if (!entries.length) {
        const empty = document.createElement("article");
        empty.className = "log-item";
        empty.innerHTML = "<h3>No custom role entries</h3><p>Default Discord-derived permissions are active.</p>";
        list.appendChild(empty);
        return;
    }

    entries.forEach((entry) => {
        const row = document.createElement("article");
        row.className = "log-item";
        row.innerHTML = `<h3>User ${entry.user_id}</h3><p>Role: ${String(entry.role || "viewer").toUpperCase()}</p>`;
        list.appendChild(row);
    });
}

function renderSnapshots(items) {
    const feed = document.getElementById("snapshot-feed");
    if (!feed) return;
    feed.innerHTML = "";

    const snapshots = Array.isArray(items) ? items : [];
    if (!snapshots.length) {
        const empty = document.createElement("article");
        empty.className = "log-item";
        empty.innerHTML = "<h3>No snapshots yet</h3><p>Snapshots are created after setup updates and rollbacks.</p>";
        feed.appendChild(empty);
        return;
    }

    snapshots.forEach((snapshot) => {
        const row = document.createElement("article");
        row.className = "log-item";
        const when = snapshot.created_at ? new Date(snapshot.created_at).toLocaleString() : "Unknown time";
        const changes = Array.isArray(snapshot.changes) ? snapshot.changes.slice(0, 4).join(" | ") : "No diff summary";
        row.innerHTML = `
            <h3>Snapshot #${snapshot.id} (${snapshot.source || "setup"})</h3>
            <p>By: ${snapshot.created_by || "unknown"}</p>
            <p>${when}</p>
            <p>${changes}</p>
            <div class="actions"><button class="btn danger" data-rollback-snapshot="${snapshot.id}" type="button">Rollback</button></div>
        `;
        feed.appendChild(row);
    });
}

function buildSetupPayloadFromForm() {
    const setupToggles = document.querySelectorAll("input[data-setup-cog]");
    const cogs = {};
    setupToggles.forEach((toggle) => {
        cogs[toggle.dataset.setupCog] = toggle.checked;
    });

    const warningSteps = getWarnEscalationStepsFromForm();
    const firstStep = warningSteps[0];
    const currentModeration = dashboardContext?.state?.moderation || {};

    return {
        guild: {
            guild_name: document.getElementById("guild-name")?.value?.trim() || "",
            language: document.getElementById("guild-language")?.value || "pt",
            log_channel: document.getElementById("guild-log")?.value?.trim() || "",
        },
        moderation: {
            enabled: true,
            smart_antiflood: document.getElementById("auto-antiflood")?.checked ?? true,
            warning_limit: Number(firstStep.threshold || 3),
            default_action: firstStep.action === "timeout" ? "mute" : firstStep.action,
            modmail_enabled: document.getElementById("modmail-enabled")?.checked ?? true,
            tickets_enabled: Boolean(currentModeration.tickets_enabled),
            invite_filter: document.getElementById("auto-invite")?.checked ?? true,
            link_filter: document.getElementById("auto-link")?.checked ?? true,
            caps_filter: document.getElementById("auto-caps")?.checked ?? false,
            spam_threshold: Number(document.getElementById("auto-threshold")?.value || 6),
            quarantine_role: document.getElementById("auto-role")?.value?.trim() || "",
            immune_roles: [...selectedAutoImmuneRoles],
        },
        automation: {
            enabled: document.getElementById("auto-antiflood")?.checked ?? true,
            invite_filter: document.getElementById("auto-invite")?.checked ?? true,
            link_filter: document.getElementById("auto-link")?.checked ?? true,
            caps_filter: document.getElementById("auto-caps")?.checked ?? false,
            spam_threshold: Number(document.getElementById("auto-threshold")?.value || 6),
            quarantine_role: document.getElementById("auto-role")?.value?.trim() || "",
            immune_roles: [...selectedAutoImmuneRoles],
        },
        warnings: {
            enabled: true,
            public_reason_prompt: document.getElementById("warn-public-reason")?.checked ?? true,
            dm_user: document.getElementById("warn-dm-user")?.checked ?? true,
            threshold: Number(firstStep.threshold || 3),
            escalate_to: firstStep.action,
            escalation_steps: warningSteps,
        },
        logs: {
            enabled: document.getElementById("log-enabled")?.checked ?? true,
            moderation: document.getElementById("log-moderation")?.checked ?? true,
            ban_events: document.getElementById("log-ban-events")?.checked ?? true,
            join_leave: document.getElementById("log-join-leave")?.checked ?? false,
            message_delete: document.getElementById("log-message-delete")?.checked ?? true,
            modmail_transcripts: document.getElementById("log-modmail")?.checked ?? true,
            audit_channel: document.getElementById("log-audit-channel")?.value?.trim() || "",
            ban_channel: document.getElementById("log-ban-channel")?.value?.trim() || "",
        },
        modmail: {
            enabled: document.getElementById("modmail-enabled")?.checked ?? true,
            anonymous_replies: document.getElementById("modmail-anonymous")?.checked ?? false,
            close_on_idle: document.getElementById("modmail-idle")?.checked ?? true,
            inbox_channel: document.getElementById("modmail-channel")?.value?.trim() || "",
            alert_role: selectedModmailRoles[0] || "",
            alert_roles: [...selectedModmailRoles],
            auto_close_hours: Number(document.getElementById("modmail-hours")?.value || 48),
        },
        entry_exit: {
            welcome_enabled: document.getElementById("welcome-enabled")?.checked ?? false,
            welcome_channel: document.getElementById("welcome-channel")?.value?.trim() || "",
            welcome_title: document.getElementById("welcome-title")?.value?.trim() || "",
            welcome_description: document.getElementById("welcome-description")?.value?.trim() || "",
            welcome_color: document.getElementById("welcome-color")?.value?.trim() || "#57cc99",
            leave_enabled: document.getElementById("leave-enabled")?.checked ?? false,
            leave_channel: document.getElementById("leave-channel")?.value?.trim() || "",
            leave_title: document.getElementById("leave-title")?.value?.trim() || "",
            leave_description: document.getElementById("leave-description")?.value?.trim() || "",
            leave_color: document.getElementById("leave-color")?.value?.trim() || "#ef476f",
        },
        cogs,
    };
}

async function loadHealthMetrics() {
    const period = document.getElementById("health-period")?.value || "24h";
    const response = await api(`/api/dashboard/health?period=${encodeURIComponent(period)}`);
    renderHealthMetrics(response.health || {});
    renderStatusOfDay(response.health || {});
}

async function loadSmartAlerts() {
    const response = await api("/api/dashboard/alerts");
    renderSmartAlerts(response.alerts || []);
}

async function loadLiveActivity() {
    const response = await api("/api/dashboard/activity/recent?limit=40");
    renderLiveActivity(response.logs || []);

    const byHour = new Array(24).fill(0);
    (response.logs || []).forEach((item) => {
        if (!item.created_at) return;
        const date = new Date(item.created_at);
        if (Number.isNaN(date.getTime())) return;
        byHour[date.getHours()] += 1;
    });
    renderSparkline(byHour);
}

async function loadRiskHeatmap() {
    const period = document.getElementById("risk-period")?.value || "24h";
    showSkeleton("risk-heatmap", 6);
    const response = await api(`/api/dashboard/risk-heatmap?period=${encodeURIComponent(period)}`);
    renderRiskHeatmap(response.heatmap || {});
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

async function loadDashboardRoles() {
    const response = await api("/api/dashboard/roles");
    renderDashboardRoles(response);
}

async function loadSnapshots() {
    const response = await api("/api/dashboard/snapshots?limit=40");
    renderSnapshots(response.snapshots || []);
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
    setLang(inferLangFromState());
    ensureLanguageSelector();
    updateConfigLogBadge(payload.config_logs_unread || 0);
    renderPage(payload);
    setGuildSwitcher(payload.guilds || [], payload.active_guild_id);
    applyStaticTranslations();
    if (page === "overview") {
        showSkeleton("live-activity-feed", 4);
        showSkeleton("smart-alerts-feed", 3);
        showSkeleton("risk-heatmap", 6);
        await loadHealthMetrics();
        await loadLiveActivity();
        await loadSmartAlerts();
        await loadRiskHeatmap();
        startActivityStream();
    }
    if (page === "config-logs") {
        await loadConfigLogs();
        await loadDashboardRoles();
        await loadSnapshots();
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
                flash("Moderation updated", "success");
            } catch (error) {
                flash("Failed to update moderation", "error");
            }
        });
    }

    const toggleFocus = document.getElementById("toggle-focus-mode");
    if (toggleFocus) {
        toggleFocus.addEventListener("click", toggleFocusMode);
    }

    const refreshRisk = document.getElementById("refresh-risk-heatmap");
    if (refreshRisk) {
        refreshRisk.addEventListener("click", async () => {
            try {
                await loadRiskHeatmap();
                flash("Risk heatmap refreshed", "success");
            } catch (error) {
                flash("Failed to refresh risk heatmap", "error");
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

    const refreshAlerts = document.getElementById("refresh-alerts");
    if (refreshAlerts) {
        refreshAlerts.addEventListener("click", async () => {
            try {
                await loadSmartAlerts();
                flash("Smart alerts refreshed", "success");
            } catch (error) {
                flash("Failed to refresh alerts", "error");
            }
        });
    }

    const applyAuditFilters = document.getElementById("apply-audit-filters");
    if (applyAuditFilters) {
        applyAuditFilters.addEventListener("click", async () => {
            try {
                await loadConfigLogs();
                flash("Audit filters applied", "success");
            } catch (error) {
                flash("Failed to load audit logs", "error");
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
                flash("Guild settings updated", "success");
            } catch (error) {
                flash("Failed to update guild settings", "error");
            }
        });
    }

    const saveSetup = document.getElementById("save-setup");
    if (saveSetup) {
        saveSetup.addEventListener("click", async () => {
            const payload = buildSetupPayloadFromForm();

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
                refreshSetupChangePreview();
                try {
                    const logSync = await api("/api/dashboard/config-logs");
                    updateConfigLogBadge(logSync.unread || 0);
                } catch (error) {
                    // If log fetch fails we still keep setup save as successful.
                }
                flash("Bot setup updated", "success");
            } catch (error) {
                flash("Failed to update bot setup", "error");
            }
        });
    }

    const saveStaging = document.getElementById("save-staging");
    if (saveStaging) {
        saveStaging.addEventListener("click", async () => {
            try {
                await api("/api/dashboard/staging", {
                    method: "PUT",
                    body: JSON.stringify(buildSetupPayloadFromForm()),
                });
                const status = document.getElementById("staging-status");
                if (status) status.textContent = "Staging config saved from current form.";
                flash("Saved to staging", "success");
            } catch (error) {
                flash("Failed to save staging config", "error");
            }
        });
    }

    const loadStaging = document.getElementById("load-staging");
    if (loadStaging) {
        loadStaging.addEventListener("click", async () => {
            try {
                const response = await api("/api/dashboard/staging");
                if (!response.state) {
                    flash(t("no_staging_found", "No staging configuration found"));
                    return;
                }
                dashboardContext.state = response.state;
                renderGuildSettings(dashboardContext);
                refreshSetupChangePreview();
                flash("Staging loaded into form", "success");
            } catch (error) {
                flash("Failed to load staging config", "error");
            }
        });
    }

    const applyStaging = document.getElementById("apply-staging");
    if (applyStaging) {
        applyStaging.addEventListener("click", async () => {
            try {
                const response = await api("/api/dashboard/staging/apply", { method: "POST", body: "{}" });
                dashboardContext.state = response.state;
                dashboardContext.has_staging = false;
                renderGuildSettings(dashboardContext);
                flash("Staging applied to production", "success");
            } catch (error) {
                flash("Failed to apply staging", "error");
            }
        });
    }

    const discardStaging = document.getElementById("discard-staging");
    if (discardStaging) {
        discardStaging.addEventListener("click", async () => {
            try {
                await api("/api/dashboard/staging", { method: "DELETE", body: "{}" });
                dashboardContext.has_staging = false;
                const status = document.getElementById("staging-status");
                if (status) status.textContent = "No staging config loaded.";
                flash("Staging discarded", "success");
            } catch (error) {
                flash("Failed to discard staging", "error");
            }
        });
    }

    const applyPresetStaging = document.getElementById("apply-preset-staging");
    if (applyPresetStaging) {
        applyPresetStaging.addEventListener("click", async () => {
            const presetName = document.getElementById("preset-select")?.value || "gamer";
            try {
                await api("/api/dashboard/presets/apply", {
                    method: "POST",
                    body: JSON.stringify({ preset_name: presetName, target: "staging" }),
                });
                dashboardContext.has_staging = true;
                const status = document.getElementById("staging-status");
                if (status) status.textContent = `Preset '${presetName}' applied to staging.`;
                flash("Preset applied to staging", "success");
            } catch (error) {
                flash("Failed to apply preset to staging", "error");
            }
        });
    }

    const applyPresetProduction = document.getElementById("apply-preset-production");
    if (applyPresetProduction) {
        applyPresetProduction.addEventListener("click", async () => {
            const presetName = document.getElementById("preset-select")?.value || "gamer";
            try {
                const response = await api("/api/dashboard/presets/apply", {
                    method: "POST",
                    body: JSON.stringify({ preset_name: presetName, target: "production" }),
                });
                dashboardContext.state = response.state;
                renderGuildSettings(dashboardContext);
                flash("Preset applied to production", "success");
            } catch (error) {
                flash("Failed to apply preset to production", "error");
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
                flash("Config logs marked as read", "success");
            } catch (error) {
                flash("Failed to update log notification state", "error");
            }
        });
    }

    const saveDashboardRole = document.getElementById("save-dashboard-role");
    if (saveDashboardRole) {
        saveDashboardRole.addEventListener("click", async () => {
            const userId = document.getElementById("role-user-id")?.value?.trim() || "";
            const role = document.getElementById("role-name")?.value || "viewer";
            if (!userId) {
                flash("Provide a user ID");
                return;
            }
            try {
                await api("/api/dashboard/roles", {
                    method: "PUT",
                    body: JSON.stringify({ user_id: userId, role }),
                });
                await loadDashboardRoles();
                flash("Dashboard role saved", "success");
            } catch (error) {
                flash("Failed to save dashboard role", "error");
            }
        });
    }

    const refreshDashboardRoles = document.getElementById("refresh-dashboard-roles");
    if (refreshDashboardRoles) {
        refreshDashboardRoles.addEventListener("click", async () => {
            try {
                await loadDashboardRoles();
                flash("Roles refreshed", "success");
            } catch (error) {
                flash("Failed to load roles", "error");
            }
        });
    }

    const refreshSnapshots = document.getElementById("refresh-snapshots");
    if (refreshSnapshots) {
        refreshSnapshots.addEventListener("click", async () => {
            try {
                await loadSnapshots();
                flash("Snapshots refreshed", "success");
            } catch (error) {
                flash("Failed to refresh snapshots", "error");
            }
        });
    }

    const snapshotFeed = document.getElementById("snapshot-feed");
    if (snapshotFeed) {
        snapshotFeed.addEventListener("click", async (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            const snapshotId = target.dataset.rollbackSnapshot;
            if (!snapshotId) return;
            try {
                const response = await api(`/api/dashboard/snapshots/${encodeURIComponent(snapshotId)}/rollback`, {
                    method: "POST",
                    body: "{}",
                });
                dashboardContext.state = response.state;
                await loadSnapshots();
                flash("Snapshot rollback applied", "success");
            } catch (error) {
                flash("Failed to rollback snapshot", "error");
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
                flash("Cogs updated", "success");
            } catch (error) {
                flash("Failed to update cogs", "error");
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
                flash("Guild dashboard reset", "success");
            } catch (error) {
                flash("Failed to reset guild dashboard", "error");
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
        setLang(inferLangFromState());
        ensureLanguageSelector();
        applyStaticTranslations();

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
