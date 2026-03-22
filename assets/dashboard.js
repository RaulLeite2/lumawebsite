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
        nav_levels: "Levels",
        nav_economy: "Economy",
        nav_blog: "Blog",
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
        nav_levels: "Levels",
        nav_economy: "Economia",
        nav_blog: "Blog",
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
        nav_levels: "Niveles",
        nav_economy: "Economia",
        nav_blog: "Blog",
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
    "Signed in...": { pt: "Conectando...", en: "Signed in...", es: "Conectando..." },
    "Config Logs": { pt: "Logs de Config", en: "Config Logs", es: "Logs de Config" },
    "Audit Feed": { pt: "Feed de Auditoria", en: "Audit Feed", es: "Feed de Auditoria" },
    "Dashboard Roles": { pt: "Perfis do Dashboard", en: "Dashboard Roles", es: "Roles del Dashboard" },
    "Configuration Snapshots": { pt: "Snapshots de Configuracao", en: "Configuration Snapshots", es: "Snapshots de Configuracion" },
    "Refresh Snapshots": { pt: "Atualizar Snapshots", en: "Refresh Snapshots", es: "Actualizar Snapshots" },
    "Filter moderation and configuration events with export support.": { pt: "Filtre eventos de moderacao e configuracao com suporte a exportacao.", en: "Filter moderation and configuration events with export support.", es: "Filtra eventos de moderacion y configuracion con soporte de exportacion." },
    "Filters": { pt: "Filtros", en: "Filters", es: "Filtros" },
    "Filter by period, action, moderator, target user and channel.": { pt: "Filtre por periodo, acao, moderador, usuario alvo e canal.", en: "Filter by period, action, moderator, target user and channel.", es: "Filtra por periodo, accion, moderador, usuario objetivo y canal." },
    "Period": { pt: "Periodo", en: "Period", es: "Periodo" },
    "Action": { pt: "Acao", en: "Action", es: "Accion" },
    "Moderator ID": { pt: "ID do Moderador", en: "Moderator ID", es: "ID del Moderador" },
    "User ID": { pt: "ID do Usuario", en: "User ID", es: "ID de Usuario" },
    "Channel ID": { pt: "ID do Canal", en: "Channel ID", es: "ID del Canal" },
    "warn, ban, config_update...": { pt: "warn, ban, config_update...", en: "warn, ban, config_update...", es: "warn, ban, config_update..." },
    "Optional moderator ID": { pt: "ID do moderador (opcional)", en: "Optional moderator ID", es: "ID de moderador opcional" },
    "Optional target user ID": { pt: "ID do usuario alvo (opcional)", en: "Optional target user ID", es: "ID de usuario objetivo opcional" },
    "Optional channel ID": { pt: "ID do canal (opcional)", en: "Optional channel ID", es: "ID de canal opcional" },
    "Live, filterable timeline of moderation and setup events.": { pt: "Linha do tempo ao vivo e filtravel de eventos de moderacao e setup.", en: "Live, filterable timeline of moderation and setup events.", es: "Linea de tiempo en vivo y filtrable de eventos de moderacion y configuracion." },
    "Owner/admin can manage panel roles: admin, moderator and viewer.": { pt: "Owner/admin pode gerenciar perfis do painel: admin, moderator e viewer.", en: "Owner/admin can manage panel roles: admin, moderator and viewer.", es: "Owner/admin puede gestionar roles del panel: admin, moderator y viewer." },
    "Discord user ID": { pt: "ID de usuario do Discord", en: "Discord user ID", es: "ID de usuario de Discord" },
    "Role": { pt: "Perfil", en: "Role", es: "Rol" },
    "Admin": { pt: "Admin", en: "Admin", es: "Admin" },
    "Moderator": { pt: "Moderador", en: "Moderator", es: "Moderador" },
    "Viewer": { pt: "Visualizador", en: "Viewer", es: "Visualizador" },
    "Version history with rollback support.": { pt: "Historico de versoes com suporte a rollback.", en: "Version history with rollback support.", es: "Historial de versiones con soporte de rollback." },
    "Servers": { pt: "Servidores", en: "Servers", es: "Servidores" },
    "Overview": { pt: "Visao Geral", en: "Overview", es: "Resumen" },
    "Moderation": { pt: "Moderacao", en: "Moderation", es: "Moderacion" },
    "Bot Setup": { pt: "Configuracao do Bot", en: "Bot Setup", es: "Configuracion del Bot" },
    "Select the server you want to configure.": { pt: "Selecione o servidor que deseja configurar.", en: "Select the server you want to configure.", es: "Selecciona el servidor que deseas configurar." },
    "<manageable> configurable servers, <total> servers total.": { pt: "<manageable> servidores configuraveis, <total> servidores no total.", en: "<manageable> configurable servers, <total> servers total.", es: "<manageable> servidores configurables, <total> servidores en total." },
    "Narrative overview with risk, incidents and operational status.": { pt: "Visao narrativa com risco, incidentes e status operacional.", en: "Narrative overview with risk, incidents and operational status.", es: "Resumen narrativo con riesgo, incidentes y estado operativo." },
    "Status of the Day": { pt: "Status do Dia", en: "Status of the Day", es: "Estado del Dia" },
    "Operational Pulse": { pt: "Pulso Operacional", en: "Operational Pulse", es: "Pulso Operativo" },
    "Guild": { pt: "Guild", en: "Guild", es: "Servidor" },
    "Warnings (24h)": { pt: "Advertencias (24h)", en: "Warnings (24h)", es: "Advertencias (24h)" },
    "Open Tickets": { pt: "Tickets Abertos", en: "Open Tickets", es: "Tickets Abiertos" },
    "Cogs Enabled": { pt: "Cogs Ativos", en: "Cogs Enabled", es: "Cogs Activos" },
    "Moderation Rhythm": { pt: "Ritmo de Moderacao", en: "Moderation Rhythm", es: "Ritmo de Moderacion" },
    "Smooth trend based on recent moderation volume.": { pt: "Tendencia suave baseada no volume recente de moderacao.", en: "Smooth trend based on recent moderation volume.", es: "Tendencia suave basada en el volumen reciente de moderacion." },
    "Focus Actions": { pt: "Acoes de Foco", en: "Focus Actions", es: "Acciones de Enfoque" },
    "Rapid actions for active incidents.": { pt: "Acoes rapidas para incidentes ativos.", en: "Rapid actions for active incidents.", es: "Acciones rapidas para incidentes activos." },
    "Open Moderation": { pt: "Abrir Moderacao", en: "Open Moderation", es: "Abrir Moderacion" },
    "Open Audit Center": { pt: "Abrir Central de Auditoria", en: "Open Audit Center", es: "Abrir Centro de Auditoria" },
    "Open Bot Setup": { pt: "Abrir Configuracao do Bot", en: "Open Bot Setup", es: "Abrir Configuracion del Bot" },
    "Metrics by selected window for moderation performance.": { pt: "Metricas por janela selecionada para performance de moderacao.", en: "Metrics by selected window for moderation performance.", es: "Metricas por ventana seleccionada para el rendimiento de moderacion." },
    "Warns": { pt: "Advertencias", en: "Warns", es: "Advertencias" },
    "Ban Rate": { pt: "Taxa de Ban", en: "Ban Rate", es: "Tasa de Ban" },
    "Spam Blocks": { pt: "Bloqueios de Spam", en: "Spam Blocks", es: "Bloqueos de Spam" },
    "Real-time stream: warns, deletes, kicks, bans, joins/leaves, tickets and config updates.": { pt: "Fluxo em tempo real: warns, deletes, kicks, bans, entradas/saidas, tickets e atualizacoes de config.", en: "Real-time stream: warns, deletes, kicks, bans, joins/leaves, tickets and config updates.", es: "Flujo en tiempo real: warns, deletes, kicks, bans, entradas/salidas, tickets y actualizaciones de config." },
    "Color severity by channel and hour for moderation pressure.": { pt: "Severidade por cor por canal e hora para pressao de moderacao.", en: "Color severity by channel and hour for moderation pressure.", es: "Severidad por color por canal y hora para presion de moderacion." },
    "Automated anomaly detection for raid, spam spikes and warning bursts.": { pt: "Deteccao automatizada de anomalias para raid, picos de spam e surtos de warn.", en: "Automated anomaly detection for raid, spam spikes and warning bursts.", es: "Deteccion automatizada de anomalias para raids, picos de spam y rafagas de advertencias." },
    "Current Cogs": { pt: "Cogs Atuais", en: "Current Cogs", es: "Cogs Activos" },
    "Live status for modules in this guild.": { pt: "Status ao vivo dos modulos nesta guild.", en: "Live status for modules in this guild.", es: "Estado en vivo de los modulos en este servidor." },
    "Enable and disable modules per guild.": { pt: "Ative e desative modulos por guild.", en: "Enable and disable modules per guild.", es: "Activa y desactiva modulos por servidor." },
    "Module Toggles": { pt: "Alternancia de Modulos", en: "Module Toggles", es: "Interruptores de Modulos" },
    "Changes are applied to the currently selected guild.": { pt: "As alteracoes sao aplicadas na guild selecionada atualmente.", en: "Changes are applied to the currently selected guild.", es: "Los cambios se aplican al servidor seleccionado actualmente." },
    "Reset Current Guild": { pt: "Resetar Guild Atual", en: "Reset Current Guild", es: "Reiniciar Servidor Actual" },
    "Moderation Configuration": { pt: "Configuracao de Moderacao", en: "Moderation Configuration", es: "Configuracion de Moderacion" },
    "Tune anti-abuse defaults for each guild.": { pt: "Ajuste os padroes anti-abuso para cada guild.", en: "Tune anti-abuse defaults for each guild.", es: "Ajusta los valores anti-abuso para cada servidor." },
    "Rules": { pt: "Regras", en: "Rules", es: "Reglas" },
    "Enable modules, tune AutoMod filters and set escalation defaults.": { pt: "Ative modulos, ajuste filtros do AutoMod e defina os padroes de escalonamento.", en: "Enable modules, tune AutoMod filters and set escalation defaults.", es: "Activa modulos, ajusta filtros de AutoMod y define valores de escalamiento." },
    "Warning limit": { pt: "Limite de advertencias", en: "Warning limit", es: "Limite de advertencias" },
    "Default action": { pt: "Acao padrao", en: "Default action", es: "Accion predeterminada" },
    "Moderation Enabled": { pt: "Moderacao Ativada", en: "Moderation Enabled", es: "Moderacion Activada" },
    "Smart Anti-flood": { pt: "Anti-flood Inteligente", en: "Smart Anti-flood", es: "Anti-flood Inteligente" },
    "Modmail Enabled": { pt: "Modmail Ativado", en: "Modmail Enabled", es: "Modmail Activado" },
    "Tickets Enabled": { pt: "Tickets Ativados", en: "Tickets Enabled", es: "Tickets Activados" },
    "AutoMod Filters": { pt: "Filtros do AutoMod", en: "AutoMod Filters", es: "Filtros de AutoMod" },
    "Define what AutoMod blocks automatically. Immune roles bypass invite/link/caps/spam enforcement.": { pt: "Defina o que o AutoMod bloqueia automaticamente. Cargos imunes ignoram regras de convite/link/caps/spam.", en: "Define what AutoMod blocks automatically. Immune roles bypass invite/link/caps/spam enforcement.", es: "Define lo que AutoMod bloquea automaticamente. Los roles inmunes omiten reglas de invitacion/link/caps/spam." },
    "Block invite links": { pt: "Bloquear links de convite", en: "Block invite links", es: "Bloquear enlaces de invitacion" },
    "Block external links": { pt: "Bloquear links externos", en: "Block external links", es: "Bloquear enlaces externos" },
    "Detect excessive caps": { pt: "Detectar uso excessivo de caps", en: "Detect excessive caps", es: "Detectar uso excesivo de mayusculas" },
    "Spam threshold": { pt: "Limiar de spam", en: "Spam threshold", es: "Umbral de spam" },
    "Quarantine role": { pt: "Cargo de quarentena", en: "Quarantine role", es: "Rol de cuarentena" },
    "Add immune role": { pt: "Adicionar cargo imune", en: "Add immune role", es: "Agregar rol inmune" },
    "AutoMod immunity": { pt: "Imunidade do AutoMod", en: "AutoMod immunity", es: "Inmunidad de AutoMod" },
    "Admins and selected roles are ignored by AutoMod checks.": { pt: "Admins e cargos selecionados sao ignorados pelas verificacoes do AutoMod.", en: "Admins and selected roles are ignored by AutoMod checks.", es: "Admins y roles seleccionados son ignorados por las verificaciones de AutoMod." },
    "Add Immune Role": { pt: "Adicionar Cargo Imune", en: "Add Immune Role", es: "Agregar Rol Inmune" },
    "Remove Selected": { pt: "Remover Selecionados", en: "Remove Selected", es: "Quitar Seleccionados" },
    "AutoMod Simulator": { pt: "Simulador de AutoMod", en: "AutoMod Simulator", es: "Simulador de AutoMod" },
    "Paste a message to preview which rule would trigger and what action is suggested.": { pt: "Cole uma mensagem para prever qual regra acionaria e qual acao sera sugerida.", en: "Paste a message to preview which rule would trigger and what action is suggested.", es: "Pega un mensaje para ver que regla se activaria y que accion se sugiere." },
    "Message for simulation": { pt: "Mensagem para simulacao", en: "Message for simulation", es: "Mensaje para simulacion" },
    "Ex: entre no meu servidor discord.gg/abc123": { pt: "Ex: entre no meu servidor discord.gg/abc123", en: "Ex: join my server discord.gg/abc123", es: "Ej: entra a mi servidor discord.gg/abc123" },
    "Run Simulation": { pt: "Executar Simulacao", en: "Run Simulation", es: "Ejecutar Simulacion" },
    "Bot Setup": { pt: "Configuracao do Bot", en: "Bot Setup", es: "Configuracion del Bot" },
    "Configure moderation flows, logs, modmail and the core modules for the selected guild.": { pt: "Configure fluxos de moderacao, logs, modmail e modulos centrais para a guild selecionada.", en: "Configure moderation flows, logs, modmail and the core modules for the selected guild.", es: "Configura flujos de moderacion, logs, modmail y modulos principales para el servidor seleccionado." },
    "Luma control room": { pt: "Sala de controle da Luma", en: "Luma control room", es: "Sala de control de Luma" },
    "Everything the staff team needs, in one screen": { pt: "Tudo que a staff precisa, em uma tela", en: "Everything the staff team needs, in one screen", es: "Todo lo que el staff necesita, en una sola pantalla" },
    "Turn modules on and off, choose where events are logged, and define how AutoMod and warns should react before the first incident happens. For settings backed by the bot database, use a Discord mention or numeric ID.": { pt: "Ative e desative modulos, escolha onde eventos sao registrados e defina como AutoMod e warns devem reagir antes do primeiro incidente. Para ajustes salvos no banco do bot, use mencao do Discord ou ID numerico.", en: "Turn modules on and off, choose where events are logged, and define how AutoMod and warns should react before the first incident happens. For settings backed by the bot database, use a Discord mention or numeric ID.", es: "Activa y desactiva modulos, elige donde se registran eventos y define como deben reaccionar AutoMod y warns antes del primer incidente. Para ajustes guardados en la base del bot, usa mencion de Discord o ID numerico." },
    "Protections": { pt: "Protecoes", en: "Protections", es: "Protecciones" },
    "Active filters": { pt: "Filtros ativos", en: "Active filters", es: "Filtros activos" },
    "Logs": { pt: "Logs", en: "Logs", es: "Logs" },
    "Streams enabled": { pt: "Fluxos ativos", en: "Streams enabled", es: "Flujos activos" },
    "Warn action": { pt: "Acao de warn", en: "Warn action", es: "Accion de warn" },
    "Escalation default": { pt: "Padrao de escalonamento", en: "Escalation default", es: "Predeterminado de escalamiento" },
    "Foundation": { pt: "Fundacao", en: "Foundation", es: "Fundacion" },
    "Safety": { pt: "Seguranca", en: "Safety", es: "Seguridad" },
    "Communications": { pt: "Comunicacoes", en: "Communications", es: "Comunicaciones" },
    "Modules": { pt: "Modulos", en: "Modules", es: "Modulos" },
    "Configuration updated": { pt: "Configuracao atualizada", en: "Configuration updated", es: "Configuracion actualizada" },
    "Your guild setup is in sync with the bot.": { pt: "Seu setup da guild esta em sincronia com o bot.", en: "Your guild setup is in sync with the bot.", es: "La configuracion del servidor esta sincronizada con el bot." },
    "Waiting for the next update.": { pt: "Aguardando a proxima atualizacao.", en: "Waiting for the next update.", es: "Esperando la proxima actualizacion." },
    "Guild defaults and routing": { pt: "Padroes e roteamento da guild", en: "Guild defaults and routing", es: "Valores y enrutamiento del servidor" },
    "Set the identity, language and primary audit destination before the staff-specific flows.": { pt: "Defina identidade, idioma e destino principal de auditoria antes dos fluxos da staff.", en: "Set the identity, language and primary audit destination before the staff-specific flows.", es: "Define identidad, idioma y destino principal de auditoria antes de los flujos del staff." },
    "Guild Identity": { pt: "Identidade da Guild", en: "Guild Identity", es: "Identidad del Servidor" },
    "Base labels and default routing for the panel.": { pt: "Rotulos base e roteamento padrao para o painel.", en: "Base labels and default routing for the panel.", es: "Etiquetas base y enrutamiento predeterminado para el panel." },
    "Core": { pt: "Nucleo", en: "Core", es: "Nucleo" },
    "Guild name": { pt: "Nome da guild", en: "Guild name", es: "Nombre del servidor" },
    "Language": { pt: "Idioma", en: "Language", es: "Idioma" },
    "Portuguese": { pt: "Portugues", en: "Portuguese", es: "Portugues" },
    "English": { pt: "Ingles", en: "English", es: "Ingles" },
    "Spanish": { pt: "Espanhol", en: "Spanish", es: "Espanol" },
    "Default log channel": { pt: "Canal de log padrao", en: "Default log channel", es: "Canal de log predeterminado" },
    "Community Presets": { pt: "Presets da Comunidade", en: "Community Presets", es: "Presets de la Comunidad" },
    "Preset template": { pt: "Template de preset", en: "Preset template", es: "Plantilla de preset" },
    "Gamer": { pt: "Gamer", en: "Gamer", es: "Gamer" },
    "Study": { pt: "Estudo", en: "Study", es: "Estudio" },
    "Creator": { pt: "Criador", en: "Creator", es: "Creador" },
    "Support": { pt: "Suporte", en: "Support", es: "Soporte" },
    "Large Community": { pt: "Comunidade Grande", en: "Large Community", es: "Comunidad Grande" },
    "Apply target": { pt: "Destino da aplicacao", en: "Apply target", es: "Destino de aplicacion" },
    "Apply to Staging": { pt: "Aplicar em Staging", en: "Apply to Staging", es: "Aplicar a Staging" },
    "Apply to Production": { pt: "Aplicar em Producao", en: "Apply to Production", es: "Aplicar a Produccion" },
    "Staging Environment": { pt: "Ambiente de Staging", en: "Staging Environment", es: "Entorno de Staging" },
    "No staging config loaded.": { pt: "Nenhuma configuracao de staging carregada.", en: "No staging config loaded.", es: "No hay configuracion de staging cargada." },
    "Save Current Form to Staging": { pt: "Salvar Formulario Atual em Staging", en: "Save Current Form to Staging", es: "Guardar Formulario Actual en Staging" },
    "Load Staging Into Form": { pt: "Carregar Staging no Formulario", en: "Load Staging Into Form", es: "Cargar Staging en el Formulario" },
    "Apply Staging to Production": { pt: "Aplicar Staging em Producao", en: "Apply Staging to Production", es: "Aplicar Staging a Produccion" },
    "Discard Staging": { pt: "Descartar Staging", en: "Discard Staging", es: "Descartar Staging" },
    "Automated protection and escalation": { pt: "Protecao automatizada e escalonamento", en: "Automated protection and escalation", es: "Proteccion automatizada y escalamiento" },
    "Configure the filters and the warning ladder that should react before moderators need to step in.": { pt: "Configure os filtros e a escada de advertencias que devem reagir antes da intervencao humana.", en: "Configure the filters and the warning ladder that should react before moderators need to step in.", es: "Configura filtros y escalera de advertencias que deben reaccionar antes de que el staff intervenga." },
    "AutoMod": { pt: "AutoMod", en: "AutoMod", es: "AutoMod" },
    "Protect the server against spam, invite drops and noisy raids.": { pt: "Proteja o servidor contra spam, convites em massa e raids barulhentas.", en: "Protect the server against spam, invite drops and noisy raids.", es: "Protege el servidor contra spam, invitaciones masivas y raids ruidosas." },
    "Auto": { pt: "Auto", en: "Auto", es: "Auto" },
    "Enable warn automation": { pt: "Ativar automacao de warns", en: "Enable warn automation", es: "Activar automatizacion de warns" },
    "Enable anti-flood engine": { pt: "Ativar motor anti-flood", en: "Enable anti-flood engine", es: "Activar motor anti-flood" },
    "Users with admin powers are always immune.": { pt: "Usuarios com poder de admin sao sempre imunes.", en: "Users with admin powers are always immune.", es: "Usuarios con poderes de admin siempre son inmunes." },
    "Warn System": { pt: "Sistema de Warn", en: "Warn System", es: "Sistema de Warn" },
    "Define how warnings escalate before they turn into bans or timeouts.": { pt: "Defina como advertencias escalam antes de virar ban ou timeout.", en: "Define how warnings escalate before they turn into bans or timeouts.", es: "Define como escalan las advertencias antes de convertirse en ban o timeout." },
    "Warns": { pt: "Warns", en: "Warns", es: "Warns" },
    "Enable warns (core module)": { pt: "Ativar warns (modulo core)", en: "Enable warns (core module)", es: "Activar warns (modulo core)" },
    "Prompt staff for a public reason": { pt: "Solicitar motivo publico para a staff", en: "Prompt staff for a public reason", es: "Solicitar motivo publico al staff" },
    "Send DM to warned user": { pt: "Enviar DM ao usuario advertido", en: "Send DM to warned user", es: "Enviar DM al usuario advertido" },
    "Warn escalation ladder": { pt: "Escada de escalonamento de warns", en: "Warn escalation ladder", es: "Escalera de escalamiento de warns" },
    "Configure multiple actions based on warning count.": { pt: "Configure varias acoes com base na quantidade de warns.", en: "Configure multiple actions based on warning count.", es: "Configura multiples acciones segun el conteo de advertencias." },
    "Add Step": { pt: "Adicionar Etapa", en: "Add Step", es: "Agregar Paso" },
    "Drag cards to reorder the ladder. Top item is the first escalation.": { pt: "Arraste os cards para reordenar a escada. O item do topo e o primeiro escalonamento.", en: "Drag cards to reorder the ladder. Top item is the first escalation.", es: "Arrastra las tarjetas para reordenar la escalera. El item superior es el primer escalamiento." },
    "At": { pt: "Em", en: "At", es: "En" },
    "warns apply": { pt: "warns aplicam", en: "warns apply", es: "aplican warns" },
    "Timeout": { pt: "Timeout", en: "Timeout", es: "Timeout" },
    "Kick": { pt: "Kick", en: "Kick", es: "Kick" },
    "Ban": { pt: "Ban", en: "Ban", es: "Ban" },
    "Mute": { pt: "Mute", en: "Mute", es: "Mute" },
    "Remove": { pt: "Remover", en: "Remove", es: "Quitar" },
    "Audit history and staff inbox": { pt: "Historico de auditoria e inbox da staff", en: "Audit history and staff inbox", es: "Historial de auditoria e inbox del staff" },
    "Define what the team records, how modmail behaves and which channels receive alerts.": { pt: "Defina o que a equipe registra, como o modmail se comporta e quais canais recebem alertas.", en: "Define what the team records, how modmail behaves and which channels receive alerts.", es: "Define que registra el equipo, como funciona modmail y que canales reciben alertas." },
    "Logs & Audit": { pt: "Logs e Auditoria", en: "Logs & Audit", es: "Logs y Auditoria" },
    "Choose which staff events are recorded and where they should go.": { pt: "Escolha quais eventos da staff sao registrados e para onde devem ir.", en: "Choose which staff events are recorded and where they should go.", es: "Elige que eventos del staff se registran y a donde deben ir." },
    "Enable all logs": { pt: "Ativar todos os logs", en: "Enable all logs", es: "Activar todos los logs" },
    "Moderation actions": { pt: "Acoes de moderacao", en: "Moderation actions", es: "Acciones de moderacion" },
    "Ban and unban logs": { pt: "Logs de ban e unban", en: "Ban and unban logs", es: "Logs de ban y unban" },
    "Join and leave events": { pt: "Eventos de entrada e saida", en: "Join and leave events", es: "Eventos de entrada y salida" },
    "Deleted messages": { pt: "Mensagens deletadas", en: "Deleted messages", es: "Mensajes eliminados" },
    "Modmail transcripts": { pt: "Transcricoes de modmail", en: "Modmail transcripts", es: "Transcripciones de modmail" },
    "Audit channel": { pt: "Canal de auditoria", en: "Audit channel", es: "Canal de auditoria" },
    "Ban log channel": { pt: "Canal de logs de ban", en: "Ban log channel", es: "Canal de logs de ban" },
    "Modmail": { pt: "Modmail", en: "Modmail", es: "Modmail" },
    "Keep staff contact organized and predictable for the community.": { pt: "Mantenha o contato da staff organizado e previsivel para a comunidade.", en: "Keep staff contact organized and predictable for the community.", es: "Mantiene el contacto del staff organizado y predecible para la comunidad." },
    "Inbox": { pt: "Inbox", en: "Inbox", es: "Inbox" },
    "Enable modmail": { pt: "Ativar modmail", en: "Enable modmail", es: "Activar modmail" },
    "Allow anonymous staff replies": { pt: "Permitir respostas anonimas da staff", en: "Allow anonymous staff replies", es: "Permitir respuestas anonimas del staff" },
    "Auto-close on idle": { pt: "Auto-fechar por inatividade", en: "Auto-close on idle", es: "Auto-cerrar por inactividad" },
    "Modmail category": { pt: "Categoria do modmail", en: "Modmail category", es: "Categoria de modmail" },
    "Add alert role": { pt: "Adicionar cargo de alerta", en: "Add alert role", es: "Agregar rol de alerta" },
    "Add Role": { pt: "Adicionar Cargo", en: "Add Role", es: "Agregar Rol" },
    "Auto-close after (hours)": { pt: "Auto-fechar apos (horas)", en: "Auto-close after (hours)", es: "Auto-cerrar despues de (horas)" },
    "Entry / Exit Embeds": { pt: "Embeds de Entrada / Saida", en: "Entry / Exit Embeds", es: "Embeds de Entrada / Salida" },
    "Customize welcome and leave embeds and choose exactly where they are posted.": { pt: "Personalize embeds de boas-vindas e saida e escolha exatamente onde serao enviados.", en: "Customize welcome and leave embeds and choose exactly where they are posted.", es: "Personaliza embeds de bienvenida y salida y elige exactamente donde se envian." },
    "Embeds": { pt: "Embeds", en: "Embeds", es: "Embeds" },
    "Welcome Embed": { pt: "Embed de Boas-vindas", en: "Welcome Embed", es: "Embed de Bienvenida" },
    "Enable welcome embed": { pt: "Ativar embed de boas-vindas", en: "Enable welcome embed", es: "Activar embed de bienvenida" },
    "Welcome channel": { pt: "Canal de boas-vindas", en: "Welcome channel", es: "Canal de bienvenida" },
    "Embed color (hex)": { pt: "Cor da embed (hex)", en: "Embed color (hex)", es: "Color del embed (hex)" },
    "Title": { pt: "Titulo", en: "Title", es: "Titulo" },
    "Description": { pt: "Descricao", en: "Description", es: "Descripcion" },
    "Preview Welcome Embed": { pt: "Preview da Embed de Boas-vindas", en: "Preview Welcome Embed", es: "Preview de Embed de Bienvenida" },
    "Leave Embed": { pt: "Embed de Saida", en: "Leave Embed", es: "Embed de Salida" },
    "Enable leave embed": { pt: "Ativar embed de saida", en: "Enable leave embed", es: "Activar embed de salida" },
    "Leave channel": { pt: "Canal de saida", en: "Leave channel", es: "Canal de salida" },
    "Preview Leave Embed": { pt: "Preview da Embed de Saida", en: "Preview Leave Embed", es: "Preview de Embed de Salida" },
    "Variaveis disponiveis:": { pt: "Variaveis disponiveis:", en: "Available variables:", es: "Variables disponibles:" },
    "Available variables sentence": {
        pt: "Variaveis disponiveis: <strong>{member}</strong> e <strong>{guild}</strong>.",
        en: "Available variables: <strong>{member}</strong> and <strong>{guild}</strong>.",
        es: "Variables disponibles: <strong>{member}</strong> y <strong>{guild}</strong>.",
    },
    "Guild modules and final actions": { pt: "Modulos da guild e acoes finais", en: "Guild modules and final actions", es: "Modulos del servidor y acciones finales" },
    "Enable only the cogs this server should use, then save or reset the entire setup from one place.": { pt: "Ative apenas os cogs que este servidor deve usar e depois salve ou resete o setup inteiro em um lugar.", en: "Enable only the cogs this server should use, then save or reset the entire setup from one place.", es: "Activa solo los cogs que este servidor debe usar, luego guarda o reinicia toda la configuracion desde un solo lugar." },
    "Core Modules": { pt: "Modulos Core", en: "Core Modules", es: "Modulos Core" },
    "Turn cogs on and off for this guild before saving the setup.": { pt: "Ative ou desative cogs para esta guild antes de salvar o setup.", en: "Turn cogs on and off for this guild before saving the setup.", es: "Activa o desactiva cogs para este servidor antes de guardar la configuracion." },
    "No pending changes.": { pt: "Sem alteracoes pendentes.", en: "No pending changes.", es: "Sin cambios pendientes." },
    "Pending Changes Preview": { pt: "Preview de Alteracoes Pendentes", en: "Pending Changes Preview", es: "Preview de Cambios Pendientes" },
    "Review key deltas before applying to production.": { pt: "Revise diferencas principais antes de aplicar em producao.", en: "Review key deltas before applying to production.", es: "Revisa diferencias clave antes de aplicar a produccion." },
    "Staging config available for this guild.": { pt: "Configuracao de staging disponivel para esta guild.", en: "Staging config available for this guild.", es: "Configuracion de staging disponible para este servidor." },
    "Staging config saved from current form.": { pt: "Configuracao de staging salva a partir do formulario atual.", en: "Staging config saved from current form.", es: "Configuracion de staging guardada desde el formulario actual." },
    "Preset '{preset}' applied to staging.": { pt: "Preset '{preset}' aplicado ao staging.", en: "Preset '{preset}' applied to staging.", es: "Preset '{preset}' aplicado a staging." },
    "No config changes yet": { pt: "Ainda nao ha mudancas de configuracao", en: "No config changes yet", es: "Todavia no hay cambios de configuracion" },
    "When setup changes are applied, they will appear here.": { pt: "Quando mudancas de setup forem aplicadas, elas aparecerao aqui.", en: "When setup changes are applied, they will appear here.", es: "Cuando se apliquen cambios de configuracion, apareceran aqui." },
    "Unknown time": { pt: "Horario desconhecido", en: "Unknown time", es: "Hora desconocida" },
    "Configuration update": { pt: "Atualizacao de configuracao", en: "Configuration update", es: "Actualizacion de configuracion" },
    "By": { pt: "Por", en: "By", es: "Por" },
    "Target": { pt: "Alvo", en: "Target", es: "Objetivo" },
    "Channel": { pt: "Canal", en: "Channel", es: "Canal" },
    "unknown": { pt: "desconhecido", en: "unknown", es: "desconocido" },
    "No recent activity": { pt: "Sem atividade recente", en: "No recent activity", es: "Sin actividad reciente" },
    "New moderation and setup events will appear here in real time.": { pt: "Novos eventos de moderacao e setup aparecerao aqui em tempo real.", en: "New moderation and setup events will appear here in real time.", es: "Nuevos eventos de moderacion y configuracion apareceran aqui en tiempo real." },
    "event": { pt: "evento", en: "event", es: "evento" },
    "No details": { pt: "Sem detalhes", en: "No details", es: "Sin detalles" },
    "Stable": { pt: "Estavel", en: "Stable", es: "Estable" },
    "Moderation load is calm and under control.": { pt: "A carga de moderacao esta calma e sob controle.", en: "Moderation load is calm and under control.", es: "La carga de moderacion esta tranquila y bajo control." },
    "High Pressure": { pt: "Alta Pressao", en: "High Pressure", es: "Alta Presion" },
    "Staff attention recommended: elevated moderation pressure detected.": { pt: "Atencao da equipe recomendada: pressao elevada de moderacao detectada.", en: "Staff attention recommended: elevated moderation pressure detected.", es: "Se recomienda atencion del staff: presion elevada de moderacion detectada." },
    "Watch": { pt: "Atencao", en: "Watch", es: "Vigilancia" },
    "Traffic is active with moderate moderation risk.": { pt: "O trafego esta ativo com risco moderado de moderacao.", en: "Traffic is active with moderate moderation risk.", es: "El trafico esta activo con riesgo moderado de moderacion." },
    "No risk data": { pt: "Sem dados de risco", en: "No risk data", es: "Sin datos de riesgo" },
    "No channel-hour risk signals in this period.": { pt: "Sem sinais de risco por canal-hora neste periodo.", en: "No channel-hour risk signals in this period.", es: "Sin senales de riesgo por canal-hora en este periodo." },
    "Unknown channel": { pt: "Canal desconhecido", en: "Unknown channel", es: "Canal desconocido" },
    "Hour": { pt: "Hora", en: "Hour", es: "Hora" },
    "Score": { pt: "Pontuacao", en: "Score", es: "Puntuacion" },
    "Current": { pt: "Atual", en: "Current", es: "Actual" },
    "New": { pt: "Novo", en: "New", es: "Nuevo" },
    "Alert": { pt: "Alerta", en: "Alert", es: "Alerta" },
    "Severity": { pt: "Severidade", en: "Severity", es: "Severidad" },
    "Your role": { pt: "Seu perfil", en: "Your role", es: "Tu rol" },
    "Use admin/owner role to manage dashboard permissions.": { pt: "Use perfil admin/owner para gerenciar permissoes do dashboard.", en: "Use admin/owner role to manage dashboard permissions.", es: "Usa rol admin/owner para gestionar permisos del dashboard." },
    "No custom role entries": { pt: "Nenhuma permissao personalizada", en: "No custom role entries", es: "No hay entradas de rol personalizadas" },
    "Default Discord-derived permissions are active.": { pt: "As permissoes padrao derivadas do Discord estao ativas.", en: "Default Discord-derived permissions are active.", es: "Los permisos predeterminados derivados de Discord estan activos." },
    "No snapshots yet": { pt: "Ainda nao ha snapshots", en: "No snapshots yet", es: "Todavia no hay snapshots" },
    "Snapshots are created after setup updates and rollbacks.": { pt: "Snapshots sao criados apos atualizacoes de setup e rollbacks.", en: "Snapshots are created after setup updates and rollbacks.", es: "Los snapshots se crean despues de actualizaciones y rollbacks." },
    "No diff summary": { pt: "Sem resumo de diferencas", en: "No diff summary", es: "Sin resumen de diferencias" },
    "Rollback": { pt: "Rollback", en: "Rollback", es: "Rollback" },
    "Rule Triggered": { pt: "Regra Acionada", en: "Rule Triggered", es: "Regla Activada" },
    "No Rule Triggered": { pt: "Nenhuma Regra Acionada", en: "No Rule Triggered", es: "Ninguna Regla Activada" },
    "Suggested action": { pt: "Acao sugerida", en: "Suggested action", es: "Accion sugerida" },
    "Message length": { pt: "Tamanho da mensagem", en: "Message length", es: "Longitud del mensaje" },
    "Your Guild": { pt: "Sua Guild", en: "Your Guild", es: "Tu Servidor" },
    "Welcome, @ExampleMember!": { pt: "Bem-vindo(a), @ExampleMember!", en: "Welcome, @ExampleMember!", es: "Bienvenido(a), @ExampleMember!" },
    "See you, @ExampleMember.": { pt: "Ate logo, @ExampleMember.", en: "See you, @ExampleMember.", es: "Hasta luego, @ExampleMember." },
    "Enjoy your stay in **Your Guild**.": { pt: "Aproveite sua estadia em **Sua Guild**.", en: "Enjoy your stay in **Your Guild**.", es: "Disfruta tu estancia en **Tu Servidor**." },
    "@ExampleMember left **Your Guild**.": { pt: "@ExampleMember saiu de **Sua Guild**.", en: "@ExampleMember left **Your Guild**.", es: "@ExampleMember salio de **Tu Servidor**." },
    "Welcome, {member}!": { pt: "Bem-vindo(a), {member}!", en: "Welcome, {member}!", es: "Bienvenido(a), {member}!" },
    "See you, {member}.": { pt: "Ate logo, {member}.", en: "See you, {member}.", es: "Hasta luego, {member}." },
    "Enjoy your stay in **{guild}**.": { pt: "Aproveite sua estadia em **{guild}**.", en: "Enjoy your stay in **{guild}**.", es: "Disfruta tu estancia en **{guild}**." },
    "{member} left **{guild}**.": { pt: "{member} saiu de **{guild}**.", en: "{member} left **{guild}**.", es: "{member} salio de **{guild}**." },
    "this guild": { pt: "esta guild", en: "this guild", es: "este servidor" },
    "Saved": { pt: "Salvo", en: "Saved", es: "Guardado" },
    "Configuration updated successfully": { pt: "Configuracao atualizada com sucesso", en: "Configuration updated successfully", es: "Configuracion actualizada correctamente" },
    "{guild} now has {modules} enabled modules and {logs} active log streams.": { pt: "{guild} agora possui {modules} modulos ativos e {logs} fluxos de logs ativos.", en: "{guild} now has {modules} enabled modules and {logs} active log streams.", es: "{guild} ahora tiene {modules} modulos habilitados y {logs} flujos de logs activos." },
    "Last sync at {time}.": { pt: "Ultima sincronizacao as {time}.", en: "Last sync at {time}.", es: "Ultima sincronizacion a las {time}." },
    "No setting changed (values already matched).": { pt: "Nenhuma configuracao alterada (valores ja coincidiam).", en: "No setting changed (values already matched).", es: "Ninguna configuracion cambio (los valores ya coincidian)." },
    "Select a role": { pt: "Selecione um cargo", en: "Select a role", es: "Selecciona un rol" },
    "No alert roles selected.": { pt: "Nenhum cargo de alerta selecionado.", en: "No alert roles selected.", es: "No hay roles de alerta seleccionados." },
    "No custom immune roles selected.": { pt: "Nenhum cargo imune personalizado selecionado.", en: "No custom immune roles selected.", es: "No hay roles inmunes personalizados seleccionados." },
    "AutoMod immunity list is empty. Admin and moderation permissions remain immune by default.": { pt: "A lista de imunidade do AutoMod esta vazia. Administradores e permissoes de moderacao permanecem imunes por padrao.", en: "AutoMod immunity list is empty. Admin and moderation permissions remain immune by default.", es: "La lista de inmunidad de AutoMod esta vacia. Administradores y permisos de moderacion siguen inmunes por defecto." },
    "{count} immune role(s): {roles}": { pt: "{count} cargo(s) imune(s): {roles}", en: "{count} immune role(s): {roles}", es: "{count} rol(es) inmune(s): {roles}" },
    "Choose a default log channel": { pt: "Escolha um canal de log padrao", en: "Choose a default log channel", es: "Elige un canal de log predeterminado" },
    "Choose an audit channel": { pt: "Escolha um canal de auditoria", en: "Choose an audit channel", es: "Elige un canal de auditoria" },
    "Choose a ban log channel": { pt: "Escolha um canal de logs de ban", en: "Choose a ban log channel", es: "Elige un canal de logs de ban" },
    "Choose a modmail category": { pt: "Escolha uma categoria de modmail", en: "Choose a modmail category", es: "Elige una categoria de modmail" },
    "Choose welcome channel": { pt: "Escolha um canal de boas-vindas", en: "Choose welcome channel", es: "Elige un canal de bienvenida" },
    "Choose leave channel": { pt: "Escolha um canal de saida", en: "Choose leave channel", es: "Elige un canal de salida" },
    "Module controls for this guild.": { pt: "Controles do modulo para esta guild.", en: "Module controls for this guild.", es: "Controles del modulo para este servidor." },
    "Language": { pt: "Idioma", en: "Language", es: "Idioma" },
    "AutoMod invite filter": { pt: "Filtro de convite do AutoMod", en: "AutoMod invite filter", es: "Filtro de invitacion de AutoMod" },
    "AutoMod link filter": { pt: "Filtro de link do AutoMod", en: "AutoMod link filter", es: "Filtro de enlaces de AutoMod" },
    "AutoMod caps filter": { pt: "Filtro de caps do AutoMod", en: "AutoMod caps filter", es: "Filtro de mayusculas de AutoMod" },
    "Warn ladder": { pt: "Escada de warns", en: "Warn ladder", es: "Escalera de warns" },
    "Modmail enabled": { pt: "Modmail ativado", en: "Modmail enabled", es: "Modmail activado" },
    "Welcome embed enabled": { pt: "Embed de boas-vindas ativada", en: "Welcome embed enabled", es: "Embed de bienvenida activada" },
    "Leave embed enabled": { pt: "Embed de saida ativada", en: "Leave embed enabled", es: "Embed de salida activada" },
    "Snapshot": { pt: "Snapshot", en: "Snapshot", es: "Snapshot" },
    "User": { pt: "Usuario", en: "User", es: "Usuario" },
    "Locked module: only bot developer can disable this cog.": { pt: "Modulo bloqueado: apenas o desenvolvedor do bot pode desativar este cog.", en: "Locked module: only bot developer can disable this cog.", es: "Modulo bloqueado: solo el desarrollador del bot puede desactivar este cog." },
    "Administrative commands and permission-gated controls.": { pt: "Comandos administrativos e controles com permissao.", en: "Administrative commands and permission-gated controls.", es: "Comandos administrativos y controles con permisos." },
    "Assistant commands and AI-powered responses.": { pt: "Comandos de assistente e respostas com IA.", en: "Assistant commands and AI-powered responses.", es: "Comandos de asistente y respuestas con IA." },
    "Server event listeners and automated reactions.": { pt: "Listeners de eventos do servidor e reacoes automaticas.", en: "Server event listeners and automated reactions.", es: "Listeners de eventos del servidor y reacciones automaticas." },
    "Help menus and usage guidance for members.": { pt: "Menus de ajuda e orientacao de uso para membros.", en: "Help menus and usage guidance for members.", es: "Menus de ayuda y guias de uso para miembros." },
    "XP, rank progression and engagement rewards.": { pt: "XP, progressao de rank e recompensas de engajamento.", en: "XP, rank progression and engagement rewards.", es: "XP, progresion de rango y recompensas de participacion." },
    "Modmail conversations and staff inbox workflows.": { pt: "Conversas de modmail e fluxos de inbox da staff.", en: "Modmail conversations and staff inbox workflows.", es: "Conversaciones de modmail y flujos de inbox del staff." },
    "Fun content commands and entertainment features.": { pt: "Comandos de conteudo divertido e recursos de entretenimento.", en: "Fun content commands and entertainment features.", es: "Comandos de contenido divertido y funciones de entretenimiento." },
    "Moderation actions, warns, bans and staff tooling.": { pt: "Acoes de moderacao, warns, bans e ferramentas da staff.", en: "Moderation actions, warns, bans and staff tooling.", es: "Acciones de moderacion, warns, bans y herramientas del staff." },
    "Standalone utility commands that are not inside command groups.": { pt: "Comandos utilitarios independentes que nao ficam dentro de grupos de comandos.", en: "Standalone utility commands that are not inside command groups.", es: "Comandos utilitarios independientes que no estan dentro de grupos de comandos." },
    "Self-role and reaction-based role assignment panels.": { pt: "Paineis de auto-cargo e atribuicao por reacao.", en: "Self-role and reaction-based role assignment panels.", es: "Paneles de auto-rol y asignacion por reaccion." },
    "Initial configuration commands and guided setup tools.": { pt: "Comandos de configuracao inicial e ferramentas guiadas de setup.", en: "Initial configuration commands and guided setup tools.", es: "Comandos de configuracion inicial y herramientas guiadas." },
    "Guild metrics, counters and visibility widgets.": { pt: "Metricas da guild, contadores e widgets de visibilidade.", en: "Guild metrics, counters and visibility widgets.", es: "Metricas del servidor, contadores y widgets de visibilidad." },
    "Ticket flows, support panels and close actions.": { pt: "Fluxos de ticket, paineis de suporte e acoes de fechamento.", en: "Ticket flows, support panels and close actions.", es: "Flujos de ticket, paneles de soporte y acciones de cierre." },
    "Leveling System": { pt: "Sistema de Levels", en: "Leveling System", es: "Sistema de Niveles" },
    "Configure XP gains and view the server leaderboard.": { pt: "Configure o ganho de XP e veja o leaderboard do servidor.", en: "Configure XP gains and view the server leaderboard.", es: "Configura las ganancias de XP y ve el leaderboard del servidor." },
    "Control leveling behaviour for this server.": { pt: "Controle o comportamento de nivelamento neste servidor.", en: "Control leveling behaviour for this server.", es: "Controla el comportamiento del sistema de niveles en este servidor." },
    "Leveling Enabled": { pt: "Levels Ativado", en: "Leveling Enabled", es: "Nivelacion Activada" },
    "XP Multiplier": { pt: "Multiplicador de XP", en: "XP Multiplier", es: "Multiplicador de XP" },
    "XP Cooldown (seconds)": { pt: "Cooldown de XP (segundos)", en: "XP Cooldown (seconds)", es: "Cooldown de XP (segundos)" },
    "Level-up message": { pt: "Mensagem de level up", en: "Level-up message", es: "Mensaje de subida de nivel" },
    "Save Leveling": { pt: "Salvar Levels", en: "Save Leveling", es: "Guardar Nivelacion" },
    "Leaderboard": { pt: "Leaderboard", en: "Leaderboard", es: "Clasificacion" },
    "Top 15 members by XP in this server.": { pt: "Top 15 membros por XP neste servidor.", en: "Top 15 members by XP in this server.", es: "Top 15 miembros por XP en este servidor." },
    "No leaderboard data yet.": { pt: "Nenhum dado no leaderboard ainda.", en: "No leaderboard data yet.", es: "Todavia no hay datos en el leaderboard." },
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
    "Leveling saved": "levels_saved",
    "Failed to save leveling": "levels_save_error",
    "Leaderboard refreshed": "leaderboard_refreshed",
    "Failed to refresh leaderboard": "leaderboard_refresh_error",
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
        levels_saved: "Leveling saved",
        levels_save_error: "Failed to save leveling",
        leaderboard_refreshed: "Leaderboard refreshed",
        leaderboard_refresh_error: "Failed to refresh leaderboard",
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
        levels_saved: "Levels salvo",
        levels_save_error: "Falha ao salvar levels",
        leaderboard_refreshed: "Leaderboard atualizado",
        leaderboard_refresh_error: "Falha ao atualizar leaderboard",
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
        levels_saved: "Nivelacion guardada",
        levels_save_error: "Error al guardar nivelacion",
        leaderboard_refreshed: "Clasificacion actualizada",
        leaderboard_refresh_error: "Error al actualizar clasificacion",
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

function tx(template, values = {}) {
    return Object.entries(values).reduce((output, [key, value]) => output.replaceAll(`{${key}}`, String(value)), String(template || ""));
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
    const navMap = {
        "/dashboard/servers": t("nav_servers", "Servers"),
        "/dashboard/overview": t("nav_overview", "Overview"),
        "/dashboard/moderation": t("nav_moderation", "Moderation"),
        "/dashboard/guild-settings": t("nav_setup", "Bot Setup"),
        "/dashboard/cogs": t("nav_cogs", "Cogs"),
        "/dashboard/levels": t("nav_levels", "Levels"),
        "/dashboard/economy": t("nav_economy", "Economy"),
        "/dashboard/blog": t("nav_blog", "Blog"),
        "/dashboard/config-logs": t("nav_audit", "Audit Center"),
    };
    document.querySelectorAll(".sidebar .nav a").forEach((link) => {
        const href = link.getAttribute("href") || "";
        if (href in navMap && link.childNodes[0]) {
            link.childNodes[0].nodeValue = navMap[href];
        }
    });

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
        if (!node.children.length) {
            const source = node.dataset.i18nSource || node.textContent.trim();
            if (!source) return;
            if (!node.dataset.i18nSource) node.dataset.i18nSource = source;
            const translated = translateStaticText(source);
            if (translated !== source) node.textContent = translated;
            return;
        }

        Array.from(node.childNodes).forEach((child) => {
            if (child.nodeType !== Node.TEXT_NODE) return;
            const currentText = child.textContent || "";
            const trimmed = currentText.trim();
            if (!trimmed) return;
            const source = child._i18nSource || trimmed;
            if (!child._i18nSource) child._i18nSource = source;
            const translated = translateStaticText(source);
            if (translated !== source) {
                child.textContent = currentText.replace(trimmed, translated);
            }
        });
    });

    const placeholders = document.querySelectorAll("input[placeholder], textarea[placeholder]");
    placeholders.forEach((node) => {
        const source = node.dataset.i18nPlaceholder || node.getAttribute("placeholder") || "";
        if (!source) return;
        if (!node.dataset.i18nPlaceholder) node.dataset.i18nPlaceholder = source;
        const translated = translateStaticText(source);
        if (translated !== source) node.setAttribute("placeholder", translated);
    });

    const titleByPage = {
        servers: { pt: "Luma Dashboard - Servidores", en: "Luma Dashboard - Servers", es: "Luma Dashboard - Servidores" },
        overview: { pt: "Luma Dashboard - Visao Geral", en: "Luma Dashboard - Overview", es: "Luma Dashboard - Resumen" },
        moderation: { pt: "Luma Dashboard - Moderacao", en: "Luma Dashboard - Moderation", es: "Luma Dashboard - Moderacion" },
        "guild-settings": { pt: "Luma Dashboard - Configuracao da Guild", en: "Luma Dashboard - Guild Settings", es: "Luma Dashboard - Configuracion del Servidor" },
        "entry-exit": { pt: "Luma Dashboard - Entrada e Saida", en: "Luma Dashboard - Entry & Exit", es: "Luma Dashboard - Entrada y Salida" },
        cogs: { pt: "Luma Dashboard - Cogs", en: "Luma Dashboard - Cogs", es: "Luma Dashboard - Cogs" },
        levels: { pt: "Luma Dashboard - Levels", en: "Luma Dashboard - Levels", es: "Luma Dashboard - Niveles" },
        economy: { pt: "Luma Dashboard - Economia", en: "Luma Dashboard - Economy", es: "Luma Dashboard - Economia" },
        blog: { pt: "Luma Dashboard - Blog", en: "Luma Dashboard - Blog", es: "Luma Dashboard - Blog" },
        "config-logs": { pt: "Luma Dashboard - Central de Auditoria", en: "Luma Dashboard - Audit Center", es: "Luma Dashboard - Centro de Auditoria" },
    };
    if (titleByPage[page]) {
        document.title = titleByPage[page][dashboardLang] || titleByPage[page].en;
    }

    const variablesHelp = Array.from(document.querySelectorAll("p.lead")).find((node) => (node.textContent || "").includes("{member}") && (node.textContent || "").includes("{guild}"));
    if (variablesHelp) {
        variablesHelp.innerHTML = translateStaticText("Available variables sentence");
    }
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
    nongroups: "Standalone utility commands that are not inside command groups.",
    rolepanel: "Self-role and reaction-based role assignment panels.",
    setup: "Initial configuration commands and guided setup tools.",
    stats: "Guild metrics, counters and visibility widgets.",
    ticket: "Ticket flows, support panels and close actions.",
};

function cogDescription(name) {
    const text = COG_DESCRIPTIONS[name] || "Module controls for this guild.";
    return translateStaticText(text);
}

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
    const guildName = state.guild?.guild_name || translateStaticText("this guild");
    const enabledCogs = Object.values(state.cogs || {}).filter(Boolean).length;
    const logStreams = [state.logs?.moderation, state.logs?.ban_events, state.logs?.join_leave, state.logs?.message_delete, state.logs?.modmail_transcripts].filter(Boolean).length;

    banner.hidden = false;
    if (status) status.textContent = translateStaticText("Saved");
    if (title) title.textContent = translateStaticText("Configuration updated successfully");
    if (detail) {
        detail.textContent = tx(translateStaticText("{guild} now has {modules} enabled modules and {logs} active log streams."), {
            guild: guildName,
            modules: enabledCogs,
            logs: logStreams,
        });
    }
    if (meta) {
        meta.textContent = tx(translateStaticText("Last sync at {time}."), {
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
    }
    if (list) {
        list.innerHTML = "";
        const items = changes.length ? changes.slice(0, 8) : [translateStaticText("No setting changed (values already matched).")];
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
    empty.textContent = translateStaticText("Select a role");
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
        hint.textContent = translateStaticText("No alert roles selected.");
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
        hint.textContent = translateStaticText("No custom immune roles selected.");
        list.appendChild(hint);
        if (document.getElementById("auto-immune-hint")) {
            document.getElementById("auto-immune-hint").textContent = translateStaticText("AutoMod immunity list is empty. Admin and moderation permissions remain immune by default.");
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
        hint.textContent = tx(translateStaticText("{count} immune role(s): {roles}"), {
            count: selectedAutoImmuneRoles.length,
            roles: selectedAutoImmuneRoles.join(", "),
        });
    }
}

function applyResourceSelectors(context) {
    setupResources = context.resources || { text_channels: [], categories: [], roles: [] };
    populateSelect(document.getElementById("guild-log"), setupResources.text_channels || [], translateStaticText("Choose a default log channel"));
    populateSelect(document.getElementById("log-audit-channel"), setupResources.text_channels || [], translateStaticText("Choose an audit channel"));
    populateSelect(document.getElementById("log-ban-channel"), setupResources.text_channels || [], translateStaticText("Choose a ban log channel"));
    populateSelect(document.getElementById("modmail-channel"), setupResources.categories || [], translateStaticText("Choose a modmail category"));
    populateSelect(document.getElementById("welcome-channel"), setupResources.text_channels || [], translateStaticText("Choose welcome channel"));
    populateSelect(document.getElementById("leave-channel"), setupResources.text_channels || [], translateStaticText("Choose leave channel"));
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
            <label>${translateStaticText("At")}</label>
            <input type="number" min="1" max="100" value="${step.threshold}">
            <span>${translateStaticText("warns apply")}</span>
            <select>
                <option value="timeout" ${step.action === "timeout" ? "selected" : ""}>${translateStaticText("Timeout")}</option>
                <option value="kick" ${step.action === "kick" ? "selected" : ""}>${translateStaticText("Kick")}</option>
                <option value="ban" ${step.action === "ban" ? "selected" : ""}>${translateStaticText("Ban")}</option>
                <option value="mute" ${step.action === "mute" ? "selected" : ""}>${translateStaticText("Mute")}</option>
            </select>
            <button type="button" class="btn danger warn-flow-remove">${translateStaticText("Remove")}</button>
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
    if (!["guild-settings", "entry-exit"].includes(page) || setupDirtyTrackingBound) return;

    const trackedSelector = page === "entry-exit"
        ? "#welcome-enabled, #welcome-channel, #welcome-title, #welcome-description, #welcome-color, #leave-enabled, #leave-channel, #leave-title, #leave-description, #leave-color"
        : "#guild-language, #guild-log, #auto-enabled, #auto-antiflood, #auto-invite, #auto-link, #auto-caps, #auto-threshold, #auto-role, #auto-immune-role-picker, #warn-public-reason, #warn-dm-user, #warn-step-1-threshold, #warn-step-1-action, #warn-step-2-threshold, #warn-step-2-action, #warn-step-3-threshold, #warn-step-3-action, #log-enabled, #log-moderation, #log-ban-events, #log-join-leave, #log-message-delete, #log-modmail, #log-audit-channel, #log-ban-channel, #modmail-enabled, #modmail-anonymous, #modmail-idle, #modmail-channel, #modmail-role-picker, #modmail-hours, input[data-setup-cog]";

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
        row.innerHTML = `<span>${name}</span><span>${enabled ? t("enabled", "Enabled") : t("disabled", "Disabled")}</span>`;
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
    const summary = document.querySelector("body[data-page='servers'] .section .lead");
    if (summary) {
        summary.innerHTML = tx(translateStaticText("<manageable> configurable servers, <total> servers total."), {
            manageable: `<span id=\"servers-manageable\">${manageableCount}</span>`,
            total: `<span id=\"servers-total\">${totalCount}</span>`,
        });
    }

    const preferredMode = localStorage.getItem("luma_servers_view") || "grid";
    grid.classList.toggle("list-mode", preferredMode === "list");

    const gridButton = document.getElementById("servers-view-grid");
    const listButton = document.getElementById("servers-view-list");
    if (gridButton) gridButton.classList.toggle("active", preferredMode === "grid");
    if (listButton) listButton.classList.toggle("active", preferredMode === "list");

    grid.innerHTML = "";

    if (!guilds.length) {
        const empty = document.createElement("article");
        empty.className = "server-card project-card";
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
        card.className = "server-card project-card";

        const iconMarkup = guild.icon
            ? `<img class="server-icon" src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128" alt="${guild.name}">`
            : `<span class="server-fallback">${(guild.name || "?").slice(0, 1).toUpperCase()}</span>`;

        const role = guild.owner ? t("owner", "Owner") : guild.configurable ? t("administrator", "Administrator") : t("member", "Member");
        const disabledAttr = guild.configurable ? "" : "disabled";
        const buttonLabel = guild.configurable ? t("configure", "Configure") : t("no_access", "No Access");
        const accessTag = guild.configurable ? "Access Ready" : "Limited";
        const onlineText = guild.configurable ? "Setup enabled" : "Read-only access";
        card.innerHTML = `
            <div class="server-head">
                <div class="server-meta">
                    ${iconMarkup}
                    <div class="server-text">
                        <div class="server-name">${guild.name}</div>
                        <div class="server-role">${role}</div>
                    </div>
                </div>
                <span class="server-access ${guild.configurable ? "ready" : "locked"}">${accessTag}</span>
            </div>
            <div class="server-foot">
                <div class="server-status-dot ${guild.configurable ? "up" : "down"}"></div>
                <p>${onlineText}</p>
            </div>
            <button class="btn primary server-configure-btn" data-configure-guild="${guild.id}" ${disabledAttr}>${buttonLabel}</button>
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
    if (refs.welcomeTitle) refs.welcomeTitle.value = entryExit.welcome_title || translateStaticText("Welcome, {member}!");
    if (refs.welcomeDescription) refs.welcomeDescription.value = entryExit.welcome_description || translateStaticText("Enjoy your stay in **{guild}**.");
    if (refs.welcomeColor) refs.welcomeColor.value = entryExit.welcome_color || "#57cc99";

    if (refs.leaveEnabled) refs.leaveEnabled.checked = Boolean(entryExit.leave_enabled);
    if (refs.leaveChannel) {
        ensureOption(refs.leaveChannel, entryExit.leave_channel, entryExit.leave_channel);
        refs.leaveChannel.value = entryExit.leave_channel || "";
    }
    if (refs.leaveTitle) refs.leaveTitle.value = entryExit.leave_title || translateStaticText("See you, {member}.");
    if (refs.leaveDescription) refs.leaveDescription.value = entryExit.leave_description || translateStaticText("{member} left **{guild}**.");
    if (refs.leaveColor) refs.leaveColor.value = entryExit.leave_color || "#ef476f";

    refs.protectionCount.textContent = String(metrics.protection_layers ?? 0);
    refs.logCount.textContent = String(metrics.logs_enabled ?? 0);
    refs.warnActionSummary.textContent = String(safe[0].action || moderation.default_action).toUpperCase();
    if (refs.stagingStatus) {
        refs.stagingStatus.textContent = context.has_staging
            ? translateStaticText("Staging config available for this guild.")
            : translateStaticText("No staging config loaded.");
    }

    updateSetupDirtyState(false);
    refreshSetupChangePreview();

    renderSetupCogs(context);
}

function renderEntryExitPage(context) {
    const entryExit = context.state.entry_exit || {};
    const refs = {
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
    };

    if (!refs.welcomeEnabled || !refs.leaveEnabled) return;

    applyResourceSelectors(context);

    refs.welcomeEnabled.checked = Boolean(entryExit.welcome_enabled);
    ensureOption(refs.welcomeChannel, entryExit.welcome_channel, entryExit.welcome_channel);
    refs.welcomeChannel.value = entryExit.welcome_channel || "";
    refs.welcomeTitle.value = entryExit.welcome_title || translateStaticText("Welcome, {member}!");
    refs.welcomeDescription.value = entryExit.welcome_description || translateStaticText("Enjoy your stay in **{guild}**.");
    refs.welcomeColor.value = entryExit.welcome_color || "#57cc99";

    refs.leaveEnabled.checked = Boolean(entryExit.leave_enabled);
    ensureOption(refs.leaveChannel, entryExit.leave_channel, entryExit.leave_channel);
    refs.leaveChannel.value = entryExit.leave_channel || "";
    refs.leaveTitle.value = entryExit.leave_title || translateStaticText("See you, {member}.");
    refs.leaveDescription.value = entryExit.leave_description || translateStaticText("{member} left **{guild}**.");
    refs.leaveColor.value = entryExit.leave_color || "#ef476f";
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
            <p>${cogDescription(name)}</p>
        `;

        const toggle = tile.querySelector("input[data-setup-cog]");
        if (toggle && locked.has(name) && !isDev) {
            toggle.disabled = true;
            tile.querySelector("p").textContent = translateStaticText("Locked module: only bot developer can disable this cog.");
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
        empty.innerHTML = `<h3>${translateStaticText("No config changes yet")}</h3><p>${translateStaticText("When setup changes are applied, they will appear here.")}</p>`;
        feed.appendChild(empty);
        return;
    }

    logs.forEach((item) => {
        const row = document.createElement("article");
        row.className = "log-item";
        const when = item.created_at ? new Date(item.created_at).toLocaleString() : translateStaticText("Unknown time");
        const action = item.action || "config_update";
        const target = item.user_id ? `${translateStaticText("Target")}: ${item.user_id}` : "";
        const channel = item.channel_id ? `${translateStaticText("Channel")}: ${item.channel_id}` : "";
        row.innerHTML = `
            <h3>[${action}] ${item.reason || translateStaticText("Configuration update")}</h3>
            <p>${translateStaticText("By")}: ${item.moderator_id || translateStaticText("unknown")}</p>
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
        empty.innerHTML = `<h3>${translateStaticText("No recent activity")}</h3><p>${translateStaticText("New moderation and setup events will appear here in real time.")}</p>`;
        feed.appendChild(empty);
        return;
    }

    items.forEach((item) => {
        const row = document.createElement("article");
        row.className = "log-item";
        const when = item.created_at ? new Date(item.created_at).toLocaleTimeString() : "-";
        const label = item.kind || item.action || translateStaticText("event");
        const detail = item.detail || item.reason || translateStaticText("No details");
        row.innerHTML = `
            <h3>${label}</h3>
            <p>${detail}</p>
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

    let tone = translateStaticText("Stable");
    let detail = translateStaticText("Moderation load is calm and under control.");
    if (warns >= 10 || spam >= 12 || banRate >= 30) {
        tone = translateStaticText("High Pressure");
        detail = translateStaticText("Staff attention recommended: elevated moderation pressure detected.");
    } else if (warns >= 5 || spam >= 6 || banRate >= 15) {
        tone = translateStaticText("Watch");
        detail = translateStaticText("Traffic is active with moderate moderation risk.");
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
        empty.innerHTML = `<h3>${translateStaticText("No risk data")}</h3><p>${translateStaticText("No channel-hour risk signals in this period.")}</p>`;
        container.appendChild(empty);
        return;
    }

    const max = Number(heatmap?.max_score || 1);
    rows.forEach((row) => {
        const wrapper = document.createElement("div");
        wrapper.className = "risk-row";

        const label = document.createElement("div");
        label.className = "risk-label";
        label.textContent = row.channel_id === "unknown" ? translateStaticText("Unknown channel") : `#${row.channel_id}`;
        wrapper.appendChild(label);

        const scores = Array.isArray(row.scores) ? row.scores : [];
        for (let hour = 0; hour < 24; hour += 1) {
            const score = Number(scores[hour] || 0);
            const cell = document.createElement("div");
            cell.className = "risk-cell";
            const pct = max > 0 ? score / max : 0;
            const level = score <= 0 ? 0 : Math.min(5, Math.max(1, Math.ceil(pct * 5)));
            if (level > 0) cell.classList.add(`level-${level}`);
            cell.title = `${translateStaticText("Hour")} ${String(hour).padStart(2, "0")}:00 | ${translateStaticText("Score")} ${score}`;
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
        row.innerHTML = `<h3>${translateStaticText(item[0])}</h3><p>${translateStaticText("Current")}: ${String(item[1])}</p><p>${translateStaticText("New")}: ${String(item[2])}</p>`;
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
            <h3>${item.title || translateStaticText("Alert")}</h3>
            <p>${translateStaticText("Severity")}: ${(item.severity || "low").toUpperCase()}</p>
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
    header.innerHTML = `<h3>${translateStaticText("Your role")}: ${currentRole}</h3><p>${translateStaticText("Use admin/owner role to manage dashboard permissions.")}</p>`;
    list.appendChild(header);

    const entries = Array.isArray(data?.entries) ? data.entries : [];
    if (!entries.length) {
        const empty = document.createElement("article");
        empty.className = "log-item";
        empty.innerHTML = `<h3>${translateStaticText("No custom role entries")}</h3><p>${translateStaticText("Default Discord-derived permissions are active.")}</p>`;
        list.appendChild(empty);
        return;
    }

    entries.forEach((entry) => {
        const row = document.createElement("article");
        row.className = "log-item";
        row.innerHTML = `<h3>${translateStaticText("User")} ${entry.user_id}</h3><p>${translateStaticText("Role")}: ${String(entry.role || "viewer").toUpperCase()}</p>`;
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
        empty.innerHTML = `<h3>${translateStaticText("No snapshots yet")}</h3><p>${translateStaticText("Snapshots are created after setup updates and rollbacks.")}</p>`;
        feed.appendChild(empty);
        return;
    }

    snapshots.forEach((snapshot) => {
        const row = document.createElement("article");
        row.className = "log-item";
        const when = snapshot.created_at ? new Date(snapshot.created_at).toLocaleString() : translateStaticText("Unknown time");
        const changes = Array.isArray(snapshot.changes) ? snapshot.changes.slice(0, 4).join(" | ") : translateStaticText("No diff summary");
        row.innerHTML = `
            <h3>${translateStaticText("Snapshot")} #${snapshot.id} (${snapshot.source || "setup"})</h3>
            <p>${translateStaticText("By")}: ${snapshot.created_by || translateStaticText("unknown")}</p>
            <p>${when}</p>
            <p>${changes}</p>
            <div class="actions"><button class="btn danger" data-rollback-snapshot="${snapshot.id}" type="button">${translateStaticText("Rollback")}</button></div>
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
        entry_exit: buildEntryExitPayloadFromForm(),
        cogs,
    };
}

function buildEntryExitPayloadFromForm() {
    const current = dashboardContext?.state?.entry_exit || {};

    const readChecked = (id, fallback = false) => {
        const el = document.getElementById(id);
        return el ? Boolean(el.checked) : Boolean(fallback);
    };

    const readText = (id, fallback = "") => {
        const el = document.getElementById(id);
        if (!el) return String(fallback || "");
        return String(el.value || "").trim();
    };

    return {
        welcome_enabled: readChecked("welcome-enabled", current.welcome_enabled),
        welcome_channel: readText("welcome-channel", current.welcome_channel),
        welcome_title: readText("welcome-title", current.welcome_title || "Bem-vindo(a), {member}!"),
        welcome_description: readText("welcome-description", current.welcome_description || "Aproveite sua estadia em **{guild}**."),
        welcome_color: readText("welcome-color", current.welcome_color || "#57cc99") || "#57cc99",
        leave_enabled: readChecked("leave-enabled", current.leave_enabled),
        leave_channel: readText("leave-channel", current.leave_channel),
        leave_title: readText("leave-title", current.leave_title || "Ate logo, {member}."),
        leave_description: readText("leave-description", current.leave_description || "{member} saiu de **{guild}**."),
        leave_color: readText("leave-color", current.leave_color || "#ef476f") || "#ef476f",
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
    const items = response.events || response.logs || [];
    renderLiveActivity(items);

    const byHour = new Array(24).fill(0);
    items.forEach((item) => {
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
            if (Array.isArray(data.events || data.logs)) {
                renderLiveActivity(data.events || data.logs);
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
            <h3>${simulation.triggered ? translateStaticText("Rule Triggered") : translateStaticText("No Rule Triggered")}</h3>
            <p>${translateStaticText("Suggested action")}: ${simulation.suggested_action || "timeout"}</p>
            <p>${translateStaticText("Message length")}: ${simulation.message_length || 0}</p>
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
    .replace(/\{guild\}/g, guildName || translateStaticText("Your Guild"));
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

    const guildName = dashboardContext?.state?.guild?.guild_name || translateStaticText("Your Guild");
    const title = applyPreviewTokens(titleInput.value.trim(), guildName);
    const description = applyPreviewTokens(descInput.value.trim(), guildName);
    const rawColor = colorInput.value.trim() || (isWelcome ? "#57cc99" : "#ef476f");
    const safeColor = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(rawColor) ? rawColor : (isWelcome ? "#57cc99" : "#ef476f");

    titleEl.textContent = title || (isWelcome ? translateStaticText("Welcome, @ExampleMember!") : translateStaticText("See you, @ExampleMember."));
    descEl.textContent = description || (isWelcome ? translateStaticText("Enjoy your stay in **Your Guild**.") : translateStaticText("@ExampleMember left **Your Guild**."));
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

function renderLeaderboard(rows) {
    const tbody = document.getElementById("lb-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const entries = Array.isArray(rows) ? rows : [];
    if (!entries.length) {
        const empty = document.createElement("tr");
        empty.innerHTML = `<td class="lb-empty" colspan="5">${translateStaticText("No leaderboard data yet.")}</td>`;
        tbody.appendChild(empty);
        return;
    }

    entries.forEach((entry, index) => {
        const rank = index + 1;
        const rankClass = rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : "";
        const xp = Number(entry.xp || 0);
        const level = Number(entry.level || 1);
        const nextLevelXp = Math.pow(level, 2) * 100;
        const prevLevelXp = Math.pow(level - 1, 2) * 100;
        const progress = nextLevelXp > prevLevelXp ? Math.min(100, Math.round(((xp - prevLevelXp) / (nextLevelXp - prevLevelXp)) * 100)) : 0;

        const row = document.createElement("tr");
        row.innerHTML = `
            <td class="lb-rank ${rankClass}">${rank}</td>
            <td class="lb-user"><code>${entry.user_id || "-"}</code></td>
            <td><span class="lb-level">${level}</span></td>
            <td class="lb-xp">${xp.toLocaleString()} <span class="xp-bar-wrap"><span class="xp-bar" style="width:${progress}%"></span></span></td>
            <td class="lb-msgs">${Number(entry.messages_count || 0).toLocaleString()}</td>
        `;
        tbody.appendChild(row);
    });
}

async function loadLevels() {
    try {
        const response = await api("/api/dashboard/levels");
        const enabledEl = document.getElementById("levels-enabled");
        const multiplierEl = document.getElementById("levels-multiplier");
        const cooldownEl = document.getElementById("levels-cooldown");
        const messageEl = document.getElementById("levels-message");

        if (enabledEl) enabledEl.checked = Boolean(response.leveling_enabled);
        if (multiplierEl) multiplierEl.value = String(response.xp_multiplier ?? 1.0);
        if (cooldownEl) cooldownEl.value = String(response.cooldown_seconds ?? 45);
        if (messageEl) messageEl.value = response.level_up_message || "";

        renderLeaderboard(response.leaderboard || []);
    } catch (error) {
        flash("Failed to load dashboard", "error");
    }
}

function formatSecondsToHhMm(seconds) {
    const safe = Math.max(0, Number(seconds || 0));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

function renderEconomyDashboard(overview, shop, stats, season, transactions) {
    const balanceEl = document.getElementById("econ-balance");
    const timerEl = document.getElementById("econ-daily-timer");
    const shopList = document.getElementById("econ-shop-list");
    const inventoryList = document.getElementById("econ-inventory-list");
    const badgesList = document.getElementById("econ-badges-list");
    const statsList = document.getElementById("econ-stats-list");
    const seasonList = document.getElementById("econ-season-list");
    const txList = document.getElementById("econ-transactions-list");
    if (!balanceEl || !timerEl || !shopList || !inventoryList || !badgesList) return;

    balanceEl.textContent = `${Number(overview?.balance || 0).toLocaleString()} Lumicoins`;
    const remaining = Number(overview?.daily_remaining_seconds || 0);
    timerEl.textContent = remaining > 0 ? formatSecondsToHhMm(remaining) : "Available now";

    const items = Array.isArray(shop?.items) ? shop.items : [];
    shopList.innerHTML = "";
    if (!items.length) {
        const empty = document.createElement("article");
        empty.className = "log-item";
        empty.innerHTML = "<h3>No shop items</h3><p>Shop is empty right now.</p>";
        shopList.appendChild(empty);
    } else {
        items.forEach((item) => {
            const row = document.createElement("article");
            row.className = "log-item";
            row.dataset.shopItemKey = item.item_key;
            row.innerHTML = `
                <h3>${item.item_name} <small>(${item.item_key})</small></h3>
                <p>${item.item_description}</p>
                <p><strong>${Number(item.price || 0).toLocaleString()} Lumicoins</strong> • ${item.category || "utility"}</p>
                <div class="actions">
                    <input type="number" min="1" max="50" value="1" class="shop-qty" style="max-width:90px;">
                    <button class="btn primary" data-econ-buy="${item.item_key}" type="button">Buy</button>
                </div>
            `;
            shopList.appendChild(row);
        });
    }

    const inventory = Array.isArray(overview?.inventory) ? overview.inventory : [];
    inventoryList.innerHTML = "";
    if (!inventory.length) {
        const empty = document.createElement("article");
        empty.className = "log-item";
        empty.innerHTML = "<h3>Empty inventory</h3><p>Buy items in the shop to fill your inventory.</p>";
        inventoryList.appendChild(empty);
    } else {
        inventory.forEach((item) => {
            const row = document.createElement("article");
            row.className = "log-item";
            row.innerHTML = `
                <h3>${item.item_name} <small>(${item.item_key})</small></h3>
                <p>Quantity: <strong>${Number(item.quantity || 0)}</strong></p>
                <div class="actions"><button class="btn" data-econ-use="${item.item_key}" type="button">Use item</button></div>
            `;
            inventoryList.appendChild(row);
        });
    }

    const badges = Array.isArray(overview?.badges) ? overview.badges : [];
    const effects = Array.isArray(overview?.active_effects) ? overview.active_effects : [];
    badgesList.innerHTML = "";

    const badgeBlock = document.createElement("article");
    badgeBlock.className = "log-item";
    badgeBlock.innerHTML = `<h3>Badges</h3><p>${badges.length ? badges.map((b) => b.badge_key).join(", ") : "No badges unlocked yet."}</p>`;
    badgesList.appendChild(badgeBlock);

    const effectsText = effects.length
        ? effects.map((e) => `${e.effect_key} (expires ${new Date(e.expires_at).toLocaleString()})`).join(" | ")
        : "No active effects.";
    const effectBlock = document.createElement("article");
    effectBlock.className = "log-item";
    effectBlock.innerHTML = `<h3>Active effects</h3><p>${effectsText}</p>`;
    badgesList.appendChild(effectBlock);

    if (statsList) {
        const s = stats?.stats || {};
        const top = Array.isArray(stats?.top_earners) ? stats.top_earners : [];
        statsList.innerHTML = `
            <article class="log-item"><h3>7d Transactions</h3><p>${Number(s.tx_count_7d || 0).toLocaleString()}</p></article>
            <article class="log-item"><h3>Minted (7d)</h3><p>${Number(s.minted_7d || 0).toLocaleString()}</p></article>
            <article class="log-item"><h3>Spent (7d)</h3><p>${Number(s.spent_7d || 0).toLocaleString()}</p></article>
            <article class="log-item"><h3>Daily Claims (7d)</h3><p>${Number(s.daily_claims_7d || 0).toLocaleString()}</p></article>
            <article class="log-item"><h3>Transfers (7d)</h3><p>${Number(s.transfers_7d || 0).toLocaleString()}</p></article>
            <article class="log-item"><h3>Top Earners</h3><p>${top.map((u) => `${u.user_id}: ${Number(u.net || 0).toLocaleString()}`).join(" | ") || "No data"}</p></article>
        `;
    }

    if (seasonList) {
        const leaderboard = Array.isArray(season?.leaderboard) ? season.leaderboard : [];
        seasonList.innerHTML = "";
        const info = document.createElement("article");
        info.className = "log-item";
        info.innerHTML = `<h3>Season ${season?.season_key || "-"}</h3><p>${season?.starts_at || "-"} -> ${season?.ends_at || "-"}</p>`;
        seasonList.appendChild(info);

        if (!leaderboard.length) {
            const empty = document.createElement("article");
            empty.className = "log-item";
            empty.innerHTML = "<h3>No season ranking yet</h3><p>Transactions will appear here once users move the economy.</p>";
            seasonList.appendChild(empty);
        } else {
            leaderboard.forEach((entry) => {
                const row = document.createElement("article");
                row.className = "log-item";
                row.innerHTML = `<h3>#${entry.rank} • ${entry.user_id}</h3><p>${Number(entry.score || 0).toLocaleString()} pts</p>`;
                seasonList.appendChild(row);
            });
        }
    }

    if (txList) {
        const txs = Array.isArray(transactions?.transactions) ? transactions.transactions : [];
        txList.innerHTML = "";
        if (!txs.length) {
            const empty = document.createElement("article");
            empty.className = "log-item";
            empty.innerHTML = "<h3>No transactions yet</h3><p>Recent economy operations will appear here.</p>";
            txList.appendChild(empty);
        } else {
            txs.slice(0, 30).forEach((tx) => {
                const row = document.createElement("article");
                row.className = "log-item";
                const when = tx.created_at ? new Date(tx.created_at).toLocaleString() : "-";
                row.innerHTML = `<h3>${tx.tx_type} • ${tx.delta > 0 ? "+" : ""}${Number(tx.delta || 0).toLocaleString()}</h3><p>User ${tx.user_id} • Balance ${Number(tx.balance_after || 0).toLocaleString()}</p><p>${when}</p>`;
                txList.appendChild(row);
            });
        }
    }
}

async function loadEconomyDashboard() {
    const [overview, shop, stats, season, transactions] = await Promise.all([
        api("/api/dashboard/economy/overview"),
        api("/api/dashboard/economy/shop"),
        api("/api/dashboard/economy/stats"),
        api("/api/dashboard/economy/season"),
        api("/api/dashboard/economy/transactions?limit=40"),
    ]);
    renderEconomyDashboard(overview, shop, stats, season, transactions);
}

function renderBlogPosts(payload) {
    const myList = document.getElementById("blog-my-posts");
    const publicList = document.getElementById("blog-public-posts");
    if (!myList || !publicList) return;

    const myPosts = Array.isArray(payload?.my_posts) ? payload.my_posts : [];
    const publicPosts = Array.isArray(payload?.public_posts) ? payload.public_posts : [];

    myList.innerHTML = "";
    if (!myPosts.length) {
        myList.innerHTML = '<article class="log-item"><h3>No posts yet</h3><p>Create your first blog post using the form above.</p></article>';
    } else {
        myPosts.forEach((post) => {
            const row = document.createElement("article");
            row.className = "log-item";
            const when = post.created_at ? new Date(post.created_at).toLocaleString() : "-";
            row.innerHTML = `
                <h3>${post.title} <small>${post.is_published ? "Published" : "Draft"}</small></h3>
                <p>/${post.slug}</p>
                <p>${(post.content || "").slice(0, 180)}${(post.content || "").length > 180 ? "..." : ""}</p>
                <p>${when}</p>
            `;
            myList.appendChild(row);
        });
    }

    publicList.innerHTML = "";
    if (!publicPosts.length) {
        publicList.innerHTML = '<article class="log-item"><h3>No public news yet</h3><p>Published posts will appear here.</p></article>';
    } else {
        publicPosts.forEach((post) => {
            const row = document.createElement("article");
            row.className = "log-item";
            const when = post.published_at || post.created_at;
            row.innerHTML = `
                <h3>${post.title}</h3>
                <p>By ${post.author_name || "Luma Team"} • ${when ? new Date(when).toLocaleString() : "-"}</p>
                <p>${(post.content || "").slice(0, 220)}${(post.content || "").length > 220 ? "..." : ""}</p>
            `;
            publicList.appendChild(row);
        });
    }
}

async function loadBlogDashboard() {
    const payload = await api("/api/dashboard/blog/posts?limit=60");
    renderBlogPosts(payload);
}

function renderPage(context) {
    renderCommon(context);
    if (page === "servers") renderServers(context);
    if (page === "overview") renderOverview(context);
    if (page === "moderation") renderModeration(context);
    if (page === "guild-settings") renderGuildSettings(context);
    if (page === "entry-exit") renderEntryExitPage(context);
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
    if (page === "levels") {
        await loadLevels();
    }
    if (page === "economy") {
        await loadEconomyDashboard();
    }
    if (page === "blog") {
        await loadBlogDashboard();
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

    const gridView = document.getElementById("servers-view-grid");
    const listView = document.getElementById("servers-view-list");
    if (gridView && listView && serversGrid) {
        const updateMode = (mode) => {
            localStorage.setItem("luma_servers_view", mode);
            serversGrid.classList.toggle("list-mode", mode === "list");
            gridView.classList.toggle("active", mode === "grid");
            listView.classList.toggle("active", mode === "list");
        };

        gridView.addEventListener("click", () => updateMode("grid"));
        listView.addEventListener("click", () => updateMode("list"));
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
                updateSetupDirtyState(false, translateStaticText("Everything saved for this guild."));
                refreshSetupChangePreview();
                try {
                    const logSync = await api("/api/dashboard/config-logs");
                    updateConfigLogBadge(logSync.unread || 0);
                } catch (error) {
                    // If log fetch fails we still keep setup save as successful.
                }
                flash("Bot setup updated", "success");
            } catch (error) {
                flash(error instanceof Error && error.message ? error.message : "Failed to update bot setup", "error");
            }
        });
    }

    const saveEntryExit = document.getElementById("save-entry-exit");
    if (saveEntryExit) {
        saveEntryExit.addEventListener("click", async () => {
            const payload = buildEntryExitPayloadFromForm();

            try {
                const res = await api("/api/dashboard/entry-exit", {
                    method: "PUT",
                    body: JSON.stringify(payload),
                });
                dashboardContext.state = res.state;
                renderPage(dashboardContext);
                flash("Entry / Exit settings updated", "success");
            } catch (error) {
                flash(error instanceof Error && error.message ? error.message : "Failed to update Entry / Exit settings", "error");
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
                if (status) status.textContent = translateStaticText("Staging config saved from current form.");
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
                if (status) status.textContent = translateStaticText("No staging config loaded.");
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
                if (status) status.textContent = tx(translateStaticText("Preset '{preset}' applied to staging."), { preset: presetName });
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

    const saveLevels = document.getElementById("save-levels");
    if (saveLevels) {
        saveLevels.addEventListener("click", async () => {
            const payload = {
                leveling_enabled: document.getElementById("levels-enabled")?.checked ?? false,
                xp_multiplier: parseFloat(document.getElementById("levels-multiplier")?.value || "1.0"),
                cooldown_seconds: parseInt(document.getElementById("levels-cooldown")?.value || "45", 10),
                level_up_message: document.getElementById("levels-message")?.value?.trim() || "",
            };
            try {
                await api("/api/dashboard/levels", {
                    method: "PUT",
                    body: JSON.stringify(payload),
                });
                flash("Leveling saved", "success");
            } catch (error) {
                flash("Failed to save leveling", "error");
            }
        });
    }

    const refreshLeaderboard = document.getElementById("refresh-leaderboard");
    if (refreshLeaderboard) {
        refreshLeaderboard.addEventListener("click", async () => {
            try {
                await loadLevels();
                flash("Leaderboard refreshed", "success");
            } catch (error) {
                flash("Failed to refresh leaderboard", "error");
            }
        });
    }

    const refreshEconomy = document.getElementById("refresh-economy");
    if (refreshEconomy) {
        refreshEconomy.addEventListener("click", async () => {
            try {
                await loadEconomyDashboard();
                flash("Economy refreshed", "success");
            } catch (error) {
                flash("Failed to refresh economy", "error");
            }
        });
    }

    const claimDaily = document.getElementById("claim-daily");
    if (claimDaily) {
        claimDaily.addEventListener("click", async () => {
            try {
                const res = await api("/api/dashboard/economy/daily", { method: "POST", body: "{}" });
                if (res?.ok) {
                    flash(`Daily claimed: +${res.reward} Lumicoins`, "success");
                } else if (res?.cooldown) {
                    flash(`Daily in cooldown: ${formatSecondsToHhMm(res.remaining_seconds || 0)}`);
                }
                await loadEconomyDashboard();
            } catch (error) {
                flash("Failed to claim daily", "error");
            }
        });
    }

    const economyShopList = document.getElementById("econ-shop-list");
    if (economyShopList) {
        economyShopList.addEventListener("click", async (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            const itemKey = target.dataset.econBuy;
            if (!itemKey) return;

            const parent = target.closest("article");
            const qtyInput = parent ? parent.querySelector(".shop-qty") : null;
            const quantity = Math.max(1, Number(qtyInput?.value || 1));

            try {
                await api("/api/dashboard/economy/buy", {
                    method: "POST",
                    body: JSON.stringify({ item_key: itemKey, quantity }),
                });
                flash("Purchase completed", "success");
                await loadEconomyDashboard();
            } catch (error) {
                flash("Failed to buy item", "error");
            }
        });
    }

    const economyInventoryList = document.getElementById("econ-inventory-list");
    if (economyInventoryList) {
        economyInventoryList.addEventListener("click", async (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            const itemKey = target.dataset.econUse;
            if (!itemKey) return;

            try {
                const res = await api("/api/dashboard/economy/use", {
                    method: "POST",
                    body: JSON.stringify({ item_key: itemKey }),
                });
                flash(res?.message || "Item used", "success");
                await loadEconomyDashboard();
            } catch (error) {
                flash("Failed to use item", "error");
            }
        });
    }

    const blogRefresh = document.getElementById("refresh-blog-posts");
    if (blogRefresh) {
        blogRefresh.addEventListener("click", async () => {
            try {
                await loadBlogDashboard();
                flash("Blog refreshed", "success");
            } catch (error) {
                flash("Failed to refresh blog", "error");
            }
        });
    }

    const blogPublish = document.getElementById("blog-publish-post");
    if (blogPublish) {
        blogPublish.addEventListener("click", async () => {
            const title = document.getElementById("blog-post-title")?.value?.trim() || "";
            const content = document.getElementById("blog-post-content")?.value?.trim() || "";
            const isPublished = document.getElementById("blog-post-published")?.checked ?? true;

            if (title.length < 3 || content.length < 10) {
                flash("Write a title and content before posting", "error");
                return;
            }

            try {
                await api("/api/dashboard/blog/posts", {
                    method: "POST",
                    body: JSON.stringify({
                        title,
                        content,
                        is_published: isPublished,
                    }),
                });
                const titleInput = document.getElementById("blog-post-title");
                const contentInput = document.getElementById("blog-post-content");
                if (titleInput) titleInput.value = "";
                if (contentInput) contentInput.value = "";
                flash("Post published", "success");
                await loadBlogDashboard();
            } catch (error) {
                flash("Failed to publish post", "error");
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
