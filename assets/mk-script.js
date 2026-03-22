(() => {
    const mkWrap = document.getElementById("mk-canvas-wrap");
    const mkCanvas = document.getElementById("mk-canvas");
    const mkConnections = document.getElementById("mk-connections");
    const mkPalette = document.getElementById("mk-palette");
    const mkMinimap = document.getElementById("mk-minimap");
    const mkLogList = document.getElementById("mk-log-list");
    const selectedTitle = document.getElementById("mk-selected-title");
    const selectedSub = document.getElementById("mk-selected-sub");
    const selectedHelp = document.getElementById("mk-selected-help");
    const selectedMeta = document.getElementById("mk-selected-meta");
    const selectedKind = document.getElementById("mk-selected-kind");
    const debugOutput = document.getElementById("mk-debug-output");
    const debugToggle = document.getElementById("mk-debug-enabled");
    const debugLevel = document.getElementById("mk-debug-level");
    const fullSizeBtn = document.getElementById("mk-fullsize-toggle");
    const debugToggleBtn = document.getElementById("mk-debug-toggle");
    const clearLogBtn = document.getElementById("mk-clear-log");
    const triggerSelect = document.getElementById("mk-trigger-select");
    const conditionSelect = document.getElementById("mk-condition-select");
    const actionSelect = document.getElementById("mk-action-select");
    const addTriggerBtn = document.getElementById("mk-add-trigger");
    const addConditionBtn = document.getElementById("mk-add-condition");
    const addActionBtn = document.getElementById("mk-add-action");
    const buildChainBtn = document.getElementById("mk-build-chain");
    const autoLayoutBtn = document.getElementById("mk-auto-layout");
    const clearCanvasBtn = document.getElementById("mk-clear-canvas");
    const testFlowBtn = document.getElementById("mk-test-flow");
    const saveFlowBtn = document.getElementById("mk-save-flow");

    if (!mkWrap || !mkCanvas || !mkConnections || !mkPalette) {
        return;
    }

    const blockLibrary = {
        trigger: [
            { sub: "on_message", title: "Message Sent", description: "Starts rule execution when a user sends a message." },
            { sub: "member_join", title: "Member Joins", description: "Starts when a member enters the server." },
            { sub: "voice_timer", title: "Voice Session Matured", description: "Fires after a valid voice interval completes." },
        ],
        condition: [
            { sub: "contains_link", title: "Contains Link", description: "Checks if a message has URL or invite pattern." },
            { sub: "caps_ratio", title: "Caps Ratio", description: "Validates if uppercase ratio is above threshold." },
            { sub: "mention_spam", title: "Mention Spam", description: "Flags bursts of user or role mentions." },
            { sub: "duplicate_message", title: "Duplicate Message", description: "Detects repeated content in a short window." },
        ],
        action: [
            { sub: "timeout_10m", title: "Timeout 10m", description: "Applies temporary timeout to the member." },
            { sub: "delete_message", title: "Delete Message", description: "Deletes the triggering message from channel." },
            { sub: "send_dm", title: "Send DM", description: "Sends a direct message using a template." },
            { sub: "flag_review", title: "Flag For Review", description: "Creates a human-review event for staff." },
        ],
    };

    const typeColorMap = {
        trigger: "#61caff",
        condition: "#ffd761",
        action: "#7dffa4",
    };

    const state = {
        nodes: new Map(),
        links: [],
        selectedNodeId: null,
        draggedTemplate: null,
        dragNodeState: null,
        activeLinkStart: null,
        ghostPath: null,
        nodeCounter: 0,
        debugEnabled: false,
        fullSizeEnabled: false,
    };

    const canvasRect = () => mkCanvas.getBoundingClientRect();

    function findBlock(type, sub) {
        return (blockLibrary[type] || []).find((item) => item.sub === sub) || null;
    }

    function blockFromDataset(type, sub, fallbackTitle) {
        return findBlock(type, sub) || {
            type,
            sub,
            title: fallbackTitle || "Block",
            description: "Custom block added from the visual palette.",
        };
    }

    function pushDebug(label, payload = null, force = false) {
        if (!debugOutput) return;
        if (!state.debugEnabled && !force) {
            debugOutput.textContent = "Debug disabled.";
            return;
        }

        const mode = debugLevel?.value || "soft";
        const stamp = new Date().toLocaleTimeString();
        const lines = [`[${stamp}] ${label}`];
        if (payload && (mode === "verbose" || mode === "trace" || force)) {
            lines.push(JSON.stringify(payload, null, mode === "trace" ? 2 : 0));
        }

        const next = `${lines.join("\n")}\n${debugOutput.textContent === "Debug disabled." ? "" : debugOutput.textContent}`.trim();
        debugOutput.textContent = next.split("\n").slice(0, 36).join("\n");
    }

    function addLog(title, text) {
        if (!mkLogList) return;
        const row = document.createElement("div");
        row.className = "mk-log-item";
        row.innerHTML = `<strong>${title}</strong>${text}`;
        mkLogList.prepend(row);

        while (mkLogList.children.length > 9) {
            mkLogList.removeChild(mkLogList.lastElementChild);
        }
    }

    function syncDebugUi() {
        const label = state.debugEnabled ? "Debug On" : "Debug Off";
        if (debugToggle) debugToggle.checked = state.debugEnabled;
        if (debugToggleBtn) debugToggleBtn.textContent = label;
        if (!state.debugEnabled && debugOutput) {
            debugOutput.textContent = "Debug disabled.";
        }
    }

    function syncFullSizeUi() {
        if (!fullSizeBtn) return;
        fullSizeBtn.textContent = state.fullSizeEnabled ? "Full Size On" : "Full Size Off";
        fullSizeBtn.classList.toggle("primary", state.fullSizeEnabled);
    }

    function applyFullSizeMode(enabled) {
        state.fullSizeEnabled = !!enabled;
        document.body.classList.toggle("mk-script-fullsize", state.fullSizeEnabled);
        syncFullSizeUi();
        try {
            localStorage.setItem("luma_mk_fullsize", state.fullSizeEnabled ? "1" : "0");
        } catch (error) {
            // Ignore storage issues.
        }
        window.setTimeout(() => {
            redrawLinks();
            updateMinimap();
            updateSelectionInfo();
        }, 260);
    }

    function updateSelectionInfo() {
        if (!selectedTitle || !selectedSub || !selectedHelp || !selectedMeta || !selectedKind) return;
        if (!state.selectedNodeId || !state.nodes.has(state.selectedNodeId)) {
            selectedTitle.textContent = "No block selected";
            selectedSub.textContent = "Drop blocks and connect ports to assemble the rule.";
            selectedHelp.textContent = "Select a block on the canvas to view details.";
            selectedMeta.textContent = "The panel will show position, node type and link counts.";
            selectedKind.textContent = "Inspector";
            return;
        }

        const node = state.nodes.get(state.selectedNodeId);
        const outgoing = state.links.filter((link) => link.from === node.id).length;
        const incoming = state.links.filter((link) => link.to === node.id).length;
        selectedTitle.textContent = node.title;
        selectedSub.textContent = node.description;
        selectedHelp.textContent = `Position: (${Math.round(node.x)}, ${Math.round(node.y)}) | Incoming: ${incoming} | Outgoing: ${outgoing}`;
        selectedMeta.textContent = `Key: ${node.sub} | Type: ${node.type} | Node ID: ${node.id}`;
        selectedKind.textContent = node.type.charAt(0).toUpperCase() + node.type.slice(1);
        pushDebug("Selection updated", node);
    }

    function setSelected(nodeId) {
        state.selectedNodeId = nodeId;
        document.querySelectorAll(".mk-node").forEach((element) => {
            element.classList.toggle("is-selected", element.dataset.nodeId === nodeId);
        });
        updateSelectionInfo();
        updateMinimap();
    }

    function getPortCenter(portEl) {
        const rect = portEl.getBoundingClientRect();
        const wrapRect = mkWrap.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2 - wrapRect.left,
            y: rect.top + rect.height / 2 - wrapRect.top,
        };
    }

    function ensureSvgBounds() {
        mkConnections.setAttribute("width", String(mkWrap.clientWidth));
        mkConnections.setAttribute("height", String(mkWrap.clientHeight));
    }

    function curvePath(p1, p2) {
        const distance = Math.max(70, Math.abs(p2.x - p1.x) * 0.58);
        const c1x = p1.x + distance;
        const c2x = p2.x - distance;
        return `M ${p1.x} ${p1.y} C ${c1x} ${p1.y}, ${c2x} ${p2.y}, ${p2.x} ${p2.y}`;
    }

    function redrawLinks() {
        ensureSvgBounds();
        mkConnections.innerHTML = "";

        state.links.forEach((link) => {
            const fromPort = document.querySelector(`.mk-node[data-node-id=\"${link.from}\"] .mk-port.out`);
            const toPort = document.querySelector(`.mk-node[data-node-id=\"${link.to}\"] .mk-port.in`);
            if (!fromPort || !toPort) return;
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("class", "mk-connection");
            path.setAttribute("d", curvePath(getPortCenter(fromPort), getPortCenter(toPort)));
            mkConnections.appendChild(path);
        });

        if (state.ghostPath) {
            mkConnections.appendChild(state.ghostPath);
        }
    }

    function updateMinimap() {
        if (!mkMinimap) return;
        mkMinimap.innerHTML = "";

        const bounds = {
            w: Math.max(mkCanvas.clientWidth, 1),
            h: Math.max(mkCanvas.clientHeight, 1),
        };

        state.nodes.forEach((node) => {
            const dot = document.createElement("span");
            dot.className = `mk-minimap-node ${node.type}`;
            dot.style.left = `${(node.x / bounds.w) * 100}%`;
            dot.style.top = `${(node.y / bounds.h) * 100}%`;
            dot.style.width = `${node.type === "trigger" ? 14 : 10}px`;
            dot.style.height = `${node.type === "trigger" ? 9 : 8}px`;
            dot.style.outline = node.id === state.selectedNodeId ? "2px solid #ffffff" : "none";
            mkMinimap.appendChild(dot);
        });
    }

    function serializeState() {
        return {
            nodes: Array.from(state.nodes.values()),
            links: [...state.links],
            savedAt: new Date().toISOString(),
        };
    }

    function persistDraft() {
        localStorage.setItem("luma-mk-script-draft", JSON.stringify(serializeState()));
    }

    function removeNode(nodeId) {
        if (!state.nodes.has(nodeId)) return;
        state.nodes.delete(nodeId);
        state.links = state.links.filter((link) => link.from !== nodeId && link.to !== nodeId);
        mkCanvas.querySelector(`.mk-node[data-node-id=\"${nodeId}\"]`)?.remove();
        if (state.selectedNodeId === nodeId) {
            setSelected(null);
        }
        redrawLinks();
        updateMinimap();
        persistDraft();
        addLog("Block Removed", `${nodeId} removed from canvas.`);
        pushDebug("Node removed", { nodeId });
    }

    function makeNodeElement(node) {
        const element = document.createElement("article");
        element.className = "mk-node";
        element.dataset.nodeId = node.id;
        element.dataset.type = node.type;
        element.style.left = `${node.x}px`;
        element.style.top = `${node.y}px`;
        element.style.borderColor = typeColorMap[node.type] || "#7180ff";
        element.innerHTML = `
            <div class="mk-node-head">
                <div class="mk-node-title-wrap">
                    <strong class="mk-node-title">${node.title}</strong>
                    <small>${node.sub}</small>
                </div>
                <button class="mk-node-remove" type="button" title="Remove block">×</button>
            </div>
            <div class="mk-node-body">
                <p>${node.description}</p>
                <div class="mk-node-meta">
                    <span class="mk-node-pill">${node.type.toUpperCase()}</span>
                    <span class="mk-node-pill">${node.sub}</span>
                </div>
            </div>
            <button class="mk-port in" type="button" title="Input"></button>
            <button class="mk-port out" type="button" title="Output"></button>
        `;

        const head = element.querySelector(".mk-node-head");
        const remove = element.querySelector(".mk-node-remove");
        const portOut = element.querySelector(".mk-port.out");
        const portIn = element.querySelector(".mk-port.in");

        element.addEventListener("pointerdown", () => setSelected(node.id));

        head?.addEventListener("pointerdown", (event) => {
            if (event.target === remove) return;
            event.preventDefault();
            setSelected(node.id);
            state.dragNodeState = {
                nodeId: node.id,
                startX: event.clientX,
                startY: event.clientY,
                nodeStartX: node.x,
                nodeStartY: node.y,
            };
        });

        remove?.addEventListener("click", (event) => {
            event.stopPropagation();
            removeNode(node.id);
        });

        portOut?.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const start = getPortCenter(portOut);
            state.ghostPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            state.ghostPath.setAttribute("class", "mk-connection ghost");
            state.ghostPath.setAttribute("d", curvePath(start, start));
            state.activeLinkStart = { nodeId: node.id, start };
            portOut.classList.add("pending");
            redrawLinks();
            pushDebug("Link started", { from: node.id });
        });

        portIn?.addEventListener("pointerup", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!state.activeLinkStart || state.activeLinkStart.nodeId === node.id) return;

            const duplicate = state.links.some((link) => link.from === state.activeLinkStart.nodeId && link.to === node.id);
            if (!duplicate) {
                state.links.push({ from: state.activeLinkStart.nodeId, to: node.id });
                addLog("Link Added", `Connected ${state.activeLinkStart.nodeId} -> ${node.id}`);
                pushDebug("Link added", { from: state.activeLinkStart.nodeId, to: node.id });
                persistDraft();
            }

            state.activeLinkStart = null;
            state.ghostPath = null;
            document.querySelectorAll(".mk-port.pending").forEach((port) => port.classList.remove("pending"));
            redrawLinks();
            updateSelectionInfo();
        });

        return element;
    }

    function createNode(definition, x, y) {
        state.nodeCounter += 1;
        const node = {
            id: `node-${state.nodeCounter}`,
            type: definition.type,
            title: definition.title,
            sub: definition.sub,
            description: definition.description,
            x,
            y,
        };

        state.nodes.set(node.id, node);
        mkCanvas.appendChild(makeNodeElement(node));
        setSelected(node.id);
        redrawLinks();
        updateMinimap();
        persistDraft();
        addLog("Block Added", `${node.title} placed on canvas.`);
        pushDebug("Node created", node);
        return node;
    }

    function createNodeByKey(type, sub, x, y) {
        const match = blockFromDataset(type, sub, sub);
        return createNode({ ...match, type }, x, y);
    }

    function createChain(triggerKey, conditionKey, actionKey) {
        const startX = 74 + (state.nodes.size % 2) * 24;
        const startY = 150 + state.nodes.size * 20;
        const trigger = createNodeByKey("trigger", triggerKey, startX, startY);
        const condition = createNodeByKey("condition", conditionKey, startX + 270, startY + 18);
        const action = createNodeByKey("action", actionKey, startX + 540, startY + 36);
        state.links.push({ from: trigger.id, to: condition.id });
        state.links.push({ from: condition.id, to: action.id });
        redrawLinks();
        updateMinimap();
        persistDraft();
        addLog("Chain Built", `${trigger.title} -> ${condition.title} -> ${action.title}`);
        pushDebug("Starter chain created", { trigger, condition, action });
    }

    function autoLayout() {
        Array.from(state.nodes.values()).forEach((node, index) => {
            const col = index % 3;
            const row = Math.floor(index / 3);
            node.x = 54 + col * 290;
            node.y = 150 + row * 170;
            const element = mkCanvas.querySelector(`.mk-node[data-node-id=\"${node.id}\"]`);
            if (element) {
                element.style.left = `${node.x}px`;
                element.style.top = `${node.y}px`;
            }
        });
        redrawLinks();
        updateMinimap();
        updateSelectionInfo();
        persistDraft();
        addLog("Auto Layout", "Canvas reordered into a cleaner grid.");
        pushDebug("Auto layout complete", serializeState());
    }

    function clearCanvas() {
        state.nodes.clear();
        state.links = [];
        state.selectedNodeId = null;
        state.nodeCounter = 0;
        mkCanvas.innerHTML = "";
        redrawLinks();
        updateMinimap();
        updateSelectionInfo();
        persistDraft();
        addLog("Canvas Cleared", "All blocks and links were removed.");
        pushDebug("Canvas cleared", null, true);
    }

    function restoreDraft() {
        const previous = localStorage.getItem("luma-mk-script-draft");
        if (!previous) {
            createChain(triggerSelect?.value || "on_message", conditionSelect?.value || "contains_link", actionSelect?.value || "timeout_10m");
            return;
        }

        try {
            const parsed = JSON.parse(previous);
            if (Array.isArray(parsed.nodes)) {
                parsed.nodes.forEach((nodeData) => {
                    state.nodeCounter = Math.max(state.nodeCounter, Number(String(nodeData.id).replace("node-", "")) || 0);
                    const node = {
                        id: nodeData.id,
                        type: nodeData.type || "action",
                        title: nodeData.title || "Block",
                        sub: nodeData.sub || "block",
                        description: nodeData.description || "Recovered block from local draft.",
                        x: Number(nodeData.x) || 48,
                        y: Number(nodeData.y) || 120,
                    };
                    state.nodes.set(node.id, node);
                    mkCanvas.appendChild(makeNodeElement(node));
                });
            }
            if (Array.isArray(parsed.links)) {
                parsed.links.forEach((link) => {
                    if (link && state.nodes.has(link.from) && state.nodes.has(link.to)) {
                        state.links.push({ from: link.from, to: link.to });
                    }
                });
            }
            addLog("Draft Loaded", `Recovered ${state.nodes.size} blocks from local draft.`);
            pushDebug("Draft restored", parsed, true);
        } catch (error) {
            addLog("Draft Error", "Could not parse previous draft.");
            pushDebug("Draft restore failed", { error: String(error) }, true);
        }
    }

    mkPalette.querySelectorAll(".mk-block-template").forEach((template) => {
        template.addEventListener("dragstart", () => {
            state.draggedTemplate = template;
            template.classList.add("is-dragging");
        });
        template.addEventListener("dragend", () => {
            template.classList.remove("is-dragging");
            state.draggedTemplate = null;
        });
    });

    mkWrap.addEventListener("dragover", (event) => {
        event.preventDefault();
    });

    mkWrap.addEventListener("drop", (event) => {
        event.preventDefault();
        if (!state.draggedTemplate) return;

        const rect = canvasRect();
        const x = Math.max(20, event.clientX - rect.left - 120);
        const y = Math.max(100, event.clientY - rect.top - 50);
        createNodeByKey(
            state.draggedTemplate.dataset.type || "action",
            state.draggedTemplate.dataset.sub || "block",
            x,
            y,
        );
    });

    window.addEventListener("pointermove", (event) => {
        if (state.dragNodeState && state.nodes.has(state.dragNodeState.nodeId)) {
            const node = state.nodes.get(state.dragNodeState.nodeId);
            const dx = event.clientX - state.dragNodeState.startX;
            const dy = event.clientY - state.dragNodeState.startY;
            node.x = Math.max(10, state.dragNodeState.nodeStartX + dx);
            node.y = Math.max(90, state.dragNodeState.nodeStartY + dy);
            const element = mkCanvas.querySelector(`.mk-node[data-node-id=\"${node.id}\"]`);
            if (element) {
                element.style.left = `${node.x}px`;
                element.style.top = `${node.y}px`;
            }
            redrawLinks();
            updateMinimap();
            updateSelectionInfo();
        }

        if (state.activeLinkStart && state.ghostPath) {
            const wrapRect = mkWrap.getBoundingClientRect();
            const end = { x: event.clientX - wrapRect.left, y: event.clientY - wrapRect.top };
            state.ghostPath.setAttribute("d", curvePath(state.activeLinkStart.start, end));
        }
    });

    window.addEventListener("pointerup", () => {
        state.dragNodeState = null;
        if (state.activeLinkStart) {
            state.activeLinkStart = null;
            state.ghostPath = null;
            document.querySelectorAll(".mk-port.pending").forEach((port) => port.classList.remove("pending"));
            redrawLinks();
        }
        persistDraft();
    });

    window.addEventListener("resize", () => {
        redrawLinks();
        updateMinimap();
    });

    mkCanvas.addEventListener("pointerdown", (event) => {
        if (event.target === mkCanvas) {
            setSelected(null);
        }
    });

    addTriggerBtn?.addEventListener("click", () => {
        createNodeByKey("trigger", triggerSelect?.value || "on_message", 48, 150 + state.nodes.size * 14);
    });

    addConditionBtn?.addEventListener("click", () => {
        createNodeByKey("condition", conditionSelect?.value || "contains_link", 320, 160 + state.nodes.size * 14);
    });

    addActionBtn?.addEventListener("click", () => {
        createNodeByKey("action", actionSelect?.value || "timeout_10m", 590, 170 + state.nodes.size * 14);
    });

    buildChainBtn?.addEventListener("click", () => {
        createChain(
            triggerSelect?.value || "on_message",
            conditionSelect?.value || "contains_link",
            actionSelect?.value || "timeout_10m",
        );
    });

    autoLayoutBtn?.addEventListener("click", autoLayout);
    clearCanvasBtn?.addEventListener("click", clearCanvas);

    clearLogBtn?.addEventListener("click", () => {
        if (debugOutput) {
            debugOutput.textContent = state.debugEnabled ? "Debug console cleared." : "Debug disabled.";
        }
        if (mkLogList) {
            mkLogList.innerHTML = '<div class="mk-log-item"><strong>Ready</strong> Drop blocks to start building the flow.</div>';
        }
    });

    const toggleDebug = () => {
        state.debugEnabled = !state.debugEnabled;
        syncDebugUi();
        pushDebug(state.debugEnabled ? "Debug enabled" : "Debug disabled", serializeState(), true);
        addLog("Debug", state.debugEnabled ? "Detailed debug console enabled." : "Detailed debug console disabled.");
    };

    debugToggleBtn?.addEventListener("click", toggleDebug);
    debugToggle?.addEventListener("change", () => {
        state.debugEnabled = !!debugToggle.checked;
        syncDebugUi();
        pushDebug(state.debugEnabled ? "Debug enabled" : "Debug disabled", serializeState(), true);
    });

    debugLevel?.addEventListener("change", () => {
        pushDebug(`Debug level set to ${debugLevel.value}`, null, true);
    });

    testFlowBtn?.addEventListener("click", () => {
        const payload = {
            blocks: state.nodes.size,
            links: state.links.length,
            selected: state.selectedNodeId,
            debug: state.debugEnabled,
        };
        addLog("Preview Run", `Flow tested with ${payload.blocks} blocks and ${payload.links} connections.`);
        pushDebug("Flow preview executed", payload, true);
        window.showFlash?.("Flow preview completed", "success");
    });

    saveFlowBtn?.addEventListener("click", () => {
        persistDraft();
        const snapshot = serializeState();
        addLog("Draft Saved", `Stored ${snapshot.nodes.length} blocks locally.`);
        pushDebug("Draft saved", snapshot, true);
        window.showFlash?.("Draft saved locally", "success");
    });

    fullSizeBtn?.addEventListener("click", () => {
        applyFullSizeMode(!state.fullSizeEnabled);
    });

    window.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && state.fullSizeEnabled) {
            applyFullSizeMode(false);
        }
    });

    try {
        const saved = localStorage.getItem("luma_mk_fullsize") === "1";
        applyFullSizeMode(saved);
    } catch (error) {
        syncFullSizeUi();
    }

    syncDebugUi();
    restoreDraft();
    ensureSvgBounds();
    redrawLinks();
    updateMinimap();
    updateSelectionInfo();
})();
