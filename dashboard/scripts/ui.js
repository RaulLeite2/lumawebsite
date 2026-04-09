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

// -- Init ---------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('mapCanvas');
    renderer = new MapRenderer(canvas);

    loadMap(0, null);
    setupEvents(canvas);
    setupNavigation();
    setupActionButtons();
    setupEntryTransition();
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

function setupEntryTransition() {
    const button = document.getElementById('enterGameButton');
    if (!button) {
        return;
    }
    button.addEventListener('click', () => {
        document.body.classList.add('game-entered');
    });
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
