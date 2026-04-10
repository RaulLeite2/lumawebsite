// -- State --------------------------------------------------------------------
let currentMapIndex = 0;
let renderer = null;
let playerInterval = null;
let selectedTerritory = null;
let currentUserId = null;
let currentBalance = 0;
let currentLeaderboard = [];
let hudTickInterval = null;
let territoryPresence = {};
let inspectScene = null;
let selectedBiome = 'snow';
let mapAmbientFrame = null;
let uiAudioContext = null;
let territorySignals = [];
let selectedCity = null;
let gatheredInventory = [];
let leaderboardVisible = false;
let seasonPoints = 0;
const seenFactionAlerts = new Set();

const TERRITORY_GLYPHS = ['✦', '◈', '✶', '⬡', '✹', '✷', '◉'];
const GUILD_SIGILS = ['✦', '☽', '✶', '⬢', '✹', '✧'];
const PRIME_TIME_PHASE_META = {
    locked: { label: 'Blindado', shortLabel: 'Fechado', icon: '🕯', actionLabel: 'Fora da janela de guerra' },
    declaration: { label: 'Janela de declaração', shortLabel: 'Declaração', icon: '⚑', actionLabel: 'Declarações abertas' },
    prime: { label: 'Prime Time ativo', shortLabel: 'Prime Time', icon: '🔥', actionLabel: 'Cerco liberado' },
};

const RESOURCE_QUALITY_TABLE = [
    { max: 45, label: 'Comum' },
    { max: 75, label: 'Incomum' },
    { max: 90, label: 'Rara' },
    { max: 98, label: 'Epica' },
    { max: 100, label: 'Lendaria' },
];

const BIOME_PRESETS = {
    snow: {
        label: 'Neve',
        background: '#dce4f6',
        speckleBase: '255,255,255',
        roadA: 'rgba(98, 112, 142, 0.55)',
        roadB: 'rgba(219, 145, 39, 0.68)',
        overlay: 'rgba(217, 136, 152, 0.34)',
        border: 'rgba(177, 32, 40, 0.95)',
        fortOuter: 'rgba(178, 125, 126, 0.42)',
        fortInner: 'rgba(167, 110, 112, 0.55)',
        soil: 'rgba(121, 79, 73, 0.7)',
        crop: '#ad662e',
    },
    forest: {
        label: 'Floresta',
        background: '#cedbc6',
        speckleBase: '211,235,205',
        roadA: 'rgba(86, 102, 75, 0.58)',
        roadB: 'rgba(129, 89, 44, 0.68)',
        overlay: 'rgba(120, 165, 120, 0.28)',
        border: 'rgba(44, 95, 50, 0.95)',
        fortOuter: 'rgba(120, 140, 100, 0.45)',
        fortInner: 'rgba(93, 110, 82, 0.56)',
        soil: 'rgba(94, 78, 51, 0.74)',
        crop: '#9b7f3f',
    },
    desert: {
        label: 'Deserto',
        background: '#efdcb9',
        speckleBase: '245,228,188',
        roadA: 'rgba(158, 126, 77, 0.58)',
        roadB: 'rgba(218, 126, 52, 0.72)',
        overlay: 'rgba(214, 160, 120, 0.3)',
        border: 'rgba(168, 76, 36, 0.95)',
        fortOuter: 'rgba(183, 144, 106, 0.45)',
        fortInner: 'rgba(156, 120, 88, 0.56)',
        soil: 'rgba(136, 96, 54, 0.74)',
        crop: '#cf8c3f',
    },
    volcanic: {
        label: 'Vulcanico',
        background: '#3b3f51',
        speckleBase: '205,205,220',
        roadA: 'rgba(85, 86, 98, 0.72)',
        roadB: 'rgba(225, 92, 48, 0.72)',
        overlay: 'rgba(156, 78, 76, 0.32)',
        border: 'rgba(255, 114, 56, 0.95)',
        fortOuter: 'rgba(130, 87, 88, 0.45)',
        fortInner: 'rgba(108, 72, 73, 0.56)',
        soil: 'rgba(92, 57, 49, 0.8)',
        crop: '#dc7837',
    },
};

// -- Init ---------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('mapCanvas');
    renderer = new MapRenderer(canvas);

    loadMap(0, null);
    startMapAmbientLoop();
    setupEvents(canvas);
    setupNavigation();
    setupActionButtons();
    setupImpactFeedback();
    setupInspectModal();
    startPlayerSimulation();
    startTerritoryHudTick();

    window.addEventListener('resize', onResize);
    onResize();

    await Promise.all([
        syncTerritoriesFromServer(),
        loadLeaderboard(),
    ]);
});

// -- API ----------------------------------------------------------------------
async function apiRequest(path, options = {}) {
    const response = await fetch(path, {
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
        ...options,
    });

    const text = await response.text();
    let body = null;
    try {
        body = text ? JSON.parse(text) : null;
    } catch (_) {
        body = null;
    }

    if (!response.ok) {
        const detail = (body && (body.detail || body.message)) || `HTTP ${response.status}`;
        throw new Error(typeof detail === 'string' ? detail : 'Falha na requisição');
    }

    return body || {};
}

function ownerColor(ownerId, fallbackName) {
    const palette = ['#8e4dff', '#47d7ac', '#ff6d7a', '#4ea0ff', '#f4c430', '#ff8a3d'];
    let seed = 0;
    if (Number.isFinite(ownerId)) {
        seed = Number(ownerId);
    } else if (fallbackName) {
        for (const ch of String(fallbackName)) {
            seed += ch.charCodeAt(0);
        }
    }
    return palette[Math.abs(seed) % palette.length];
}

function territoryGlyph(territory) {
    if (/valoria/i.test(String(territory?.name || ''))) {
        return '✦';
    }
    return TERRITORY_GLYPHS[Math.abs(Number(territory?.id || 0)) % TERRITORY_GLYPHS.length];
}

function territoryDisplayName(territory) {
    const baseName = territory?.displayName || territory?.name || 'Território';
    return `${territoryGlyph(territory)} ${baseName}`;
}

function stylizeGuildName(ownerName) {
    if (!ownerName) {
        return null;
    }

    const normalized = String(ownerName).trim();
    const preset = {
        LumaGuard: '✦ Casa Luma',
        DarkOrder: '☽ Ordem Umbral',
        GuildAlpha: '✶ Vanguarda Alpha',
        GreenPact: '⬢ Pacto Esmeral',
    };
    if (preset[normalized]) {
        return preset[normalized];
    }

    let seed = 0;
    for (const ch of normalized) {
        seed += ch.charCodeAt(0);
    }
    const sigil = GUILD_SIGILS[Math.abs(seed) % GUILD_SIGILS.length];
    return `${sigil} ${normalized}`;
}

function getMapDefByTerritory(territory) {
    return MAPS.find((mapDef) => mapDef.territories.some((slot) => Number(slot.id) === Number(territory?.id)));
}

function formatClockLabel(hour, minute = 0) {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatCountdown(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours > 0) {
        return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    }
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function getPrimeTimeState(mapDef, now = new Date()) {
    const schedule = mapDef?.primeTime || { declareHour: 19, declareMinute: 0, startHour: 20, startMinute: 0, endHour: 22, endMinute: 0 };
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const declareMinutes = schedule.declareHour * 60 + (schedule.declareMinute || 0);
    const startMinutes = schedule.startHour * 60 + (schedule.startMinute || 0);
    const endMinutes = schedule.endHour * 60 + (schedule.endMinute || 0);

    let phase = 'locked';
    let nextBoundaryMinutes = declareMinutes;

    if (currentMinutes >= declareMinutes && currentMinutes < startMinutes) {
        phase = 'declaration';
        nextBoundaryMinutes = startMinutes;
    } else if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
        phase = 'prime';
        nextBoundaryMinutes = endMinutes;
    } else if (currentMinutes >= endMinutes) {
        nextBoundaryMinutes = declareMinutes + 24 * 60;
    }

    const boundary = new Date(now);
    boundary.setHours(0, 0, 0, 0);
    boundary.setMinutes(nextBoundaryMinutes);

    const meta = PRIME_TIME_PHASE_META[phase];
    return {
        phase,
        meta,
        declareLabel: `${formatClockLabel(schedule.declareHour, schedule.declareMinute || 0)} abre declaração`,
        windowLabel: `${formatClockLabel(schedule.startHour, schedule.startMinute || 0)}–${formatClockLabel(schedule.endHour, schedule.endMinute || 0)}`,
        countdownLabel: formatCountdown(boundary.getTime() - now.getTime()),
        isPrime: phase === 'prime',
        isDeclaration: phase === 'declaration',
    };
}

function syncPrimeTimeHud(mapDef = MAPS[currentMapIndex]) {
    const phase = document.getElementById('hudPrimePhase');
    const clock = document.getElementById('hudPrimeClock');
    const badge = document.getElementById('hudPrimeTime');
    if (!phase || !clock || !badge || !mapDef) {
        return;
    }

    const state = getPrimeTimeState(mapDef);
    phase.textContent = `${state.meta.icon} ${state.meta.shortLabel}`;
    clock.textContent = state.isPrime || state.isDeclaration
        ? `${state.meta.actionLabel} • ${state.countdownLabel}`
        : `${state.windowLabel} • ${state.countdownLabel}`;
    badge.classList.toggle('is-prime', state.isPrime);
    badge.classList.toggle('is-declaration', state.isDeclaration);
}

function syncRendererSignals() {
    territorySignals = territorySignals.filter((signal) => (performance.now() - signal.createdAt) < signal.duration);
    if (renderer && typeof renderer.setSignals === 'function') {
        renderer.setSignals(territorySignals);
    }
}

function pushTerritorySignal(territory, type, label) {
    if (!territory) {
        return;
    }
    territorySignals.push({
        territoryId: Number(territory.id),
        type,
        label,
        createdAt: performance.now(),
        duration: 2200,
    });
    syncRendererSignals();
}

function markTerritoryDeclared(territory, declared = true) {
    const key = territory?.dbId || territory?.id;
    if (!key) {
        return;
    }
    territory.attackDeclared = declared;
}

function getActionGate(action, territory) {
    const mapDef = getMapDefByTerritory(territory) || MAPS[currentMapIndex];
    const state = getPrimeTimeState(mapDef);

    if (action === 'attack') {
        if (state.isDeclaration) {
            return { allowed: true, mode: 'declare', state };
        }
        if (state.isPrime) {
            return { allowed: true, mode: 'attack', state };
        }
        return { allowed: false, reason: `Declarações em ${state.declareLabel}.`, state };
    }

    if (action === 'defend' || action === 'claim') {
        if (action === 'defend' && territory?.factionAttackActive) {
            return { allowed: true, mode: 'defend', state };
        }
        if (!state.isPrime) {
            return { allowed: false, reason: `Ação liberada apenas no prime time ${state.windowLabel}.`, state };
        }
        return { allowed: true, mode: action, state };
    }

    return { allowed: true, mode: action, state };
}

function resourceBaseName(icon) {
    const names = {
        '🪵': 'Madeira',
        '🪨': 'Pedra',
        '🌿': 'Fibra',
        '⛏': 'Metal',
        '🐾': 'Couro',
        '🌾': 'Graos',
        '💎': 'Cristal',
        '🦴': 'Osso',
        '🧊': 'Gelo',
        '💠': 'Essencia',
        '🪷': 'Lotus',
        '🐚': 'Concha',
        '🧪': 'Reagente',
    };
    return names[icon] || 'Recurso';
}

function normalizeGatheredInventory(rows) {
    if (!Array.isArray(rows)) {
        return [];
    }
    return rows
        .map((entry) => ({
            key: String(entry?.key || ''),
            icon: String(entry?.icon || '🪨'),
            name: String(entry?.name || 'Recurso'),
            quality: String(entry?.quality || 'Comum'),
            amount: Math.max(0, Number(entry?.amount || 0)),
            value: Math.max(0, Number(entry?.value || 0)),
        }))
        .filter((entry) => entry.key && entry.amount > 0);
}

function updateSeasonPointsHud() {
    const pointsEl = document.getElementById('seasonPoints');
    if (pointsEl) {
        pointsEl.textContent = Number(seasonPoints || 0).toLocaleString('pt-BR');
    }
}

function applyFactionAlerts(alerts) {
    const rows = Array.isArray(alerts) ? alerts : [];
    rows.forEach((alert) => {
        const key = `${alert?.territory_id || '0'}:${alert?.started_at || alert?.event_type || 'active'}`;
        if (seenFactionAlerts.has(key)) {
            return;
        }
        seenFactionAlerts.add(key);
        const territoryName = String(alert?.territory_name || 'Território');
        const factionName = String(alert?.faction_name || 'Facção');
        const remaining = Number(alert?.remaining_seconds || 0);
        flash(`⚠ ${territoryName} sob ataque da ${factionName} (${formatCooldownCompact(remaining)}).`, true);
    });
}

async function claimSeasonPoints() {
    try {
        const payload = await apiRequest('/api/dashboard/territories/season/claim', {
            method: 'POST',
            body: JSON.stringify({ map_id: Number(MAPS[currentMapIndex]?.id || 0) }),
        });
        if (payload.ok === false) {
            flash(payload.message || 'Não foi possível resgatar pontos de temporada.', true);
            return;
        }
        seasonPoints = Number(payload.season_points || seasonPoints);
        updateSeasonPointsHud();
        flash(payload.message || `+${Number(payload.points || 0)} pontos da temporada.`);
    } catch (error) {
        flash(`Falha no resgate de temporada: ${error.message}`, true);
    }
}

function applyWorldConfig(world) {
    const maps = Array.isArray(world?.maps) ? world.maps : [];
    if (!maps.length) {
        return;
    }
    const byId = new Map(maps.map((mapItem) => [Number(mapItem?.id), mapItem]));
    MAPS.forEach((mapDef) => {
        const serverMap = byId.get(Number(mapDef.id));
        if (!serverMap) {
            return;
        }
        const cities = Array.isArray(serverMap.cities) ? serverMap.cities : [];
        mapDef.cities = cities.map((city) => ({
            id: String(city?.id || `city-${mapDef.id}`),
            name: String(city?.name || 'Cidade'),
            gx: Number(city?.gx || 0),
            gy: Number(city?.gy || 0),
            taxRate: Number(city?.tax_rate ?? 0.1),
        }));
    });
}

function rollResourceGather(resource) {
    const roll = 1 + Math.floor(Math.random() * 100);
    const quality = RESOURCE_QUALITY_TABLE.find((entry) => roll <= entry.max)?.label || 'Comum';
    const amount = Math.max(1, Math.ceil(roll / 22));
    const baseName = resourceBaseName(resource.icon);
    const valuePerUnit = {
        Comum: 6,
        Incomum: 12,
        Rara: 22,
        Epica: 38,
        Lendaria: 62,
    }[quality] || 8;

    return {
        key: `${baseName}:${quality}`,
        icon: resource.icon,
        name: baseName,
        quality,
        amount,
        roll,
        value: amount * valuePerUnit,
    };
}

async function gatherFromResource(resource) {
    const mapDef = MAPS[currentMapIndex];
    if (!mapDef) {
        return;
    }

    try {
        const payload = await apiRequest('/api/dashboard/territories/gather', {
            method: 'POST',
            body: JSON.stringify({
                map_id: Number(mapDef.id),
                node_gx: Number(resource?.gx || 0),
                node_gy: Number(resource?.gy || 0),
                node_icon: String(resource?.icon || '🪨'),
            }),
        });

        if (payload.ok === false && payload.cooldown) {
            flash(`Nó em cooldown: ${formatCooldownCompact(Number(payload.remaining_seconds || 0))}.`, true);
            return;
        }
        if (payload.ok === false) {
            flash(payload.message || 'Falha ao coletar recurso.', true);
            return;
        }

        gatheredInventory = normalizeGatheredInventory(payload.inventory);
        const loot = payload.loot || rollResourceGather(resource);
        flash(`🎲 d100:${Number(loot.roll || 0)} • ${Number(loot.amount || 0)}x ${loot.name || resourceBaseName(resource.icon)} ${loot.quality || 'Comum'}`);
        if (selectedTerritory) {
            pushTerritorySignal(selectedTerritory, 'collect', `+${Number(loot.amount || 0)} ${loot.name || resourceBaseName(resource.icon)}`);
        }
        updateHUD(MAPS[currentMapIndex]);
    } catch (error) {
        flash(`Falha na coleta: ${error.message}`, true);
    }
}

async function sellInventoryAtCity(city) {
    if (!gatheredInventory.length) {
        flash(`Mercado de ${city.name}: inventario vazio.`, true);
        return;
    }

    try {
        const payload = await apiRequest('/api/dashboard/territories/sell', {
            method: 'POST',
            body: JSON.stringify({
                map_id: Number(MAPS[currentMapIndex]?.id || 0),
                city_id: String(city.id || ''),
            }),
        });

        if (payload.ok === false) {
            flash(payload.message || 'Falha ao vender inventário.', true);
            return;
        }

        currentBalance = Number(payload.balance || currentBalance);
        gatheredInventory = [];

        const wallet = document.getElementById('walletBalance');
        if (wallet) {
            wallet.textContent = currentBalance.toLocaleString('pt-BR');
        }

        const net = Number(payload.net || 0);
        flash(`🏙 ${city.name}: venda concluida (+${net.toLocaleString('pt-BR')} coins).`);
        updateHUD(MAPS[currentMapIndex]);
    } catch (error) {
        flash(`Falha na venda: ${error.message}`, true);
    }
}

function startMapAmbientLoop() {
    const render = (time) => {
        syncRendererSignals();
        if (renderer) {
            renderer.draw(time);
        }
        mapAmbientFrame = requestAnimationFrame(render);
    };

    if (mapAmbientFrame) {
        cancelAnimationFrame(mapAmbientFrame);
    }
    mapAmbientFrame = requestAnimationFrame(render);
}

function playUiClickTone(intensity = 1) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
        return;
    }

    if (!uiAudioContext) {
        uiAudioContext = new AudioContextClass();
    }

    const now = uiAudioContext.currentTime;
    const osc = uiAudioContext.createOscillator();
    const gain = uiAudioContext.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220 + (intensity * 30), now);
    osc.frequency.exponentialRampToValueAtTime(150 + (intensity * 12), now + 0.08);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.018 * intensity, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    osc.connect(gain);
    gain.connect(uiAudioContext.destination);
    osc.start(now);
    osc.stop(now + 0.1);
}

function setupImpactFeedback() {
    const interactiveSelector = '.btn, .tier-btn, .leaderboard-refresh, .map-dot';

    document.addEventListener('pointerdown', (event) => {
        const control = event.target.closest(interactiveSelector);
        if (!control) {
            return;
        }

        const intensity = control.classList.contains('btn-attack') ? 1.25 : 1;
        playUiClickTone(intensity);
        control.classList.add('is-pressed');
        window.setTimeout(() => control.classList.remove('is-pressed'), 140);
    });
}

function allTerritorySlots() {
    const slots = [];
    for (const mapDef of MAPS) {
        for (const territory of mapDef.territories) {
            slots.push(territory);
        }
    }
    return slots;
}

async function syncTerritoriesFromServer(showSuccessMessage = false) {
    try {
        const payload = await apiRequest('/api/dashboard/territories/list');
        currentUserId = Number(payload.current_user_id || 0);
        currentBalance = Number(payload.balance || 0);
        seasonPoints = Number(payload.season_points || seasonPoints || 0);
        updateSeasonPointsHud();
        applyWorldConfig(payload.world || null);
        gatheredInventory = normalizeGatheredInventory(payload.gathered_inventory);
        applyFactionAlerts(payload.faction_alerts);

        const wallet = document.getElementById('walletBalance');
        if (wallet) {
            wallet.textContent = currentBalance.toLocaleString('pt-BR');
        }

        const slots = allTerritorySlots();
        const rows = Array.isArray(payload.territories) ? payload.territories : [];
        rows.forEach((row, index) => {
            const slot = slots[index];
            if (!slot) {
                return;
            }
            const ownerId = row.owner_id ? Number(row.owner_id) : null;
            const ownerName = row.owner_display || (row.owner_id ? `User ${row.owner_id}` : null);

            slot.dbId = Number(row.id || 0) || null;
            slot.baseName = slot.baseName || slot.name;
            slot.name = String(row.name || slot.baseName);
            slot.ownerId = ownerId;
            slot.owner = ownerName;
            slot.ownerDisplay = row.owner_faction ? ownerName : (ownerName ? stylizeGuildName(ownerName) : null);
            slot.defense = Math.max(1, Math.min(5, Number(row.defense_level || 1)));
            slot.coins = Number(row.luma_coins || 100);
            slot.rewardCoins = Number(row.owner_reward_coins || 25);
            slot.league = String(row.league || 'Abismo');
            slot.factionOwner = row.owner_faction ? String(row.owner_faction) : null;
            slot.factionAttackActive = Boolean(row.faction_attack_active);
            slot.factionName = row.faction_name ? String(row.faction_name) : null;
            slot.factionAttackRemaining = Number(row.faction_attack_remaining_seconds || 0);
            slot.attackCooldownRemaining = Number(row.attack_cooldown_remaining_seconds || 0);
            slot.attackCooldownTotal = Number(row.attack_cooldown_total_seconds || 900);
            slot.color = ownerName ? ownerColor(ownerId, ownerName) : '#2a2a4b';
            slot.relation = ownerName
                ? (ownerId && Number(ownerId) === Number(currentUserId) ? 'mine' : 'enemy')
                : 'neutral';

            if (!territoryPresence[slot.dbId || slot.id]) {
                const base = ownerName ? (6 + (slot.defense * 2)) : (2 + slot.defense);
                territoryPresence[slot.dbId || slot.id] = Math.max(1, base);
            }
        });

        if (renderer) {
            renderer.draw();
        }

        if (selectedTerritory) {
            openPanel(selectedTerritory);
        }

        if (showSuccessMessage) {
            flash('Mapa de territórios atualizado.');
        }
    } catch (error) {
        flash(`Não foi possível carregar territórios: ${error.message}`, true);
    }
}

async function loadLeaderboard() {
    try {
        const payload = await apiRequest('/api/dashboard/territories/leaderboard');
        currentLeaderboard = Array.isArray(payload.leaderboard) ? payload.leaderboard : [];
        renderLeagueScale(Array.isArray(payload.leagues) ? payload.leagues : [], payload.me || null);
        renderLeaderboard(currentLeaderboard, payload.me || null);
    } catch (error) {
        flash(`Não foi possível carregar o leaderboard: ${error.message}`, true);
    }
}

function renderLeagueScale(leagues, me) {
    const scale = document.getElementById('leagueScale');
    const banner = document.getElementById('myLeagueBanner');
    const meta = document.getElementById('myLeagueMeta');
    if (!scale || !banner || !meta) {
        return;
    }

    const myLeague = me?.league || 'Abismo';
    const myScore = Number(me?.score || 0);
    const myRank = me?.rank ? `#${me.rank}` : 'sem ranking';
    banner.textContent = myLeague;
    meta.textContent = `Score ${myScore.toLocaleString('pt-BR')} • ${myRank} • ${Number(me?.owned_count || 0)} territórios`;

    scale.innerHTML = '';
    leagues.forEach((league) => {
        const item = document.createElement('div');
        item.className = `league-pill${league.name === myLeague ? ' active' : ''}`;
        item.innerHTML = `<span>${league.name}</span><strong>${Number(league.minimum_score || 0).toLocaleString('pt-BR')}+</strong>`;
        scale.appendChild(item);
    });
}

function renderLeaderboard(entries, me) {
    const list = document.getElementById('leaderboardList');
    if (!list) {
        return;
    }
    list.innerHTML = '';

    if (!entries.length) {
        list.innerHTML = '<div class="leaderboard-entry">Ainda não há dominadores suficientes para formar uma ladder.</div>';
        return;
    }

    entries.forEach((entry) => {
        const item = document.createElement('div');
        item.className = `leaderboard-entry${String(entry.user_id) === String(me?.user_id || '') ? ' me' : ''}`;
        item.innerHTML = `
            <div class="leaderboard-entry-head">
                <span>#${entry.rank} ${entry.display_name}</span>
                <span>${entry.league}</span>
            </div>
            <div class="leaderboard-entry-meta">
                <span>${entry.owned_count} territórios • ${entry.total_defense} defesa</span>
                <span>${Number(entry.score || 0).toLocaleString('pt-BR')} pts</span>
            </div>
        `;
        list.appendChild(item);
    });
}

function setLeaderboardVisible(visible) {
    const panel = document.getElementById('leaderboardPanel');
    if (!panel) {
        return;
    }
    leaderboardVisible = Boolean(visible);
    panel.classList.toggle('show', leaderboardVisible);
}

function openLeaderboardPanel() {
    setLeaderboardVisible(true);
}

function closeLeaderboardPanel() {
    setLeaderboardVisible(false);
}

function transitionForExitDirection(exitDir) {
    const dir = String(exitDir || '').toUpperCase();
    if (dir === 'S') return 'up';
    if (dir === 'W') return 'right';
    if (dir === 'N') return 'down';
    if (dir === 'E') return 'left';
    return 'left';
}

function transitionForAtlasNode(node) {
    const dx = Number(node?.gx || 7) - 7;
    const dy = Number(node?.gy || 7) - 7;
    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0 ? 'left' : 'right';
    }
    return dy >= 0 ? 'up' : 'down';
}

// -- Map loading + slide transition -------------------------------------------
function loadMap(index, direction) {
    const mapDef = MAPS[index];
    if (!mapDef) {
        return;
    }

    const container = document.querySelector('.map-viewport');

    if (direction === null) {
        renderer.load(mapDef);
        updateHUD(mapDef);
        updateDots(index);
        currentMapIndex = index;
        return;
    }

    const enterClass = `enter-${direction}`;
    const exitClass = `exit-${direction}`;

    const oldCanvas = document.getElementById('mapCanvas');
    const oldSlide = oldCanvas.closest('.map-slide');

    const newSlide = document.createElement('div');
    newSlide.className = `map-slide ${enterClass}`;
    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'mapCanvas';
    newSlide.appendChild(newCanvas);
    container.appendChild(newSlide);

    const newTooltip = document.createElement('div');
    newTooltip.className = 'tooltip';
    newTooltip.id = 'tooltip';
    newSlide.appendChild(newTooltip);

    const infoPanel = document.getElementById('infoPanel');
    if (infoPanel) {
        infoPanel.classList.remove('show');
    }

    const size = canvasSize();
    newCanvas.width = size.width;
    newCanvas.height = size.height;

    const newRenderer = new MapRenderer(newCanvas);
    newRenderer.load(mapDef);

    requestAnimationFrame(() => {
        oldSlide.classList.remove('active');
        oldSlide.classList.add(exitClass);

        newSlide.classList.remove('enter-left', 'enter-right', 'enter-up', 'enter-down');
        newSlide.classList.add('active');

        setTimeout(() => {
            oldSlide.remove();
            renderer = newRenderer;
            currentMapIndex = index;
            setupEvents(newCanvas);
            updateHUD(mapDef);
            updateDots(index);
            if (selectedTerritory) {
                openPanel(selectedTerritory);
            }
        }, 550);
    });
}

// -- Navigation ----------------------------------------------------------------
function setupNavigation() {
    const dotsEl = document.getElementById('mapDots');
    dotsEl.innerHTML = '';
    MAPS.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.className = `map-dot${i === 0 ? ' active' : ''}`;
        dot.addEventListener('click', () => {
            if (i !== currentMapIndex) {
                const direction = i > currentMapIndex ? 'left' : 'right';
                loadMap(i, direction);
            }
        });
        dotsEl.appendChild(dot);
    });

    const refreshLeaderboardButton = document.getElementById('leaderboardRefresh');
    if (refreshLeaderboardButton) {
        refreshLeaderboardButton.addEventListener('click', () => loadLeaderboard());
    }

    const closeLeaderboardButton = document.getElementById('leaderboardClose');
    if (closeLeaderboardButton) {
        closeLeaderboardButton.addEventListener('click', () => closeLeaderboardPanel());
    }

}

function updateDots(index) {
    document.querySelectorAll('.map-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
    });
}

function updateNavArrows(_index) {}

function transitionViaExit(exit, direction) {
    const activeSlide = document.querySelector('.map-slide.active');
    if (activeSlide) {
        activeSlide.classList.add('portal-transition');
    }
    window.setTimeout(() => {
        loadMap(exit.target, direction);
    }, 210);
}

// -- HUD -----------------------------------------------------------------------
function updateHUD(mapDef) {
    document.querySelector('.zone-name').textContent = mapDef.name;
    document.querySelector('.zone-sub').textContent = `${mapDef.sub} • Prime ${getPrimeTimeState(mapDef).windowLabel} • Bolsa: ${gatheredInventory.length}`;
    document.getElementById('playerCount').textContent = mapDef.playerCount;
    syncPrimeTimeHud(mapDef);

    const resContainer = document.querySelector('.hud-resources');
    resContainer.innerHTML = '';

    mapDef.hudResources.forEach((resource, i) => {
        if (i > 0) {
            const sep = document.createElement('div');
            sep.className = 'res-sep';
            resContainer.appendChild(sep);
        }
        const item = document.createElement('div');
        item.className = 'res-item';
        item.innerHTML = `<span class="res-icon">${resource.icon}</span><span class="res-tier">${resource.quality || resource.tier || 'Qual'}</span>`;
        resContainer.appendChild(item);
    });
}

// -- Canvas events -------------------------------------------------------------
function setupEvents(canvas) {
    const fresh = canvas.cloneNode(false);
    canvas.parentNode.replaceChild(fresh, canvas);
    fresh.id = 'mapCanvas';
    renderer.canvas = fresh;
    renderer.ctx = fresh.getContext('2d');

    const tooltip = fresh.parentElement.querySelector('.tooltip') || document.getElementById('tooltip');

    fresh.addEventListener('mousemove', (event) => {
        const { ox, oy } = offset(event, fresh);
        const territory = renderer.hitTerritory(ox, oy);
        const atlasNode = territory ? null : renderer.hitAtlasNode(ox, oy);
        const city = (territory || atlasNode) ? null : renderer.hitCity(ox, oy);
        const resource = (territory || atlasNode || city) ? null : renderer.hitResource(ox, oy);
        const exit = (territory || atlasNode || city || resource) ? null : renderer.hitExit(ox, oy);

        renderer.setHovered(territory ? territory.id : null);
        fresh.style.cursor = (territory || atlasNode || city || resource || exit) ? 'pointer' : 'default';

        if (territory) {
            const ownerLabel = territory.ownerDisplay || territory.owner || 'Sem dono';
            showTooltip(tooltip, `${territoryDisplayName(territory)} · ${ownerLabel}`, ox, oy);
        } else if (atlasNode) {
            showTooltip(tooltip, `🗺 ${atlasNode.name} · entrar no mapa ${atlasNode.label}`, ox, oy);
        } else if (city) {
            if (city.kind === 'league') {
                showTooltip(tooltip, `🏆 ${city.name} · abrir leaderboard`, ox, oy);
            } else {
                showTooltip(tooltip, `🏙 ${city.name} · taxa ${(Number(city.taxRate || 0.08) * 100).toFixed(0)}%`, ox, oy);
            }
        } else if (resource) {
            showTooltip(tooltip, `${resource.icon} ${resourceBaseName(resource.icon)} · coleta d100`, ox, oy);
        } else if (exit) {
            const destination = exit.target !== null ? MAPS[exit.target]?.name ?? '?' : 'Sem saída';
            showTooltip(tooltip, `Saída ${exit.dir} -> ${destination}`, ox, oy);
        } else {
            hideTooltip(tooltip);
        }
        renderer.draw();
    });

    fresh.addEventListener('click', async (event) => {
        const { ox, oy } = offset(event, fresh);
        const territory = renderer.hitTerritory(ox, oy);
        const atlasNode = territory ? null : renderer.hitAtlasNode(ox, oy);
        const city = (territory || atlasNode) ? null : renderer.hitCity(ox, oy);
        const resource = (territory || atlasNode || city) ? null : renderer.hitResource(ox, oy);
        const exit = (territory || atlasNode || city || resource) ? null : renderer.hitExit(ox, oy);

        if (territory) {
            closeLeaderboardPanel();
            selectedCity = null;
            selectedTerritory = territory;
            renderer.setSelected(territory.id);
            openPanel(territory);
        } else if (atlasNode) {
            closeLeaderboardPanel();
            selectedCity = null;
            selectedTerritory = null;
            renderer.setSelected(null);
            document.getElementById('infoPanel').classList.remove('show');
            loadMap(Number(atlasNode.targetIndex || 0), transitionForAtlasNode(atlasNode));
        } else if (city) {
            if (city.kind === 'league') {
                selectedCity = null;
                openLeaderboardPanel();
                flash('Liga aberta: confira o ranking da guerra.');
            } else {
                selectedCity = city;
                await sellInventoryAtCity(city);
                if (selectedTerritory) {
                    openPanel(selectedTerritory, false);
                }
            }
        } else if (resource) {
            closeLeaderboardPanel();
            await gatherFromResource(resource);
            if (selectedTerritory) {
                openPanel(selectedTerritory, false);
            }
        } else if (exit && exit.target !== null) {
            closeLeaderboardPanel();
            const direction = transitionForExitDirection(exit.dir);
            transitionViaExit(exit, direction);
        } else {
            closeLeaderboardPanel();
            selectedCity = null;
            selectedTerritory = null;
            renderer.setSelected(null);
            document.getElementById('infoPanel').classList.remove('show');
            closeInspectModal();
        }
        renderer.draw();
    });

    fresh.addEventListener('mouseleave', () => {
        renderer.setHovered(null);
        hideTooltip(tooltip);
        renderer.draw();
    });

    const size = canvasSize();
    fresh.width = size.width;
    fresh.height = size.height;
    renderer.draw();
}

function offset(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return { ox: event.clientX - rect.left, oy: event.clientY - rect.top };
}

function showTooltip(el, text, ox, oy) {
    el.textContent = text;
    el.style.left = `${ox + 14}px`;
    el.style.top = `${oy - 10}px`;
    el.classList.add('show');
}

function hideTooltip(el) {
    el.classList.remove('show');
}

// -- Info Panel ----------------------------------------------------------------
function openPanel(territory, withAnimation = true) {
    const panel = document.getElementById('infoPanel');
    const inspectButton = document.getElementById('btnInspect');
    const territoryCard = panel.querySelector('.territory-card');
    const territoryCardTitle = panel.querySelector('.territory-card-title');
    const healthTrack = panel.querySelector('.territory-health-track');
    const healthValue = document.getElementById('panelHealthPercent');

    document.getElementById('panelDot').style.background = territory.color;
    document.getElementById('panelDot').style.boxShadow = `0 0 18px ${territory.color}99`;
    document.getElementById('panelName').textContent = territoryDisplayName(territory);

    const ownerEl = document.getElementById('panelOwner');
    ownerEl.textContent = territory.ownerDisplay || territory.owner || '—';
    ownerEl.className = `val${territory.owner ? '' : ' no-owner'}`;

    const mapDef = getMapDefByTerritory(territory) || MAPS[currentMapIndex];
    const primeState = getPrimeTimeState(mapDef);
    const defense = Number(territory.defense || 1);
    const healthPercent = Math.max(10, Math.min(100, Math.round((defense / 5) * 100)));
    const isOwner = territory.ownerId && Number(territory.ownerId) === Number(currentUserId);
    const isFactionHeld = Boolean(territory.factionOwner);
    const isFree = !territory.ownerId && !isFactionHeld;
    const ownerLeaderboardEntry = currentLeaderboard.find((entry) => Number(entry.user_id) === Number(territory.ownerId));
    const cooldownRemaining = Number(territory.attackCooldownRemaining || 0);
    const presenceCount = Number(territoryPresence[territory.dbId || territory.id] || 0);
    const isCritical = healthPercent <= 35;
    const isExposed = cooldownRemaining <= 0;
    const isFeatured = /valoria/i.test(String(territory.name || ''));

    if (territoryCardTitle) {
        territoryCardTitle.textContent = `${territoryGlyph(territory)} Dossiê Territorial`;
    }

    document.getElementById('panelDefense').textContent = `${'★'.repeat(defense)}${'☆'.repeat(5 - defense)} (${defense}/5)`;
    document.getElementById('panelHealthPercent').textContent = `${healthPercent}% de Saúde`;
    document.getElementById('panelHealthFill').style.width = `${healthPercent}%`;
    document.getElementById('panelCoins').textContent = `🪙 ${Number(territory.coins || 0).toLocaleString('pt-BR')}`;
    document.getElementById('panelStatus').textContent = isFree
        ? '◌ Disponível para tomada'
        : (isOwner ? '◈ Domínio ativo da sua guilda' : (isFactionHeld ? '⚔ Ocupado por facção' : '⬡ Fortaleza hostil'));
    document.getElementById('panelLeague').textContent = ownerLeaderboardEntry?.league || territory.league || 'Abismo';
    document.getElementById('panelAttackTimer').textContent = formatCooldown(cooldownRemaining);
    document.getElementById('panelPrimeTime').textContent = `${primeState.windowLabel}`;
    document.getElementById('panelWarPhase').textContent = territory.factionAttackActive
        ? `⚠ Ataque da ${territory.factionName || 'Facção'} em curso`
        : (territory.attackDeclared
            ? `${primeState.meta.icon} ${primeState.meta.label} • ataque declarado`
            : `${primeState.meta.icon} ${primeState.meta.label}`);
    document.getElementById('panelFactionThreat').textContent = territory.factionAttackActive
        ? `${territory.factionName || 'Facção'} • ${formatCooldown(territory.factionAttackRemaining || 0)}`
        : 'Sem ameaça ativa';
    document.getElementById('panelPresence').textContent = isFeatured
        ? `${presenceCount} players na área • epicentro em ebulição`
        : `${presenceCount} players na área`;
    document.getElementById('panelOwnerAction').textContent = isOwner
        ? (territory.factionAttackActive
            ? `Defesa urgente contra ${territory.factionName || 'Facção'}`
            : `Coleta: ${Number(territory.rewardCoins || 0)} coins`)
        : (territory.attackDeclared ? 'Ataque sinalizado no mapa' : 'Sem coleta');

    const safety = document.getElementById('panelSafety');
    if (cooldownRemaining > 0) {
        safety.innerHTML = '<span class="state-ping state-ping-safe"></span> Seguro';
        safety.classList.remove('territory-state-hot');
        safety.classList.add('territory-state-safe');
    } else {
        safety.innerHTML = '<span class="state-ping state-ping-hot"></span> Exposto';
        safety.classList.remove('territory-state-safe');
        safety.classList.add('territory-state-hot');
    }

    panel.classList.toggle('is-critical', isCritical);
    panel.classList.toggle('is-exposed', isExposed);
    panel.classList.toggle('is-owned', isOwner);
    panel.classList.toggle('is-enemy', !isFree && !isOwner);
    panel.classList.toggle('is-featured', isFeatured);
    territoryCard?.classList.toggle('is-critical', isCritical);
    healthTrack?.classList.toggle('is-critical', isCritical);
    healthValue?.classList.toggle('is-critical', isCritical);

    const btnAttack = document.getElementById('btnAttack');
    const btnCapture = document.getElementById('btnCapture');
    const btnCollect = document.getElementById('btnCollect');
    const btnDefend = document.getElementById('btnDefend');
    const btnUpgrade = document.getElementById('btnUpgrade');
    const btnSellCity = document.getElementById('btnSellCity');
    const upgradeBox = document.getElementById('upgradeTierBox');

    btnAttack.style.display = (!isFree && !isOwner) ? 'block' : 'none';
    btnAttack.disabled = cooldownRemaining > 0 || (primeState.isDeclaration ? territory.attackDeclared : (!primeState.isDeclaration && !primeState.isPrime));
    btnAttack.textContent = cooldownRemaining > 0
        ? `⏳ Ataque em ${formatCooldownCompact(cooldownRemaining)}`
        : (primeState.isDeclaration ? (territory.attackDeclared ? '⚑ Ataque Declarado' : '⚑ Declarar Ataque') : '⚔ Romper Defesas');
    btnCapture.style.display = isFree ? 'block' : 'none';
    btnCapture.disabled = !primeState.isPrime;
    btnCollect.style.display = isOwner ? 'block' : 'none';
    btnDefend.style.display = isOwner ? 'block' : 'none';
    btnDefend.disabled = territory.factionAttackActive ? false : !primeState.isPrime;
    btnUpgrade.style.display = isOwner ? 'block' : 'none';
    if (btnSellCity) {
        btnSellCity.style.display = (selectedCity && selectedCity.kind !== 'league') ? 'block' : 'none';
    }
    if (inspectButton) {
        inspectButton.style.display = 'block';
        inspectButton.disabled = false;
    }
    upgradeBox.classList.remove('show');

    if (withAnimation) {
        panel.classList.remove('show');
        void panel.offsetWidth;
        panel.classList.add('show');
    } else {
        panel.classList.add('show');
    }
}

function setupActionButtons() {
    document.getElementById('btnAttack').addEventListener('click', () => runTerritoryAction('attack'));
    document.getElementById('btnCapture').addEventListener('click', () => runTerritoryAction('claim'));
    document.getElementById('btnCollect').addEventListener('click', () => runTerritoryAction('collect'));
    document.getElementById('btnDefend').addEventListener('click', () => runTerritoryAction('defend'));
    document.getElementById('btnUpgrade').addEventListener('click', () => {
        document.getElementById('upgradeTierBox').classList.toggle('show');
    });
    document.getElementById('btnRefresh').addEventListener('click', async () => {
        await Promise.all([syncTerritoriesFromServer(true), loadLeaderboard()]);
    });
    const seasonClaimButton = document.getElementById('btnSeasonClaim');
    if (seasonClaimButton) {
        seasonClaimButton.addEventListener('click', async () => {
            await claimSeasonPoints();
            await syncTerritoriesFromServer(false);
        });
    }
    const sellButton = document.getElementById('btnSellCity');
    if (sellButton) {
        sellButton.addEventListener('click', async () => {
            if (!selectedCity) {
                flash('Selecione uma cidade no mapa para vender.', true);
                return;
            }
            await sellInventoryAtCity(selectedCity);
            if (selectedTerritory) {
                openPanel(selectedTerritory, false);
            }
        });
    }

    document.querySelectorAll('[data-upgrade-tier]').forEach((button) => {
        button.addEventListener('click', async () => {
            const tier = Number(button.getAttribute('data-upgrade-tier') || 1);
            await runTerritoryUpgrade(tier);
        });
    });
}

function setButtonsBusy(busy) {
    ['btnAttack', 'btnCapture', 'btnCollect', 'btnDefend', 'btnUpgrade', 'btnRefresh', 'btnSellCity', 'btnSeasonClaim'].forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.disabled = busy;
            btn.style.opacity = busy ? '0.6' : '';
        }
    });

    document.querySelectorAll('[data-upgrade-tier]').forEach((button) => {
        button.disabled = busy;
        button.style.opacity = busy ? '0.6' : '';
    });
}

async function runTerritoryAction(action) {
    if (!selectedTerritory) {
        flash('Selecione um território válido no mapa.', true);
        return;
    }

    const gate = getActionGate(action, selectedTerritory);
    if (!gate.allowed) {
        flash(gate.reason || 'Ação indisponível agora.', true);
        return;
    }

    if (gate.mode === 'declare') {
        markTerritoryDeclared(selectedTerritory, true);
        pushTerritorySignal(selectedTerritory, 'declare', 'ATAQUE DECLARADO');
        flash(`Ataque declarado para ${territoryDisplayName(selectedTerritory)}.`);
        openPanel(selectedTerritory, false);
        return;
    }

    if (!selectedTerritory.dbId) {
        if (action === 'attack') {
            selectedTerritory.attackCooldownRemaining = 180;
            markTerritoryDeclared(selectedTerritory, false);
            pushTerritorySignal(selectedTerritory, 'attack', 'CERCO INICIADO');
            flash(`Cerco aberto em ${territoryDisplayName(selectedTerritory)}.`);
        } else if (action === 'defend') {
            selectedTerritory.defense = Math.min(5, Number(selectedTerritory.defense || 1) + 1);
            pushTerritorySignal(selectedTerritory, 'defend', 'DEFESA REFORÇADA');
            flash(`Defesa reforçada em ${territoryDisplayName(selectedTerritory)}.`);
        } else if (action === 'claim') {
            selectedTerritory.ownerId = currentUserId || -1;
            selectedTerritory.owner = 'LumaGuard';
            selectedTerritory.ownerDisplay = stylizeGuildName('LumaGuard');
            selectedTerritory.relation = 'mine';
            selectedTerritory.color = ownerColor(currentUserId || 1, 'LumaGuard');
            pushTerritorySignal(selectedTerritory, 'claim', 'TERRITÓRIO TOMADO');
            flash(`${territoryDisplayName(selectedTerritory)} agora responde à Casa Luma.`);
        } else if (action === 'collect') {
            currentBalance += Number(selectedTerritory.rewardCoins || 25);
            const wallet = document.getElementById('walletBalance');
            if (wallet) {
                wallet.textContent = currentBalance.toLocaleString('pt-BR');
            }
            pushTerritorySignal(selectedTerritory, 'collect', '+ COLETA');
            flash('Coleta local registrada.');
        }
        openPanel(selectedTerritory, false);
        return;
    }

    try {
        setButtonsBusy(true);
        const payload = await apiRequest(`/api/dashboard/territories/${action}`, {
            method: 'POST',
            body: JSON.stringify({ territory_id: Number(selectedTerritory.dbId) }),
        });

        if (payload.ok === false && payload.cooldown) {
            const remaining = Math.max(0, Number(payload.remaining_seconds || 0));
            flash(`Território protegido. Aguarde ${formatCooldownCompact(remaining)} para atacar novamente.`, true);
            return;
        }

        if (payload.ok === false) {
            flash(payload.message || 'Ação não permitida.', true);
            return;
        }

        if (typeof payload.balance === 'number') {
            currentBalance = payload.balance;
            const wallet = document.getElementById('walletBalance');
            if (wallet) {
                wallet.textContent = currentBalance.toLocaleString('pt-BR');
            }
        }

        if (action === 'attack') {
            markTerritoryDeclared(selectedTerritory, false);
            pushTerritorySignal(selectedTerritory, 'attack', 'CERCO ATIVO');
        } else if (action === 'defend') {
            pushTerritorySignal(selectedTerritory, 'defend', 'LINHA SEGURA');
        } else if (action === 'claim') {
            pushTerritorySignal(selectedTerritory, 'claim', 'CONQUISTA');
        } else if (action === 'collect') {
            pushTerritorySignal(selectedTerritory, 'collect', '+ COLETA');
        }

        flash(payload.message || 'Ação executada com sucesso.');
        await Promise.all([syncTerritoriesFromServer(false), loadLeaderboard()]);
        if (selectedTerritory) {
            openPanel(selectedTerritory);
        }
    } catch (error) {
        flash(`Falha na ação: ${error.message}`, true);
    } finally {
        setButtonsBusy(false);
    }
}

async function runTerritoryUpgrade(tier) {
    if (!selectedTerritory || !selectedTerritory.dbId) {
        flash('Selecione um território válido para o upgrade.', true);
        return;
    }

    try {
        setButtonsBusy(true);
        const payload = await apiRequest('/api/dashboard/territories/upgrade', {
            method: 'POST',
            body: JSON.stringify({ territory_id: Number(selectedTerritory.dbId), tier: Number(tier) }),
        });

        if (payload.ok === false) {
            flash(payload.message || 'Upgrade não permitido.', true);
            return;
        }

        if (typeof payload.balance === 'number') {
            currentBalance = payload.balance;
            const wallet = document.getElementById('walletBalance');
            if (wallet) {
                wallet.textContent = currentBalance.toLocaleString('pt-BR');
            }
        }

        document.getElementById('upgradeTierBox').classList.remove('show');
        flash(payload.message || 'Upgrade aplicado com sucesso.');
        await Promise.all([syncTerritoriesFromServer(false), loadLeaderboard()]);
        if (selectedTerritory) {
            openPanel(selectedTerritory);
        }
    } catch (error) {
        flash(`Falha no upgrade: ${error.message}`, true);
    } finally {
        setButtonsBusy(false);
    }
}

// -- Player count simulation ---------------------------------------------------
function startPlayerSimulation() {
    clearInterval(playerInterval);
    playerInterval = setInterval(() => {
        const el = document.getElementById('playerCount');
        if (!el) {
            return;
        }
        const base = MAPS[currentMapIndex].playerCount;
        const n = Math.max(1, Math.round(base + (Math.random() * 10 - 5)));
        el.textContent = n;
    }, 3000);
}

function startTerritoryHudTick() {
    if (hudTickInterval) {
        clearInterval(hudTickInterval);
    }

    hudTickInterval = setInterval(() => {
        const slots = allTerritorySlots();
        slots.forEach((slot) => {
            if (Number(slot.attackCooldownRemaining || 0) > 0) {
                slot.attackCooldownRemaining = Math.max(0, Number(slot.attackCooldownRemaining || 0) - 1);
            }

            const slotMap = getMapDefByTerritory(slot) || MAPS[currentMapIndex];
            const slotPrimeState = getPrimeTimeState(slotMap);
            if (!slotPrimeState.isPrime && !slotPrimeState.isDeclaration && slot.attackDeclared) {
                slot.attackDeclared = false;
            }

            const key = slot.dbId || slot.id;
            const current = Number(territoryPresence[key] || 0);
            const drift = Math.random() < 0.45 ? 1 : -1;
            const minCount = slot.owner ? 2 : 0;
            const maxCount = slot.owner ? 28 : 12;
            territoryPresence[key] = Math.max(minCount, Math.min(maxCount, current + drift));
        });

        syncPrimeTimeHud(MAPS[currentMapIndex]);
        if (selectedTerritory) {
            const mapDef = getMapDefByTerritory(selectedTerritory) || MAPS[currentMapIndex];
            const state = getPrimeTimeState(mapDef);
            if (!state.isPrime && !state.isDeclaration && selectedTerritory.attackDeclared) {
                markTerritoryDeclared(selectedTerritory, false);
            }
            openPanel(selectedTerritory, false);
            if (inspectScene && inspectScene.territoryId === (selectedTerritory.dbId || selectedTerritory.id)) {
                openInspectModal();
            }
        }
    }, 1000);
}

function formatCooldown(seconds) {
    const value = Number(seconds || 0);
    if (value <= 0) {
        return 'Pronto para atacar';
    }
    return formatCooldownCompact(value);
}

function formatCooldownCompact(seconds) {
    const value = Math.max(0, Number(seconds || 0));
    const minutes = Math.floor(value / 60);
    const remainder = value % 60;
    return `${minutes}m ${remainder.toString().padStart(2, '0')}s`;
}

function createSeededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function hashTerritorySeed(territory) {
    const source = `${territory.dbId || territory.id}:${territory.ownerId || 0}:${territory.defense || 1}:${territory.attackCooldownRemaining || 0}`;
    let hash = 2166136261;
    for (const char of source) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function buildInspectUnits(territory) {
    const presence = Number(territoryPresence[territory.dbId || territory.id] || 0);
    const defense = Number(territory.defense || 1);
    const cooldownActive = Number(territory.attackCooldownRemaining || 0) > 0;
    const random = createSeededRandom(hashTerritorySeed(territory));
    const force = 6 + defense * 2 + Math.floor(presence * 0.55);

    return [
        {
            key: 'knight',
            label: 'Cavaleiros',
            amount: Math.max(2, Math.floor(force * 0.34 + random() * 3)),
            color: '#dce5ff',
            accent: '#70a2ff',
            description: 'Linha pesada posicionada na frente da fortaleza.',
        },
        {
            key: 'archer',
            label: 'Arqueiros',
            amount: Math.max(1, Math.floor(force * 0.24 + random() * 4)),
            color: '#ffe0a5',
            accent: '#ffab4c',
            description: 'Cobertura de longo alcance entre torres e muralhas.',
        },
        {
            key: 'guard',
            label: 'Guardioes',
            amount: Math.max(1, Math.floor(force * 0.18 + defense + random() * 2)),
            color: '#c0ffdd',
            accent: '#35c58e',
            description: 'Patrulha interna reagindo a invasoes e brechas.',
        },
        {
            key: 'mage',
            label: 'Arcanistas',
            amount: Math.max(0, Math.floor(defense / 2 + random() * 3 + (cooldownActive ? 1 : 0))),
            color: '#f3ccff',
            accent: '#d56aff',
            description: 'Suporte magico focado em barreiras e sinais.',
        },
    ].filter((unit) => unit.amount > 0);
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

const SPRITE_CACHE = {};

const SPRITE_TEMPLATES_16 = {
    knight: [
        '................',
        '......oooo......',
        '.....oHHHHo.....',
        '.....oHHHHo.....',
        '......oSSo......',
        '.....oAAAAo.....',
        '....oAAAAAAo....',
        '....oAAaaAAo....',
        '....oAAAAAAo....',
        '.....oAAAo......',
        '.....oAAAo......',
        '....oAooooAo....',
        '....oAooooAo....',
        '.....o....o.....',
        '....oo....oo....',
        '................',
    ],
    archer: [
        '................',
        '......oooo......',
        '.....oSSSSo.....',
        '......oSSo......',
        '.....oGGGGo.....',
        '....oGGGGGGo....',
        '....oGGaaGGo....',
        '....oGGGGGGo....',
        '.....oGGGo..b...',
        '.....oGGGo.bb...',
        '.....oGGGo..b...',
        '....ooGGGoo.b...',
        '....o..G..o.....',
        '....o..G..o.....',
        '....oo....oo....',
        '................',
    ],
    guard: [
        '................',
        '......oooo......',
        '.....oSSSSo.....',
        '......oSSo......',
        '.....oCCCCo.....',
        '....oCCCCCCo....',
        '....oCCaaCCo....',
        '....oCCCCCCo....',
        '..s..oCCCCo.....',
        '..ss.oCCCCo.....',
        '..s..oCCCCo.....',
        '....ooCCCCoo....',
        '....o..CC..o....',
        '....o..CC..o....',
        '....oo....oo....',
        '................',
    ],
    mage: [
        '................',
        '......oooo......',
        '.....oSSSSo.....',
        '......oSSo......',
        '.....oMMMMo..r..',
        '....oMMMMMMo.r..',
        '....oMMaaMMo....',
        '....oMMMMMMo....',
        '.....oMMMMo.....',
        '.....oMMMMo.....',
        '.....oMMMMo..t..',
        '....ooMMMMoo.t..',
        '....o..MM..o....',
        '....o..MM..o....',
        '....oo....oo....',
        '................',
    ],
};

function buildSpritePalette(unit) {
    return {
        o: 'rgba(10, 14, 28, 0.95)',
        S: '#ffdcb8',
        A: unit.accent || '#70a2ff',
        a: 'rgba(235, 244, 255, 0.8)',
        H: '#dde7ff',
        G: unit.accent || '#ffab4c',
        C: unit.accent || '#35c58e',
        M: unit.accent || '#d56aff',
        b: '#ffc86f',
        s: '#91f3c8',
        r: '#f3ccff',
        t: '#e8d3ff',
    };
}

function renderAsciiSprite32(unit) {
    const key = `${unit.key}:${unit.accent}`;
    if (SPRITE_CACHE[key]) {
        return SPRITE_CACHE[key];
    }

    const template = SPRITE_TEMPLATES_16[unit.key] || SPRITE_TEMPLATES_16.guard;
    const palette = buildSpritePalette(unit);
    const sprite = document.createElement('canvas');
    sprite.width = 32;
    sprite.height = 32;

    const sctx = sprite.getContext('2d');
    sctx.imageSmoothingEnabled = false;

    for (let y = 0; y < template.length; y += 1) {
        const row = template[y];
        for (let x = 0; x < row.length; x += 1) {
            const token = row[x];
            if (token === '.') {
                continue;
            }
            const color = palette[token];
            if (!color) {
                continue;
            }
            sctx.fillStyle = color;
            sctx.fillRect(x * 2, y * 2, 2, 2);
        }
    }

    SPRITE_CACHE[key] = sprite;
    return sprite;
}

function drawInspectUnit(ctx, unit, x, y, scale) {
    const sprite = renderAsciiSprite32(unit);
    const size = Math.max(20, Math.floor(32 * scale));
    const px = Math.floor(x - size / 2);
    const py = Math.floor(y - size);

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    drawRoundedRect(ctx, px + Math.floor(size * 0.2), py + size - 4, Math.floor(size * 0.6), 4, 2);
    ctx.fill();

    ctx.drawImage(sprite, px, py, size, size);
    ctx.restore();
}

function drawInspectScene(territory, units) {
    const canvas = document.getElementById('territoryInspectCanvas');
    if (!canvas) {
        return;
    }

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const random = createSeededRandom(hashTerritorySeed(territory) ^ 0x9e3779b9);
    const biome = BIOME_PRESETS[selectedBiome] || BIOME_PRESETS.snow;
    ctx.imageSmoothingEnabled = false;

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = biome.background;
    ctx.fillRect(0, 0, width, height);

    for (let index = 0; index < 520; index += 1) {
        const alpha = 0.12 + random() * 0.18;
        ctx.fillStyle = `rgba(${biome.speckleBase},${alpha})`;
        const x = Math.floor(random() * width);
        const y = Math.floor(random() * height);
        const size = random() > 0.86 ? 3 : 2;
        ctx.fillRect(x, y, size, size);
    }

    const drawRoad = (color, thickness, seedOffset) => {
        const r = createSeededRandom(hashTerritorySeed(territory) ^ seedOffset);
        ctx.strokeStyle = color;
        ctx.lineWidth = thickness;
        ctx.lineCap = 'round';
        ctx.beginPath();
        let x = -30;
        let y = height * (0.18 + r() * 0.62);
        ctx.moveTo(x, y);
        while (x < width + 40) {
            x += 44 + r() * 30;
            y += (r() - 0.5) * 62;
            y = Math.max(30, Math.min(height - 30, y));
            ctx.lineTo(x, y);
        }
        ctx.stroke();
    };

    drawRoad(biome.roadA, 8, 0x12b7);
    drawRoad(biome.roadB, 6, 0x8ab1);

    const cx = width * 0.5;
    const cy = height * 0.53;
    const halfW = width * 0.34;
    const halfH = height * 0.3;

    const drawDiamond = () => {
        ctx.beginPath();
        ctx.moveTo(cx, cy - halfH);
        ctx.lineTo(cx + halfW, cy);
        ctx.lineTo(cx, cy + halfH);
        ctx.lineTo(cx - halfW, cy);
        ctx.closePath();
    };

    drawDiamond();
    ctx.fillStyle = biome.overlay;
    ctx.fill();

    drawDiamond();
    ctx.strokeStyle = biome.border;
    ctx.lineWidth = 4;
    ctx.stroke();

    drawDiamond();
    ctx.save();
    ctx.clip();

    const iso = (u, v) => ({
        x: cx + (u - v) * (halfW * 0.5),
        y: cy + (u + v) * (halfH * 0.5),
    });

    const drawIsoPoly = (points, fill, stroke = null, lineWidth = 1) => {
        ctx.beginPath();
        points.forEach((point, index) => {
            const p = iso(point[0], point[1]);
            if (index === 0) {
                ctx.moveTo(p.x, p.y);
            } else {
                ctx.lineTo(p.x, p.y);
            }
        });
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        if (stroke) {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
        }
    };

    drawIsoPoly([
        [0.19, 0.12],
        [0.81, 0.12],
        [0.88, 0.52],
        [0.12, 0.52],
    ], biome.fortOuter);

    drawIsoPoly([
        [0.34, 0.26],
        [0.66, 0.26],
        [0.66, 0.52],
        [0.34, 0.52],
    ], biome.fortInner, 'rgba(112, 78, 82, 0.9)', 2);

    drawIsoPoly([
        [0.05, 0.22],
        [0.25, 0.22],
        [0.3, 0.47],
        [0.04, 0.47],
    ], 'rgba(169, 114, 118, 0.52)');
    drawIsoPoly([
        [0.75, 0.22],
        [0.95, 0.22],
        [0.96, 0.47],
        [0.7, 0.47],
    ], 'rgba(169, 114, 118, 0.52)');

    drawIsoPoly([
        [0.43, 0.38],
        [0.57, 0.38],
        [0.57, 0.52],
        [0.43, 0.52],
    ], 'rgba(191, 137, 138, 0.6)');

    const center = iso(0.5, 0.46);
    ctx.fillStyle = 'rgba(130, 86, 89, 0.56)';
    ctx.beginPath();
    ctx.arc(center.x, center.y, 9, 0, Math.PI * 2);
    ctx.fill();

    drawIsoPoly([
        [0.28, 0.62],
        [0.72, 0.62],
        [0.72, 0.93],
        [0.28, 0.93],
    ], biome.soil, 'rgba(99, 60, 57, 0.85)', 2);

    const rows = 2;
    const cols = 3;
    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const u0 = 0.33 + col * 0.13;
            const v0 = 0.67 + row * 0.12;
            const u1 = u0 + 0.1;
            const v1 = v0 + 0.1;
            drawIsoPoly([
                [u0, v0],
                [u1, v0],
                [u1, v1],
                [u0, v1],
            ], 'rgba(92, 52, 33, 0.85)', 'rgba(150, 108, 70, 0.7)', 1.5);
            const crop = iso((u0 + u1) * 0.5, (v0 + v1) * 0.5);
            ctx.fillStyle = biome.crop;
            ctx.beginPath();
            ctx.arc(crop.x, crop.y - 3, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    const topMark = iso(0.5, 0.09);
    ctx.fillStyle = '#b85b64';
    drawRoundedRect(ctx, topMark.x - 6, topMark.y - 5, 12, 10, 2);
    ctx.fill();

    const presence = Number(territoryPresence[territory.dbId || territory.id] || 0);
    const maxDraw = Math.min(22, 6 + Math.floor(presence * 0.55));
    const perTypeCap = { knight: 8, archer: 8, guard: 10, mage: 6 };
    const drawList = [];
    units.forEach((unit) => {
        const count = Math.min(unit.amount, perTypeCap[unit.key] || 6);
        for (let i = 0; i < count; i += 1) {
            drawList.push(unit);
        }
    });

    const patrolZones = {
        north: { uMin: 0.4, uMax: 0.6, vMin: 0.2, vMax: 0.33 },
        west: { uMin: 0.16, uMax: 0.34, vMin: 0.36, vMax: 0.56 },
        east: { uMin: 0.66, uMax: 0.84, vMin: 0.36, vMax: 0.56 },
        center: { uMin: 0.44, uMax: 0.58, vMin: 0.42, vMax: 0.58 },
        farm: { uMin: 0.34, uMax: 0.68, vMin: 0.72, vMax: 0.9 },
    };

    const zoneByType = {
        guard: ['west', 'east', 'north', 'center'],
        knight: ['center', 'north', 'west', 'east'],
        archer: ['north', 'west', 'east', 'center'],
        mage: ['center', 'farm', 'north'],
    };

    const placedPerZone = { north: 0, west: 0, east: 0, center: 0, farm: 0 };

    for (let index = 0; index < maxDraw && drawList.length; index += 1) {
        const unit = drawList[index % drawList.length];
        const preferences = zoneByType[unit.key] || ['center', 'farm'];
        const zoneName = preferences[index % preferences.length];
        const zone = patrolZones[zoneName];
        placedPerZone[zoneName] += 1;

        const spread = Math.min(0.06, placedPerZone[zoneName] * 0.004);
        const u = zone.uMin + (zone.uMax - zone.uMin) * random() + spread * (random() - 0.5);
        const v = zone.vMin + (zone.vMax - zone.vMin) * random() + spread * (random() - 0.5);
        const pos = iso(u, v);
        const scale = zoneName === 'north' ? 0.72 : (zoneName === 'farm' ? 0.82 : 0.78);
        drawInspectUnit(ctx, unit, pos.x, pos.y + 8, scale);
    }

    const beaconPoints = [iso(0.22, 0.42), iso(0.78, 0.42), iso(0.5, 0.25), iso(0.5, 0.83)];
    beaconPoints.forEach((point, index) => {
        ctx.fillStyle = index === 3 ? '#d48c3e' : '#b2867e';
        drawRoundedRect(ctx, point.x - 4, point.y - 4, 8, 8, 2);
        ctx.fill();
    });

    ctx.restore();

    if (Number(territory.attackCooldownRemaining || 0) > 0) {
        drawDiamond();
        ctx.strokeStyle = 'rgba(255, 209, 111, 0.75)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function openInspectModal() {
    const modal = document.getElementById('territoryInspectModal');
    if (!selectedTerritory || !modal) {
        return;
    }

    const units = buildInspectUnits(selectedTerritory);
    inspectScene = { territoryId: selectedTerritory.dbId || selectedTerritory.id, units };

    const title = document.getElementById('inspectTitle');
    const subtitle = document.getElementById('inspectSubtitle');
    const composition = document.getElementById('inspectComposition');
    const defensePressure = document.getElementById('inspectDefensePressure');
    const presence = document.getElementById('inspectPresence');
    const safety = document.getElementById('inspectSafety');
    const unitList = document.getElementById('inspectUnitList');
    const totalUnits = units.reduce((sum, unit) => sum + unit.amount, 0);
    const presenceCount = Number(territoryPresence[selectedTerritory.dbId || selectedTerritory.id] || 0);

    if (title) {
        title.textContent = selectedTerritory.name;
    }
    if (subtitle) {
        const biomeLabel = BIOME_PRESETS[selectedBiome]?.label || 'Neve';
        subtitle.textContent = `${selectedTerritory.league || 'Abismo'} • ${biomeLabel} • Comandado por ${selectedTerritory.owner || 'Sem dono'}`;
    }
    if (composition) {
        composition.textContent = `${totalUnits} unidades em campo`;
    }
    if (defensePressure) {
        defensePressure.textContent = `Defesa ${selectedTerritory.defense || 1} • ${selectedTerritory.attackCooldownRemaining > 0 ? 'Pressao alta' : 'Pressao controlada'}`;
    }
    if (presence) {
        presence.textContent = `${presenceCount} presencas ativas`;
    }
    if (safety) {
        safety.textContent = selectedTerritory.attackCooldownRemaining > 0
            ? `Protegido por ${formatCooldownCompact(selectedTerritory.attackCooldownRemaining)}`
            : 'Setor pronto para combate';
    }
    if (unitList) {
        unitList.innerHTML = units.map((unit) => `
            <div class="inspect-unit-item">
                <strong>${unit.label} • ${unit.amount}</strong>
                <span>${unit.description}</span>
            </div>
        `).join('');
    }

    modal.hidden = false;
    drawInspectScene(selectedTerritory, units);
}

function closeInspectModal() {
    const modal = document.getElementById('territoryInspectModal');
    if (!modal) {
        return;
    }
    inspectScene = null;
    modal.hidden = true;
}

function setupInspectModal() {
    const button = document.getElementById('btnInspect');
    const closeButton = document.getElementById('inspectClose');
    const modal = document.getElementById('territoryInspectModal');

    if (button) {
        button.addEventListener('click', () => openInspectModal());
    }

    if (closeButton) {
        closeButton.addEventListener('click', () => closeInspectModal());
    }

    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeInspectModal();
            }
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal && !modal.hidden) {
            closeInspectModal();
        }
    });
}

// -- Resize --------------------------------------------------------------------
function canvasSize() {
    const area = document.querySelector('.map-viewport');
    return {
        width: Math.max(720, area ? area.clientWidth : 960),
        height: Math.max(460, area ? area.clientHeight : 640),
    };
}

function onResize() {
    const size = canvasSize();
    const canvas = document.getElementById('mapCanvas');
    if (canvas && renderer) {
        renderer.resize(size.width, size.height);
    }
}

// -- Flash ---------------------------------------------------------------------
let flashTimer = null;
function flash(message, isError = false) {
    const box = document.getElementById('flash');
    if (!box) {
        return;
    }
    box.textContent = message;
    box.style.borderLeftColor = isError ? '#ff6d7a' : '#8e4dff';
    box.classList.add('show');

    if (flashTimer) {
        clearTimeout(flashTimer);
    }
    flashTimer = setTimeout(() => {
        box.classList.remove('show');
    }, 2600);
}
