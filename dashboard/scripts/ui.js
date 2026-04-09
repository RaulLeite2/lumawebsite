// -- State --------------------------------------------------------------------
let currentMapIndex = 0;
let renderer = null;
let playerInterval = null;
let selectedTerritory = null;
let currentUserId = null;
let currentBalance = 0;

// -- Init ---------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('mapCanvas');
    renderer = new MapRenderer(canvas);

    loadMap(0, null);
    setupEvents(canvas);
    setupNavigation();
    setupActionButtons();
    startPlayerSimulation();

    window.addEventListener('resize', onResize);
    onResize();

    await syncTerritoriesFromServer();
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
            slot.color = ownerName ? ownerColor(ownerId, ownerName) : '#2a2a4b';
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
function openPanel(territory) {
    const panel = document.getElementById('infoPanel');

    document.getElementById('panelDot').style.background = territory.color;
    document.getElementById('panelName').textContent = territory.name;

    const ownerEl = document.getElementById('panelOwner');
    ownerEl.textContent = territory.owner ?? '—';
    ownerEl.className = `val${territory.owner ? '' : ' no-owner'}`;

    const defense = Number(territory.defense || 1);
    document.getElementById('panelDefense').textContent = `${'★'.repeat(defense)}${'☆'.repeat(5 - defense)} (${defense}/5)`;
    document.getElementById('panelCoins').textContent = `🪙 ${Number(territory.coins || 0).toLocaleString('pt-BR')}`;

    const isOwner = territory.ownerId && Number(territory.ownerId) === Number(currentUserId);
    const isFree = !territory.ownerId;

    document.getElementById('panelStatus').textContent = isFree ? '🟢 Disponível' : (isOwner ? '🏰 Seu território' : '🔒 Ocupado');
    document.getElementById('panelOwnerAction').textContent = isOwner
        ? `Coleta: ${Number(territory.rewardCoins || 0)} coins`
        : 'Sem coleta';

    const btnAttack = document.getElementById('btnAttack');
    const btnCapture = document.getElementById('btnCapture');
    const btnCollect = document.getElementById('btnCollect');

    btnAttack.style.display = (!isFree && !isOwner) ? 'block' : 'none';
    btnCapture.style.display = isFree ? 'block' : 'none';
    btnCollect.style.display = isOwner ? 'block' : 'none';

    panel.classList.remove('show');
    void panel.offsetWidth;
    panel.classList.add('show');
}

function setupActionButtons() {
    document.getElementById('btnAttack').addEventListener('click', () => runTerritoryAction('attack'));
    document.getElementById('btnCapture').addEventListener('click', () => runTerritoryAction('claim'));
    document.getElementById('btnCollect').addEventListener('click', () => runTerritoryAction('collect'));
    document.getElementById('btnRefresh').addEventListener('click', () => syncTerritoriesFromServer(true));
}

function setButtonsBusy(busy) {
    ['btnAttack', 'btnCapture', 'btnCollect', 'btnRefresh'].forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.disabled = busy;
            btn.style.opacity = busy ? '0.6' : '';
        }
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
            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;
            flash(`Cooldown ativo: aguarde ${minutes}m ${seconds}s para coletar novamente.`, true);
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
        await syncTerritoriesFromServer(false);

        if (selectedTerritory) {
            openPanel(selectedTerritory);
        }
    } catch (error) {
        flash(`Falha na ação: ${error.message}`, true);
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
