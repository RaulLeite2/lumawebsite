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
let selectedCharacter = 'Sentinela';
let selectedBiome = 'snow';
let hubPreviewAnimFrame = null;
let worldAnimFrame = null;
let worldRunning = false;

const playerConfig = {
    name: 'Sentinela',
    skin: 'tan',
    hair: 'brown',
    outfit: 'steel',
    banner: 'gold',
};

const CHARACTER_CLASS_COLORS = {
    Sentinela: '#70a2ff',
    'Caçador': '#ffab4c',
    Arcanista: '#d56aff',
};

const SKIN_COLORS = {
    light: '#ffd6b5',
    tan: '#e0ad7d',
    dark: '#8b5a3b',
};

const HAIR_COLORS = {
    black: '#1f1f26',
    brown: '#6f3d23',
    blonde: '#d9b45b',
    white: '#dadbe2',
    red: '#a4452f',
};

const OUTFIT_COLORS = {
    steel: '#7d8aa8',
    forest: '#4f7c53',
    arcane: '#7c56c0',
    desert: '#b6885f',
};

const BANNER_COLORS = {
    gold: '#f4c430',
    blue: '#4ea0ff',
    red: '#e05f66',
    green: '#54c68b',
};

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
    setupEvents(canvas);
    setupNavigation();
    setupActionButtons();
    setupCharacterCreator();
    setupEntryTransition();
    setupInspectModal();
    setupWorldMode();
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
            slot.name = String(row.name || slot.name);
            slot.ownerId = ownerId;
            slot.owner = ownerName;
            slot.defense = Math.max(1, Math.min(5, Number(row.defense_level || 1)));
            slot.coins = Number(row.luma_coins || 100);
            slot.rewardCoins = Number(row.owner_reward_coins || 25);
            slot.league = String(row.league || 'Abismo');
            slot.attackCooldownRemaining = Number(row.attack_cooldown_remaining_seconds || 0);
            slot.attackCooldownTotal = Number(row.attack_cooldown_total_seconds || 900);
            slot.color = ownerName ? ownerColor(ownerId, ownerName) : '#2a2a4b';

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
        updateNavArrows(index);
        currentMapIndex = index;
        return;
    }

    const oldCanvas = document.getElementById('mapCanvas');
    const oldSlide = oldCanvas.closest('.map-slide');

    const newSlide = document.createElement('div');
    newSlide.className = `map-slide ${direction === 'left' ? 'enter-left' : 'enter-right'}`;
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
    newCanvas.width = size;
    newCanvas.height = size;

    const newRenderer = new MapRenderer(newCanvas);
    newRenderer.load(mapDef);

    requestAnimationFrame(() => {
        oldSlide.classList.remove('active');
        oldSlide.classList.add(direction === 'left' ? 'exit-left' : 'exit-right');

        newSlide.classList.remove('enter-left', 'enter-right');
        newSlide.classList.add('active');

        setTimeout(() => {
            oldSlide.remove();
            renderer = newRenderer;
            currentMapIndex = index;
            setupEvents(newCanvas);
            updateHUD(mapDef);
            updateDots(index);
            updateNavArrows(index);
            if (selectedTerritory) {
                openPanel(selectedTerritory);
            }
        }, 550);
    });
}

// -- Navigation ----------------------------------------------------------------
function setupNavigation() {
    document.getElementById('navLeft').addEventListener('click', () => {
        if (currentMapIndex > 0) {
            loadMap(currentMapIndex - 1, 'right');
        }
    });

    document.getElementById('navRight').addEventListener('click', () => {
        if (currentMapIndex < MAPS.length - 1) {
            loadMap(currentMapIndex + 1, 'left');
        }
    });

    const dotsEl = document.getElementById('mapDots');
    dotsEl.innerHTML = '';
    MAPS.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.className = `map-dot${i === 0 ? ' active' : ''}`;
        dot.addEventListener('click', () => {
            if (i !== currentMapIndex) {
                loadMap(i, i > currentMapIndex ? 'left' : 'right');
            }
        });
        dotsEl.appendChild(dot);
    });

    const refreshLeaderboardButton = document.getElementById('leaderboardRefresh');
    if (refreshLeaderboardButton) {
        refreshLeaderboardButton.addEventListener('click', () => loadLeaderboard());
    }

    updateNavArrows(0);
}

function updateDots(index) {
    document.querySelectorAll('.map-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
    });
}

function updateNavArrows(index) {
    document.getElementById('navLeft').classList.toggle('disabled', index === 0);
    document.getElementById('navRight').classList.toggle('disabled', index === MAPS.length - 1);
}

// -- HUD -----------------------------------------------------------------------
function updateHUD(mapDef) {
    document.querySelector('.zone-name').textContent = mapDef.name;
    document.querySelector('.zone-sub').textContent = mapDef.sub;
    document.getElementById('playerCount').textContent = mapDef.playerCount;

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
        item.innerHTML = `<span class="res-icon">${resource.icon}</span><span class="res-tier">${resource.tier}</span>`;
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
        const exit = territory ? null : renderer.hitExit(ox, oy);

        renderer.setHovered(territory ? territory.id : null);
        fresh.style.cursor = (territory || exit) ? 'pointer' : 'default';

        if (territory) {
            showTooltip(tooltip, territory.owner ? `${territory.name} · ${territory.owner}` : `${territory.name} · Sem dono`, ox, oy);
        } else if (exit) {
            const destination = exit.target !== null ? MAPS[exit.target]?.name ?? '?' : 'Sem saída';
            showTooltip(tooltip, `Saída ${exit.dir} -> ${destination}`, ox, oy);
        } else {
            hideTooltip(tooltip);
        }
        renderer.draw();
    });

    fresh.addEventListener('click', (event) => {
        const { ox, oy } = offset(event, fresh);
        const territory = renderer.hitTerritory(ox, oy);
        const exit = territory ? null : renderer.hitExit(ox, oy);

        if (territory) {
            selectedTerritory = territory;
            renderer.setSelected(territory.id);
            openPanel(territory);
        } else if (exit && exit.target !== null) {
            const direction = exit.target > currentMapIndex ? 'left' : 'right';
            loadMap(exit.target, direction);
        } else {
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
    fresh.width = size;
    fresh.height = size;
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

    document.getElementById('panelDot').style.background = territory.color;
    document.getElementById('panelName').textContent = territory.name;

    const ownerEl = document.getElementById('panelOwner');
    ownerEl.textContent = territory.owner ?? '—';
    ownerEl.className = `val${territory.owner ? '' : ' no-owner'}`;

    const defense = Number(territory.defense || 1);
    const healthPercent = Math.max(10, Math.min(100, Math.round((defense / 5) * 100)));
    const isOwner = territory.ownerId && Number(territory.ownerId) === Number(currentUserId);
    const isFree = !territory.ownerId;
    const ownerLeaderboardEntry = currentLeaderboard.find((entry) => Number(entry.user_id) === Number(territory.ownerId));
    const cooldownRemaining = Number(territory.attackCooldownRemaining || 0);
    const presenceCount = Number(territoryPresence[territory.dbId || territory.id] || 0);

    document.getElementById('panelDefense').textContent = `${'★'.repeat(defense)}${'☆'.repeat(5 - defense)} (${defense}/5)`;
    document.getElementById('panelHealthPercent').textContent = `${healthPercent}% de Saúde`;
    document.getElementById('panelHealthFill').style.width = `${healthPercent}%`;
    document.getElementById('panelCoins').textContent = `🪙 ${Number(territory.coins || 0).toLocaleString('pt-BR')}`;
    document.getElementById('panelStatus').textContent = isFree ? '🟢 Disponível' : (isOwner ? '🏰 Seu território' : '🔒 Ocupado');
    document.getElementById('panelLeague').textContent = ownerLeaderboardEntry?.league || territory.league || 'Abismo';
    document.getElementById('panelAttackTimer').textContent = formatCooldown(cooldownRemaining);
    document.getElementById('panelPresence').textContent = `${presenceCount} players na área`;
    document.getElementById('panelOwnerAction').textContent = isOwner
        ? `Coleta: ${Number(territory.rewardCoins || 0)} coins`
        : 'Sem coleta';

    const safety = document.getElementById('panelSafety');
    if (cooldownRemaining > 0) {
        safety.textContent = '🛡 Seguro';
        safety.classList.remove('territory-state-hot');
        safety.classList.add('territory-state-safe');
    } else {
        safety.textContent = '⚠ Exposto';
        safety.classList.remove('territory-state-safe');
        safety.classList.add('territory-state-hot');
    }

    const btnAttack = document.getElementById('btnAttack');
    const btnCapture = document.getElementById('btnCapture');
    const btnCollect = document.getElementById('btnCollect');
    const btnDefend = document.getElementById('btnDefend');
    const btnUpgrade = document.getElementById('btnUpgrade');
    const upgradeBox = document.getElementById('upgradeTierBox');

    btnAttack.style.display = (!isFree && !isOwner) ? 'block' : 'none';
    btnAttack.disabled = cooldownRemaining > 0;
    btnAttack.textContent = cooldownRemaining > 0
        ? `⏳ Ataque em ${formatCooldownCompact(cooldownRemaining)}`
        : '⚔ Atacar Território';
    btnCapture.style.display = isFree ? 'block' : 'none';
    btnCollect.style.display = isOwner ? 'block' : 'none';
    btnDefend.style.display = isOwner ? 'block' : 'none';
    btnUpgrade.style.display = isOwner ? 'block' : 'none';
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

    document.querySelectorAll('[data-upgrade-tier]').forEach((button) => {
        button.addEventListener('click', async () => {
            const tier = Number(button.getAttribute('data-upgrade-tier') || 1);
            await runTerritoryUpgrade(tier);
        });
    });
}

function setupCharacterCreator() {
    const creatorName = document.getElementById('creatorName');
    const creatorSkin = document.getElementById('creatorSkin');
    const creatorHair = document.getElementById('creatorHair');
    const creatorOutfit = document.getElementById('creatorOutfit');
    const creatorBanner = document.getElementById('creatorBanner');
    const summary = document.getElementById('hubVisualSummary');

    const sync = () => {
        playerConfig.name = (creatorName?.value || selectedCharacter || 'Sentinela').trim() || 'Sentinela';
        playerConfig.skin = creatorSkin?.value || 'tan';
        playerConfig.hair = creatorHair?.value || 'brown';
        playerConfig.outfit = creatorOutfit?.value || 'steel';
        playerConfig.banner = creatorBanner?.value || 'gold';
        if (summary) {
            const skinLabel = creatorSkin?.selectedOptions?.[0]?.textContent || 'Morena';
            const hairLabel = creatorHair?.selectedOptions?.[0]?.textContent || 'Castanho';
            const outfitLabel = creatorOutfit?.selectedOptions?.[0]?.textContent || 'Aço';
            summary.textContent = `${skinLabel} • ${hairLabel} • ${outfitLabel}`;
        }
    };

    [creatorName, creatorSkin, creatorHair, creatorOutfit, creatorBanner].forEach((element) => {
        if (!element) {
            return;
        }
        element.addEventListener('input', sync);
        element.addEventListener('change', sync);
    });

    sync();
    startHubPreviewLoop();
}

function drawPlayerPixel(ctx, x, y, scale = 1, className = 'Sentinela') {
    const skin = SKIN_COLORS[playerConfig.skin] || SKIN_COLORS.tan;
    const hair = HAIR_COLORS[playerConfig.hair] || HAIR_COLORS.brown;
    const outfitBase = OUTFIT_COLORS[playerConfig.outfit] || OUTFIT_COLORS.steel;
    const classAccent = CHARACTER_CLASS_COLORS[className] || '#70a2ff';

    const w = Math.floor(22 * scale);
    const h = Math.floor(30 * scale);
    const left = Math.floor(x - w / 2);
    const top = Math.floor(y - h);

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    drawRoundedRect(ctx, left + 4, top + h - 2, w - 8, 4, 2);
    ctx.fill();

    ctx.fillStyle = hair;
    ctx.fillRect(left + 6, top + 1, w - 12, 5);
    ctx.fillStyle = skin;
    ctx.fillRect(left + 6, top + 6, w - 12, 7);

    ctx.fillStyle = classAccent;
    ctx.fillRect(left + 4, top + 13, w - 8, 8);
    ctx.fillStyle = outfitBase;
    ctx.fillRect(left + 5, top + 14, w - 10, 10);

    ctx.fillStyle = skin;
    ctx.fillRect(left + 1, top + 14, 3, 9);
    ctx.fillRect(left + w - 4, top + 14, 3, 9);

    ctx.fillStyle = outfitBase;
    ctx.fillRect(left + 6, top + 24, 5, 6);
    ctx.fillRect(left + w - 11, top + 24, 5, 6);
}

function startHubPreviewLoop() {
    const canvas = document.getElementById('hubPreviewCanvas');
    if (!canvas) {
        return;
    }

    const ctx = canvas.getContext('2d');
    let tick = 0;

    const render = () => {
        tick += 1;
        const biome = BIOME_PRESETS[selectedBiome] || BIOME_PRESETS.snow;
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = biome.background;
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < 280; i += 1) {
            const px = (i * 43 + tick * 0.35) % width;
            const py = (i * 57 + tick * 0.15) % height;
            const alpha = 0.07 + (i % 9) * 0.01;
            ctx.fillStyle = `rgba(${biome.speckleBase}, ${alpha})`;
            ctx.fillRect(px, py, 2, 2);
        }

        const horizon = Math.floor(height * 0.7);
        ctx.fillStyle = 'rgba(22, 28, 49, 0.45)';
        ctx.fillRect(0, horizon, width, height - horizon);

        const bob = Math.sin(tick / 16) * 2;
        drawPlayerPixel(ctx, width * 0.54, horizon - 4 + bob, 1.4, selectedCharacter);

        const bannerColor = BANNER_COLORS[playerConfig.banner] || BANNER_COLORS.gold;
        ctx.fillStyle = '#2f3658';
        ctx.fillRect(width * 0.64, horizon - 54, 5, 54);
        ctx.fillStyle = bannerColor;
        ctx.beginPath();
        ctx.moveTo(width * 0.645, horizon - 54);
        ctx.lineTo(width * 0.71, horizon - 44);
        ctx.lineTo(width * 0.645, horizon - 34);
        ctx.closePath();
        ctx.fill();

        hubPreviewAnimFrame = requestAnimationFrame(render);
    };

    if (hubPreviewAnimFrame) {
        cancelAnimationFrame(hubPreviewAnimFrame);
    }
    render();
}

function setupEntryTransition() {
    const button = document.getElementById('enterGameButton');
    const characterButtons = Array.from(document.querySelectorAll('.hub-character'));
    const biomeButtons = Array.from(document.querySelectorAll('.hub-biome'));
    const selectedCharacterLabel = document.getElementById('hubSelectedCharacter');
    const selectedBiomeLabel = document.getElementById('hubSelectedBiome');

    const syncHubLabels = () => {
        if (selectedCharacterLabel) {
            selectedCharacterLabel.textContent = selectedCharacter;
        }
        if (selectedBiomeLabel) {
            const preset = BIOME_PRESETS[selectedBiome] || BIOME_PRESETS.snow;
            selectedBiomeLabel.textContent = preset.label;
        }
    };

    characterButtons.forEach((item) => {
        item.addEventListener('click', () => {
            selectedCharacter = item.getAttribute('data-character') || 'Sentinela';
            const creatorName = document.getElementById('creatorName');
            if (creatorName && (!creatorName.value || creatorName.value === playerConfig.name)) {
                creatorName.value = selectedCharacter;
            }
            characterButtons.forEach((buttonItem) => buttonItem.classList.remove('active'));
            item.classList.add('active');
            syncHubLabels();
        });
    });

    biomeButtons.forEach((item) => {
        item.addEventListener('click', () => {
            selectedBiome = item.getAttribute('data-biome') || 'snow';
            biomeButtons.forEach((buttonItem) => buttonItem.classList.remove('active'));
            item.classList.add('active');
            syncHubLabels();
        });
    });

    syncHubLabels();

    if (!button) {
        return;
    }

    button.addEventListener('click', () => {
        document.body.classList.add('game-entered');
        playerConfig.name = (document.getElementById('creatorName')?.value || selectedCharacter).trim() || selectedCharacter;
        startWorldMode();
        flash(`Entrando com ${selectedCharacter} no bioma ${BIOME_PRESETS[selectedBiome]?.label || 'Neve'}.`);
    });
}

function setupWorldMode() {
    const closeButton = document.getElementById('worldCloseButton');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            stopWorldMode();
        });
    }
}

function startWorldMode() {
    const overlay = document.getElementById('worldOverlay');
    const canvas = document.getElementById('worldCanvas');
    const labelName = document.getElementById('worldPlayerName');
    const labelBiome = document.getElementById('worldBiomeLabel');
    if (!overlay || !canvas) {
        return;
    }

    if (hubPreviewAnimFrame) {
        cancelAnimationFrame(hubPreviewAnimFrame);
        hubPreviewAnimFrame = null;
    }

    overlay.hidden = false;
    if (labelName) {
        labelName.textContent = playerConfig.name;
    }
    if (labelBiome) {
        labelBiome.textContent = `Bioma: ${BIOME_PRESETS[selectedBiome]?.label || 'Neve'}`;
    }

    const ctx = canvas.getContext('2d');
    const keys = {};
    const player = {
        x: canvas.width * 0.5,
        y: canvas.height * 0.7,
        speed: 2.5,
    };

    const onKeyDown = (event) => {
        keys[event.key.toLowerCase()] = true;
    };
    const onKeyUp = (event) => {
        keys[event.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    let tick = 0;
    worldRunning = true;

    const render = () => {
        if (!worldRunning) {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            return;
        }

        tick += 1;
        const biome = BIOME_PRESETS[selectedBiome] || BIOME_PRESETS.snow;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = biome.background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < 900; i += 1) {
            const px = (i * 17) % canvas.width;
            const py = (i * 47 + tick * 0.2) % canvas.height;
            const alpha = 0.05 + (i % 8) * 0.01;
            ctx.fillStyle = `rgba(${biome.speckleBase}, ${alpha})`;
            ctx.fillRect(px, py, 2, 2);
        }

        ctx.strokeStyle = biome.roadA;
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height * 0.68);
        ctx.bezierCurveTo(canvas.width * 0.2, canvas.height * 0.55, canvas.width * 0.45, canvas.height * 0.74, canvas.width, canvas.height * 0.64);
        ctx.stroke();

        ctx.strokeStyle = biome.roadB;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height * 0.72);
        ctx.bezierCurveTo(canvas.width * 0.25, canvas.height * 0.61, canvas.width * 0.55, canvas.height * 0.79, canvas.width, canvas.height * 0.69);
        ctx.stroke();

        const running = keys.shift;
        const currentSpeed = running ? player.speed * 1.8 : player.speed;
        if (keys.w || keys.arrowup) {
            player.y -= currentSpeed;
        }
        if (keys.s || keys.arrowdown) {
            player.y += currentSpeed;
        }
        if (keys.a || keys.arrowleft) {
            player.x -= currentSpeed;
        }
        if (keys.d || keys.arrowright) {
            player.x += currentSpeed;
        }

        player.x = Math.max(20, Math.min(canvas.width - 20, player.x));
        player.y = Math.max(60, Math.min(canvas.height - 20, player.y));

        drawPlayerPixel(ctx, player.x, player.y, 1.8, selectedCharacter);

        const bannerColor = BANNER_COLORS[playerConfig.banner] || BANNER_COLORS.gold;
        ctx.fillStyle = 'rgba(10, 12, 24, 0.65)';
        drawRoundedRect(ctx, 18, 18, 250, 58, 10);
        ctx.fill();
        ctx.fillStyle = '#f1f4ff';
        ctx.font = '700 18px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(playerConfig.name, 32, 42);
        ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#bfcaf2';
        ctx.fillText(`${selectedCharacter} • ${BIOME_PRESETS[selectedBiome]?.label || 'Neve'}`, 32, 62);
        ctx.fillStyle = bannerColor;
        ctx.fillRect(236, 28, 14, 14);

        worldAnimFrame = requestAnimationFrame(render);
    };

    if (worldAnimFrame) {
        cancelAnimationFrame(worldAnimFrame);
    }
    render();
}

function stopWorldMode() {
    const overlay = document.getElementById('worldOverlay');
    worldRunning = false;
    if (worldAnimFrame) {
        cancelAnimationFrame(worldAnimFrame);
        worldAnimFrame = null;
    }
    if (overlay) {
        overlay.hidden = true;
    }
}

function setButtonsBusy(busy) {
    ['btnAttack', 'btnCapture', 'btnCollect', 'btnDefend', 'btnUpgrade', 'btnRefresh'].forEach((id) => {
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
    if (!selectedTerritory || !selectedTerritory.dbId) {
        flash('Selecione um território válido no mapa.', true);
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

            const key = slot.dbId || slot.id;
            const current = Number(territoryPresence[key] || 0);
            const drift = Math.random() < 0.45 ? 1 : -1;
            const minCount = slot.owner ? 2 : 0;
            const maxCount = slot.owner ? 28 : 12;
            territoryPresence[key] = Math.max(minCount, Math.min(maxCount, current + drift));
        });

        if (selectedTerritory) {
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
        subtitle.textContent = `${selectedTerritory.league || 'Abismo'} • ${biomeLabel} • ${selectedCharacter} • Comandado por ${selectedTerritory.owner || 'Sem dono'}`;
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
        const worldOverlay = document.getElementById('worldOverlay');
        if (event.key === 'Escape' && worldOverlay && !worldOverlay.hidden) {
            stopWorldMode();
            return;
        }
        if (event.key === 'Escape' && modal && !modal.hidden) {
            closeInspectModal();
        }
    });
}

// -- Resize --------------------------------------------------------------------
function canvasSize() {
    const area = document.querySelector('.map-viewport');
    return Math.min(
        area ? area.clientWidth - 40 : 660,
        area ? area.clientHeight - 40 : 660,
        720,
    );
}

function onResize() {
    const size = canvasSize();
    const canvas = document.getElementById('mapCanvas');
    if (canvas && renderer) {
        renderer.resize(size, size);
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
