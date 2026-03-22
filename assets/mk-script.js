(() => {
    const mkWrap = document.getElementById("mk-canvas-wrap");
    const mkCanvas = document.getElementById("mk-canvas");
    const mkConnections = document.getElementById("mk-connections");
    const mkPalette = document.getElementById("mk-palette");
    const mkLogList = document.getElementById("mk-log-list");
    const composerPanel = document.getElementById("mk-composer-panel");
    const composerToggleBtn = document.getElementById("mk-composer-toggle");
    const composerCloseBtn = document.getElementById("mk-composer-close");
    const debugPanel = document.getElementById("mk-debug-panel");
    const debugCloseBtn = document.getElementById("mk-debug-close");
    const inspectorDebugBtn = document.getElementById("mk-inspector-debug");
    const selectedTitle = document.getElementById("mk-selected-title");
    const selectedSub = document.getElementById("mk-selected-sub");
    const selectedHelp = document.getElementById("mk-selected-help");
    const selectedMeta = document.getElementById("mk-selected-meta");
    const selectedKind = document.getElementById("mk-selected-kind");
    const selectedHealthChips = document.getElementById("mk-health-chips");
    const selectedSubtypeInput = document.getElementById("mk-selected-subtype");
    const selectedTitleInput = document.getElementById("mk-selected-title-input");
    const selectedDescriptionInput = document.getElementById("mk-selected-description-input");
    const applyNodeBtn = document.getElementById("mk-apply-node");
    const duplicateNodeBtn = document.getElementById("mk-duplicate-node");
    const disconnectNodeBtn = document.getElementById("mk-disconnect-node");
    const deleteNodeBtn = document.getElementById("mk-delete-node");
    const flowStatus = document.getElementById("mk-flow-status");
    const flowSummary = document.getElementById("mk-flow-summary");
    const flowIssues = document.getElementById("mk-flow-issues");
    const countTriggers = document.getElementById("mk-count-triggers");
    const countConditions = document.getElementById("mk-count-conditions");
    const countActions = document.getElementById("mk-count-actions");
    const toolbarTitle = document.getElementById("mk-toolbar-title");
    const toolbarSubtitle = document.getElementById("mk-toolbar-subtitle");
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
    const presetButtons = document.querySelectorAll("[data-mk-preset]");
    const autoLayoutBtn = document.getElementById("mk-auto-layout");
    const clearCanvasBtn = document.getElementById("mk-clear-canvas");
    const testFlowBtn = document.getElementById("mk-test-flow");
    const saveFlowBtn = document.getElementById("mk-save-flow");
    const undoBtn = document.getElementById("mk-undo");
    const redoBtn = document.getElementById("mk-redo");
    const exportFlowBtn = document.getElementById("mk-export-flow");
    const importTriggerBtn = document.getElementById("mk-import-trigger");
    const importInput = document.getElementById("mk-import-input");

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

    const gridSize = 18;

    const blockKindLabels = {
        trigger: "Event Block",
        condition: "Decision Block",
        action: "Command Block",
    };

    const moderationPresets = {
        anti_link: {
            title: "Anti-Link Shield",
            flash: "Anti-Link preset added",
            nodes: [
                { key: "trigger", type: "trigger", sub: "on_message", offsetX: 0, offsetY: 0 },
                { key: "condition", type: "condition", sub: "contains_link", offsetX: 18, offsetY: 162 },
                { key: "delete", type: "action", sub: "delete_message", offsetX: 36, offsetY: 360 },
                { key: "timeout", type: "action", sub: "timeout_10m", offsetX: 54, offsetY: 534 },
                { key: "dm", type: "action", sub: "send_dm", offsetX: 72, offsetY: 708 },
            ],
            links: [
                ["trigger", "condition"],
                ["condition", "delete"],
                ["delete", "timeout"],
                ["timeout", "dm"],
            ],
        },
        mention_raid: {
            title: "Mention Raid Lock",
            flash: "Mention Raid preset added",
            nodes: [
                { key: "trigger", type: "trigger", sub: "on_message", offsetX: 0, offsetY: 0 },
                { key: "condition", type: "condition", sub: "mention_spam", offsetX: 18, offsetY: 162 },
                { key: "delete", type: "action", sub: "delete_message", offsetX: 36, offsetY: 360 },
                { key: "timeout", type: "action", sub: "timeout_10m", offsetX: 54, offsetY: 534 },
                { key: "review", type: "action", sub: "flag_review", offsetX: 72, offsetY: 708 },
            ],
            links: [
                ["trigger", "condition"],
                ["condition", "delete"],
                ["delete", "timeout"],
                ["timeout", "review"],
            ],
        },
        duplicate_flood: {
            title: "Duplicate Flood Stop",
            flash: "Duplicate Flood preset added",
            nodes: [
                { key: "trigger", type: "trigger", sub: "on_message", offsetX: 0, offsetY: 0 },
                { key: "condition", type: "condition", sub: "duplicate_message", offsetX: 18, offsetY: 162 },
                { key: "delete", type: "action", sub: "delete_message", offsetX: 36, offsetY: 360 },
                { key: "timeout", type: "action", sub: "timeout_10m", offsetX: 54, offsetY: 534 },
                { key: "review", type: "action", sub: "flag_review", offsetX: 72, offsetY: 708 },
            ],
            links: [
                ["trigger", "condition"],
                ["condition", "delete"],
                ["delete", "timeout"],
                ["timeout", "review"],
            ],
        },
        caps_control: {
            title: "Caps Control",
            flash: "Caps Control preset added",
            nodes: [
                { key: "trigger", type: "trigger", sub: "on_message", offsetX: 0, offsetY: 0 },
                { key: "condition", type: "condition", sub: "caps_ratio", offsetX: 18, offsetY: 162 },
                { key: "delete", type: "action", sub: "delete_message", offsetX: 36, offsetY: 360 },
                { key: "dm", type: "action", sub: "send_dm", offsetX: 54, offsetY: 534 },
            ],
            links: [
                ["trigger", "condition"],
                ["condition", "delete"],
                ["delete", "dm"],
            ],
        },
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
        composerOpen: false,
        debugOpen: false,
        history: [],
        future: [],
        canvasHeight: 590,
    };

    function createElement(tagName, className, textContent) {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        if (textContent !== undefined) element.textContent = textContent;
        return element;
    }

    function cloneJson(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function comparableSnapshot(snapshot) {
        return JSON.stringify({
            nodes: snapshot.nodes,
            links: snapshot.links,
        });
    }

    function isFormTarget(target) {
        return !!target?.closest("input, textarea, select, button, [contenteditable='true']");
    }

    function snapValue(value) {
        return Math.round(value / gridSize) * gridSize;
    }

    function clampNodePosition(x, y) {
        const width = Math.max(mkCanvas.clientWidth, 320);
        const height = Math.max(state.canvasHeight || mkCanvas.clientHeight, 590);
        return {
            x: Math.min(Math.max(24, snapValue(x)), Math.max(24, width - 296)),
            y: Math.min(Math.max(108, snapValue(y)), Math.max(108, height - 190)),
        };
    }

    function syncCanvasStageSize(extraBottom = 0) {
        const nodes = Array.from(state.nodes.values());
        const deepestNode = nodes.length ? Math.max(...nodes.map((node) => node.y + 190)) : 0;
        state.canvasHeight = Math.max(590, snapValue(Math.max(deepestNode, extraBottom) + 72));
        mkCanvas.style.minHeight = `${state.canvasHeight}px`;
        mkCanvas.style.height = `${state.canvasHeight}px`;
        mkConnections.style.height = `${state.canvasHeight}px`;
    }

    function humanizeKey(value) {
        return String(value || "block")
            .replace(/_/g, " ")
            .replace(/\b\w/g, (char) => char.toUpperCase());
    }

    function canvasRect() {
        return mkCanvas.getBoundingClientRect();
    }

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

    function getStackAnchor() {
        const nodes = Array.from(state.nodes.values());
        if (!nodes.length) {
            return { x: 96, y: 132 };
        }

        const maxY = Math.max(...nodes.map((node) => node.y));
        const lane = state.nodes.size % 2;
        return clampNodePosition(96 + lane * 308, maxY + 198);
    }

    function getSuggestedPosition(type) {
        if (state.selectedNodeId && state.nodes.has(state.selectedNodeId)) {
            const selected = state.nodes.get(state.selectedNodeId);
            const offsetX = type === "trigger" ? 0 : type === "condition" ? 18 : 36;
            return clampNodePosition(selected.x + offsetX, selected.y + 180);
        }

        const anchor = getStackAnchor();
        const typeOffset = type === "trigger" ? 0 : type === "condition" ? 18 : 36;
        return clampNodePosition(anchor.x + typeOffset, anchor.y);
    }

    function getTemplateDefinition(template) {
        const select = template.querySelector(".mk-template-select");
        if (select) {
            const option = select.options[select.selectedIndex];
            return {
                type: template.dataset.type || "action",
                sub: option?.value || template.dataset.sub || "block",
                title: option?.dataset.title || option?.textContent?.trim() || template.dataset.title || "Block",
                description: option?.dataset.description || template.querySelector(".mk-template-copy")?.textContent?.trim() || "Custom block added from the visual palette.",
            };
        }

        return {
            type: template.dataset.type || "action",
            sub: template.dataset.sub || "block",
            title: template.dataset.title || "Block",
            description: template.querySelector(".mk-template-copy, span:last-child")?.textContent?.trim() || "Custom block added from the visual palette.",
        };
    }

    function syncConfigurableTemplate(template) {
        const select = template.querySelector(".mk-template-select");
        const titleEl = template.querySelector(".mk-template-title");
        const copyEl = template.querySelector(".mk-template-copy");
        if (!select || !titleEl || !copyEl) return;

        const option = select.options[select.selectedIndex];
        titleEl.textContent = option?.dataset.title || option?.textContent?.trim() || "Block";
        copyEl.textContent = option?.dataset.description || "Custom block added from the visual palette.";
        template.dataset.sub = option?.value || template.dataset.sub || "block";
        template.dataset.title = titleEl.textContent;
    }

    function getComposerValue(selectEl, fallback) {
        const value = selectEl?.value?.trim() || "";
        return value || fallback;
    }

    function getNodeLinkCounts(nodeId) {
        return {
            incoming: state.links.filter((link) => link.to === nodeId).length,
            outgoing: state.links.filter((link) => link.from === nodeId).length,
        };
    }

    function serializeState() {
        return {
            nodes: Array.from(state.nodes.values()).map((node) => ({ ...node })),
            links: state.links.map((link) => ({ ...link })),
            savedAt: new Date().toISOString(),
        };
    }

    function syncHistoryUi() {
        if (undoBtn) undoBtn.disabled = state.history.length <= 1;
        if (redoBtn) redoBtn.disabled = state.future.length === 0;
    }

    function recordHistory(label) {
        const snapshot = cloneJson(serializeState());
        const comparable = comparableSnapshot(snapshot);
        const lastEntry = state.history[state.history.length - 1];

        if (lastEntry && lastEntry.comparable === comparable) {
            syncHistoryUi();
            return;
        }

        state.history.push({ label, snapshot, comparable });
        if (state.history.length > 50) {
            state.history.shift();
        }
        state.future = [];
        syncHistoryUi();
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
        debugOutput.textContent = next.split("\n").slice(0, 44).join("\n");
    }

    function createLogItem(title, text) {
        const row = createElement("div", "mk-log-item");
        const strong = createElement("strong", null, title);
        const body = createElement("span", null, ` ${text}`);
        row.append(strong, body);
        return row;
    }

    function resetLogList() {
        if (!mkLogList) return;
        mkLogList.replaceChildren(createLogItem("Ready", "Drop blocks to start building the flow."));
    }

    function addLog(title, text) {
        if (!mkLogList) return;
        mkLogList.prepend(createLogItem(title, text));
        while (mkLogList.children.length > 9) {
            mkLogList.removeChild(mkLogList.lastElementChild);
        }
    }

    function setComposerOpen(open) {
        state.composerOpen = !!open;
        if (composerPanel) composerPanel.hidden = !state.composerOpen;
        if (composerToggleBtn) composerToggleBtn.classList.toggle("primary", state.composerOpen);
    }

    function syncDebugUi() {
        if (debugToggle) debugToggle.checked = state.debugEnabled;
        if (debugToggleBtn) {
            debugToggleBtn.textContent = state.debugOpen ? "Close Debug" : state.debugEnabled ? "Debug On" : "Debug";
            debugToggleBtn.classList.toggle("primary", state.debugEnabled || state.debugOpen);
        }
        if (!state.debugEnabled && debugOutput) {
            debugOutput.textContent = "Debug disabled.";
        }
    }

    function setDebugOpen(open) {
        state.debugOpen = !!open;
        if (debugPanel) debugPanel.hidden = !state.debugOpen;
        syncDebugUi();
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
            updateSelectionInfo();
            updateFlowSummary();
        }, 260);
    }

    function createHealthChip(text) {
        return createElement("span", "mk-health-chip", text);
    }

    function setInspectorEnabled(enabled) {
        [selectedSubtypeInput, selectedTitleInput, selectedDescriptionInput, applyNodeBtn, duplicateNodeBtn, deleteNodeBtn].forEach((element) => {
            if (element) element.disabled = !enabled;
        });
    }

    function populateSubtypeOptions(type, selectedSub) {
        if (!selectedSubtypeInput) return;
        selectedSubtypeInput.replaceChildren();
        (blockLibrary[type] || []).forEach((block) => {
            const option = document.createElement("option");
            option.value = block.sub;
            option.textContent = block.title;
            option.selected = block.sub === selectedSub;
            selectedSubtypeInput.appendChild(option);
        });
    }

    function syncSelectedEditor(node) {
        if (!node) {
            setInspectorEnabled(false);
            if (selectedSubtypeInput) selectedSubtypeInput.replaceChildren();
            if (selectedTitleInput) selectedTitleInput.value = "";
            if (selectedDescriptionInput) selectedDescriptionInput.value = "";
            if (disconnectNodeBtn) disconnectNodeBtn.disabled = true;
            return;
        }

        setInspectorEnabled(true);
        populateSubtypeOptions(node.type, node.sub);
        if (selectedTitleInput) selectedTitleInput.value = node.title;
        if (selectedDescriptionInput) selectedDescriptionInput.value = node.description;
        if (disconnectNodeBtn) {
            const counts = getNodeLinkCounts(node.id);
            disconnectNodeBtn.disabled = counts.incoming + counts.outgoing === 0;
        }
    }

    function updateSelectionInfo() {
        if (!selectedTitle || !selectedSub || !selectedHelp || !selectedMeta || !selectedKind || !selectedHealthChips) {
            return;
        }

        if (!state.selectedNodeId || !state.nodes.has(state.selectedNodeId)) {
            selectedTitle.textContent = "No block selected";
            selectedSub.textContent = "Drop blocks and connect ports to assemble the rule.";
            selectedHelp.textContent = "Select a block on the canvas to view details.";
            selectedMeta.textContent = "The panel will show position, node type and link counts.";
            selectedKind.textContent = "Inspector";
            selectedHealthChips.replaceChildren(createHealthChip("No block data yet"));
            syncSelectedEditor(null);
            return;
        }

        const node = state.nodes.get(state.selectedNodeId);
        const counts = getNodeLinkCounts(node.id);
        selectedTitle.textContent = node.title;
        selectedSub.textContent = node.description;
        selectedHelp.textContent = `Position: (${Math.round(node.x)}, ${Math.round(node.y)}) | Incoming: ${counts.incoming} | Outgoing: ${counts.outgoing}`;
        selectedMeta.textContent = `Key: ${node.sub} | Type: ${node.type} | Node ID: ${node.id}`;
        selectedKind.textContent = node.type.charAt(0).toUpperCase() + node.type.slice(1);
        selectedHealthChips.replaceChildren(
            createHealthChip(node.type.toUpperCase()),
            createHealthChip(`Preset ${node.sub}`),
            createHealthChip(`${counts.incoming} in / ${counts.outgoing} out`),
        );
        syncSelectedEditor(node);
    }

    function setSelected(nodeId, options = {}) {
        const previous = state.selectedNodeId;
        state.selectedNodeId = nodeId && state.nodes.has(nodeId) ? nodeId : null;
        document.querySelectorAll(".mk-node").forEach((element) => {
            const isSelected = element.dataset.nodeId === state.selectedNodeId;
            element.classList.toggle("is-selected", isSelected);
            element.style.zIndex = isSelected ? "4" : "1";
        });
        updateSelectionInfo();
        if (!options.silent && previous !== state.selectedNodeId && state.selectedNodeId) {
            pushDebug("Selection updated", state.nodes.get(state.selectedNodeId));
        }
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
        mkConnections.setAttribute("height", String(state.canvasHeight || mkWrap.clientHeight));
    }

    function curvePath(p1, p2) {
        const distance = Math.max(70, Math.abs(p2.y - p1.y) * 0.56);
        const c1y = p1.y + distance;
        const c2y = p2.y - distance;
        return `M ${p1.x} ${p1.y} C ${p1.x} ${c1y}, ${p2.x} ${c2y}, ${p2.x} ${p2.y}`;
    }

    function removeLinkByIndex(index, options = {}) {
        const link = state.links[index];
        if (!link) return;
        state.links.splice(index, 1);
        addLog("Link Removed", `Disconnected ${link.from} -> ${link.to}.`);
        finalizeGraphChange(options.label || "Link removed", link, { record: options.record !== false });
    }

    function redrawLinks() {
        syncCanvasStageSize();
        ensureSvgBounds();
        mkConnections.replaceChildren();

        state.links.forEach((link, index) => {
            const fromPort = document.querySelector(`.mk-node[data-node-id="${link.from}"] .mk-port.out`);
            const toPort = document.querySelector(`.mk-node[data-node-id="${link.to}"] .mk-port.in`);
            if (!fromPort || !toPort) return;

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("class", "mk-connection");
            path.setAttribute("d", curvePath(getPortCenter(fromPort), getPortCenter(toPort)));
            path.setAttribute("data-link-index", String(index));
            path.addEventListener("pointerdown", (event) => {
                event.stopPropagation();
            });
            path.addEventListener("click", (event) => {
                event.stopPropagation();
                removeLinkByIndex(index);
            });
            mkConnections.appendChild(path);
        });

        if (state.ghostPath) {
            mkConnections.appendChild(state.ghostPath);
        }
    }

    function validateFlow() {
        const nodes = Array.from(state.nodes.values());
        const triggers = nodes.filter((node) => node.type === "trigger");
        const conditions = nodes.filter((node) => node.type === "condition");
        const actions = nodes.filter((node) => node.type === "action");
        const issues = [];

        if (nodes.length === 0) {
            return {
                status: "Blank",
                summary: "Canvas is empty. Drag a block from the library or build a starter chain.",
                issues: [{ title: "Waiting", text: "Add blocks to start validating the flow." }],
                counts: { triggers: 0, conditions: 0, actions: 0 },
            };
        }

        if (triggers.length === 0) {
            issues.push({ title: "Missing trigger", text: "Add at least one trigger so the rule can start from an event." });
        }
        if (actions.length === 0) {
            issues.push({ title: "Missing action", text: "Add at least one action so the flow produces an outcome." });
        }

        const orphanNodes = nodes.filter((node) => {
            const counts = getNodeLinkCounts(node.id);
            return counts.incoming + counts.outgoing === 0;
        });

        if (orphanNodes.length) {
            issues.push({ title: "Orphan blocks", text: `${orphanNodes.length} block${orphanNodes.length === 1 ? " is" : "s are"} not connected to anything.` });
        }

        const hangingTriggers = triggers.filter((node) => getNodeLinkCounts(node.id).outgoing === 0);
        if (hangingTriggers.length) {
            issues.push({ title: "Idle triggers", text: `${hangingTriggers.length} trigger${hangingTriggers.length === 1 ? " has" : "s have"} no outgoing branch.` });
        }

        const hangingConditions = conditions.filter((node) => {
            const counts = getNodeLinkCounts(node.id);
            return counts.incoming === 0 || counts.outgoing === 0;
        });
        if (hangingConditions.length) {
            issues.push({ title: "Open conditions", text: `${hangingConditions.length} condition${hangingConditions.length === 1 ? " needs" : "s need"} an incoming and outgoing connection.` });
        }

        const hangingActions = actions.filter((node) => getNodeLinkCounts(node.id).incoming === 0);
        if (hangingActions.length) {
            issues.push({ title: "Unreached actions", text: `${hangingActions.length} action${hangingActions.length === 1 ? " is" : "s are"} not reached by any previous block.` });
        }

        let status = "Ready";
        if (issues.length > 0 && (triggers.length === 0 || actions.length === 0 || hangingConditions.length > 0)) {
            status = "Needs Work";
        } else if (issues.length > 0) {
            status = "Draft";
        }

        const summary = status === "Ready"
            ? `Flow is connected and ready for preview with ${nodes.length} blocks and ${state.links.length} links.`
            : `${issues.length} validation check${issues.length === 1 ? "" : "s"} still need attention before publishing.`;

        return {
            status,
            summary,
            issues,
            counts: {
                triggers: triggers.length,
                conditions: conditions.length,
                actions: actions.length,
            },
        };
    }

    function updateFlowSummary() {
        const report = validateFlow();
        if (flowStatus) flowStatus.textContent = report.status;
        if (flowSummary) flowSummary.textContent = report.summary;
        if (countTriggers) countTriggers.textContent = String(report.counts.triggers);
        if (countConditions) countConditions.textContent = String(report.counts.conditions);
        if (countActions) countActions.textContent = String(report.counts.actions);

        if (toolbarTitle) {
            toolbarTitle.textContent = report.status === "Ready" ? "Project Canvas Ready" : "Project Canvas";
        }
        if (toolbarSubtitle) {
            toolbarSubtitle.textContent = `${state.nodes.size} blocks, ${state.links.length} links, ${report.issues.length} open checks.`;
        }

        if (flowIssues) {
            const items = report.issues.length
                ? report.issues.map((issue) => createLogItem(issue.title, issue.text))
                : [createLogItem("Ready", "The current flow is connected and ready for preview.")];
            flowIssues.replaceChildren(...items);
        }
    }

    function finalizeGraphChange(label, payload = null, options = {}) {
        redrawLinks();
        updateSelectionInfo();
        updateFlowSummary();
        if (options.persist !== false) {
            persistDraft();
        }
        if (options.record !== false) {
            recordHistory(label);
        }
        if (options.debug !== false) {
            pushDebug(label, payload);
        }
    }

    function buildNodeRuleElement(node) {
        const rule = createElement("div", "mk-node-rule");
        const row = createElement("div", "mk-node-rule-row");

        if (node.type === "trigger") {
            row.append(
                createElement("span", "mk-node-rule-word", "when"),
                createElement("span", "mk-node-rule-token", node.title),
            );
        } else if (node.type === "condition") {
            row.append(
                createElement("span", "mk-node-rule-word", "if"),
                createElement("span", "mk-node-rule-token", node.title),
                createElement("span", "mk-node-rule-word", "then"),
            );
        } else {
            row.append(
                createElement("span", "mk-node-rule-word", "do"),
                createElement("span", "mk-node-rule-token", node.title),
            );
        }

        rule.append(row);

        if (node.type === "condition") {
            const slot = createElement("div", "mk-node-slot");
            slot.append(
                createElement("strong", null, "Nested action lane"),
                createElement("span", null, "Actions plugged below this block continue the moderation routine."),
            );
            rule.append(slot);
        }

        rule.append(createElement("p", "mk-node-rule-description", node.description));
        return rule;
    }

    function makeNodeElement(node) {
        const element = createElement("article", "mk-node");
        element.dataset.nodeId = node.id;
        element.dataset.type = node.type;
        element.style.left = `${node.x}px`;
        element.style.top = `${node.y}px`;
        element.style.borderColor = typeColorMap[node.type] || "#7180ff";

        const shell = createElement("div", "mk-node-shell");

        const head = createElement("div", "mk-node-head");
        const grip = createElement("div", "mk-node-grip");
        grip.append(createElement("span"), createElement("span"), createElement("span"));
        const titleWrap = createElement("div", "mk-node-title-wrap");
        const kicker = createElement("span", "mk-node-kicker", blockKindLabels[node.type] || "Block");
        const title = createElement("strong", "mk-node-title", node.title);
        const sub = createElement("small", "mk-node-sub", humanizeKey(node.sub));
        const remove = createElement("button", "mk-node-remove", "x");
        remove.type = "button";
        remove.title = "Remove block";
        titleWrap.append(kicker, title, sub);
        head.append(grip, titleWrap, remove);

        const body = createElement("div", "mk-node-body");
        const meta = createElement("div", "mk-node-meta");
        meta.append(
            createElement("span", "mk-node-pill", node.type.toUpperCase()),
            createElement("span", "mk-node-pill", node.sub),
        );
        body.append(buildNodeRuleElement(node), meta);

        const portIn = createElement("button", "mk-port in");
        portIn.type = "button";
        portIn.title = "Input";
        const portOut = createElement("button", "mk-port out");
        portOut.type = "button";
        portOut.title = "Output";

        element.append(shell, head, body, portIn, portOut);

        element.addEventListener("pointerdown", () => setSelected(node.id));

        head.addEventListener("pointerdown", (event) => {
            if (event.target === remove) return;
            event.preventDefault();
            setSelected(node.id);
            state.dragNodeState = {
                nodeId: node.id,
                startX: event.clientX,
                startY: event.clientY,
                nodeStartX: node.x,
                nodeStartY: node.y,
                moved: false,
            };
        });

        remove.addEventListener("click", (event) => {
            event.stopPropagation();
            removeNode(node.id);
        });

        portOut.addEventListener("pointerdown", (event) => {
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

        portIn.addEventListener("pointerup", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!state.activeLinkStart || state.activeLinkStart.nodeId === node.id) return;

            const fromId = state.activeLinkStart.nodeId;
            const duplicate = state.links.some((link) => link.from === fromId && link.to === node.id);

            state.activeLinkStart = null;
            state.ghostPath = null;
            document.querySelectorAll(".mk-port.pending").forEach((port) => port.classList.remove("pending"));

            if (!duplicate) {
                state.links.push({ from: fromId, to: node.id });
                addLog("Link Added", `Connected ${fromId} -> ${node.id}.`);
                finalizeGraphChange("Link added", { from: fromId, to: node.id });
            } else {
                redrawLinks();
            }
        });

        return element;
    }

    function rerenderNode(nodeId) {
        const node = state.nodes.get(nodeId);
        const existing = mkCanvas.querySelector(`.mk-node[data-node-id="${nodeId}"]`);
        if (!node || !existing) return;
        const replacement = makeNodeElement(node);
        if (state.selectedNodeId === nodeId) {
            replacement.classList.add("is-selected");
            replacement.style.zIndex = "4";
        }
        existing.replaceWith(replacement);
    }

    function createNode(definition, x, y, options = {}) {
        syncCanvasStageSize(y + 220);
        const position = clampNodePosition(x, y);
        state.nodeCounter += 1;
        const node = {
            id: `node-${state.nodeCounter}`,
            type: definition.type,
            title: definition.title,
            sub: definition.sub,
            description: definition.description,
            x: position.x,
            y: position.y,
        };

        state.nodes.set(node.id, node);
        mkCanvas.appendChild(makeNodeElement(node));
        if (options.select !== false) {
            setSelected(node.id, { silent: true });
        }
        if (options.log !== false) {
            addLog("Block Added", `${node.title} placed on canvas.`);
        }
        if (options.finalize !== false) {
            finalizeGraphChange(options.label || "Block added", node, { record: options.record !== false });
        }
        return node;
    }

    function createNodeByKey(type, sub, x, y, options = {}) {
        const match = blockFromDataset(type, sub, sub);
        return createNode({ ...match, type }, x, y, options);
    }

    function removeNode(nodeId, options = {}) {
        if (!state.nodes.has(nodeId)) return;
        state.nodes.delete(nodeId);
        state.links = state.links.filter((link) => link.from !== nodeId && link.to !== nodeId);
        mkCanvas.querySelector(`.mk-node[data-node-id="${nodeId}"]`)?.remove();
        if (state.selectedNodeId === nodeId) {
            setSelected(null, { silent: true });
        }
        addLog("Block Removed", `${nodeId} removed from canvas.`);
        finalizeGraphChange(options.label || "Block removed", { nodeId }, { record: options.record !== false });
    }

    function duplicateSelectedNode() {
        if (!state.selectedNodeId || !state.nodes.has(state.selectedNodeId)) return;
        const node = state.nodes.get(state.selectedNodeId);
        const duplicate = createNode(
            {
                type: node.type,
                sub: node.sub,
                title: node.title,
                description: node.description,
            },
            node.x + 42,
            node.y + 32,
            { label: "Block duplicated" },
        );
        addLog("Duplicate", `${duplicate.title} copied from ${node.id}.`);
    }

    function detachSelectedNodeLinks() {
        if (!state.selectedNodeId || !state.nodes.has(state.selectedNodeId)) return;
        const before = state.links.length;
        state.links = state.links.filter((link) => link.from !== state.selectedNodeId && link.to !== state.selectedNodeId);
        const removed = before - state.links.length;
        if (!removed) return;
        addLog("Links Detached", `${removed} link${removed === 1 ? "" : "s"} removed from ${state.selectedNodeId}.`);
        finalizeGraphChange("Node links detached", { nodeId: state.selectedNodeId, removed });
    }

    function applySelectedNodeChanges() {
        if (!state.selectedNodeId || !state.nodes.has(state.selectedNodeId)) return;
        const node = state.nodes.get(state.selectedNodeId);
        const subtype = selectedSubtypeInput?.value || node.sub;
        const fallback = blockFromDataset(node.type, subtype, subtype);
        node.sub = subtype;
        node.title = selectedTitleInput?.value?.trim() || fallback.title;
        node.description = selectedDescriptionInput?.value?.trim() || fallback.description;
        rerenderNode(node.id);
        setSelected(node.id, { silent: true });
        addLog("Block Updated", `${node.title} updated from inspector.`);
        finalizeGraphChange("Block updated", node);
    }

    function autoFillInspectorFromSubtype() {
        if (!state.selectedNodeId || !state.nodes.has(state.selectedNodeId)) return;
        const node = state.nodes.get(state.selectedNodeId);
        const fallback = blockFromDataset(node.type, selectedSubtypeInput?.value || node.sub, node.title);
        if (selectedTitleInput) selectedTitleInput.value = fallback.title;
        if (selectedDescriptionInput) selectedDescriptionInput.value = fallback.description;
    }

    function createChain(triggerKey, conditionKey, actionKey) {
        const blueprint = {
            title: "Starter chain",
            nodes: [
                { key: "trigger", type: "trigger", sub: triggerKey, offsetX: 0, offsetY: 0 },
                { key: "condition", type: "condition", sub: conditionKey, offsetX: 18, offsetY: 162 },
                { key: "action", type: "action", sub: actionKey, offsetX: 36, offsetY: 360 },
            ],
            links: [
                ["trigger", "condition"],
                ["condition", "action"],
            ],
        };

        return createBlueprintFlow(blueprint, {
            label: "Starter chain created",
            logPrefix: "Chain Built",
        });
    }

    function createBlueprintFlow(blueprint, options = {}) {
        const anchor = options.anchor || getStackAnchor();
        const createdNodes = new Map();

        if (Array.isArray(blueprint.nodes) && blueprint.nodes.length) {
            const maxOffsetY = Math.max(...blueprint.nodes.map((spec) => spec.offsetY || 0));
            syncCanvasStageSize(anchor.y + maxOffsetY + 260);
        }

        blueprint.nodes.forEach((spec) => {
            const position = clampNodePosition(anchor.x + spec.offsetX, anchor.y + spec.offsetY);
            const node = createNodeByKey(spec.type, spec.sub, position.x, position.y, { finalize: false, log: false, select: false });
            createdNodes.set(spec.key, node);
        });

        blueprint.links.forEach(([fromKey, toKey]) => {
            const fromNode = createdNodes.get(fromKey);
            const toNode = createdNodes.get(toKey);
            if (!fromNode || !toNode) return;
            state.links.push({ from: fromNode.id, to: toNode.id });
        });

        const focusKey = options.focusKey || blueprint.nodes[blueprint.nodes.length - 1]?.key;
        const focusNode = focusKey ? createdNodes.get(focusKey) : null;
        if (focusNode) {
            setSelected(focusNode.id, { silent: true });
        }

        addLog(options.logPrefix || "Preset Added", `${blueprint.title} inserted with ${createdNodes.size} blocks.`);
        finalizeGraphChange(options.label || `${blueprint.title} created`, {
            preset: blueprint.title,
            nodes: Array.from(createdNodes.values()),
        });

        return createdNodes;
    }

    function applyPresetFlow(presetId) {
        const preset = moderationPresets[presetId];
        if (!preset) return;

        createBlueprintFlow(preset, {
            label: `${preset.title} preset created`,
            logPrefix: "Preset Added",
        });
        pushDebug("Preset applied", { preset: presetId, title: preset.title }, true);
        window.showFlash?.(preset.flash, "success");
    }

    function autoLayout() {
        const nodes = Array.from(state.nodes.values());
        const incoming = new Map(nodes.map((node) => [node.id, 0]));
        const outgoing = new Map(nodes.map((node) => [node.id, []]));

        state.links.forEach((link) => {
            incoming.set(link.to, (incoming.get(link.to) || 0) + 1);
            if (!outgoing.has(link.from)) {
                outgoing.set(link.from, []);
            }
            outgoing.get(link.from).push(link.to);
        });

        const roots = nodes
            .filter((node) => (incoming.get(node.id) || 0) === 0)
            .sort((left, right) => left.x - right.x || left.y - right.y);
        const visited = new Set();
        const columns = [];

        function pushComponent(rootId) {
            const queue = [{ id: rootId, depth: 0 }];
            const rows = new Map();

            while (queue.length) {
                const current = queue.shift();
                if (!current || visited.has(current.id)) {
                    continue;
                }

                visited.add(current.id);
                if (!rows.has(current.depth)) {
                    rows.set(current.depth, []);
                }
                rows.get(current.depth).push(current.id);

                (outgoing.get(current.id) || []).forEach((targetId) => {
                    queue.push({ id: targetId, depth: current.depth + 1 });
                });
            }

            if (rows.size) {
                columns.push(rows);
            }
        }

        roots.forEach((root) => pushComponent(root.id));
        nodes.forEach((node) => {
            if (!visited.has(node.id)) {
                pushComponent(node.id);
            }
        });

        syncCanvasStageSize(columns.length * 220 + 640);

        columns.forEach((rows, columnIndex) => {
            Array.from(rows.entries())
                .sort((a, b) => a[0] - b[0])
                .forEach(([depth, ids]) => {
                    ids.forEach((nodeId, slotIndex) => {
                        const node = state.nodes.get(nodeId);
                        if (!node) return;
                        const position = clampNodePosition(84 + columnIndex * 312 + slotIndex * 154, 140 + depth * 180);
                        node.x = position.x;
                        node.y = position.y;
                        const element = mkCanvas.querySelector(`.mk-node[data-node-id="${node.id}"]`);
                        if (element) {
                            element.style.left = `${node.x}px`;
                            element.style.top = `${node.y}px`;
                        }
                    });
                });
        });

        addLog("Auto Layout", "Canvas reordered into a cleaner grid.");
        finalizeGraphChange("Auto layout complete", serializeState());
    }

    function clearCanvas(record = true) {
        state.nodes.clear();
        state.links = [];
        state.selectedNodeId = null;
        state.nodeCounter = 0;
        mkCanvas.replaceChildren();
        addLog("Canvas Cleared", "All blocks and links were removed.");
        finalizeGraphChange("Canvas cleared", null, { record });
    }

    function normalizeImportedSnapshot(snapshot) {
        const sourceNodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
        const sourceLinks = Array.isArray(snapshot?.links) ? snapshot.links : [];
        const ids = new Set();
        let generatedCounter = 0;

        const nodes = sourceNodes.map((rawNode) => {
            generatedCounter += 1;
            const type = ["trigger", "condition", "action"].includes(rawNode?.type) ? rawNode.type : "action";
            const fallback = blockFromDataset(type, rawNode?.sub || "block", rawNode?.title || "Block");
            let id = typeof rawNode?.id === "string" && rawNode.id.trim() ? rawNode.id.trim() : `node-${generatedCounter}`;
            while (ids.has(id)) {
                generatedCounter += 1;
                id = `node-${generatedCounter}`;
            }
            ids.add(id);
            return {
                id,
                type,
                sub: typeof rawNode?.sub === "string" && rawNode.sub.trim() ? rawNode.sub.trim() : fallback.sub,
                title: typeof rawNode?.title === "string" && rawNode.title.trim() ? rawNode.title.trim().slice(0, 48) : fallback.title,
                description: typeof rawNode?.description === "string" && rawNode.description.trim() ? rawNode.description.trim().slice(0, 160) : fallback.description,
                x: Number.isFinite(Number(rawNode?.x)) ? Number(rawNode.x) : 48,
                y: Number.isFinite(Number(rawNode?.y)) ? Number(rawNode.y) : 120,
            };
        });

        const links = [];
        const seenLinks = new Set();
        sourceLinks.forEach((rawLink) => {
            const from = typeof rawLink?.from === "string" ? rawLink.from : "";
            const to = typeof rawLink?.to === "string" ? rawLink.to : "";
            if (!ids.has(from) || !ids.has(to) || from === to) return;
            const key = `${from}->${to}`;
            if (seenLinks.has(key)) return;
            seenLinks.add(key);
            links.push({ from, to });
        });

        return { nodes, links };
    }

    function applySnapshot(snapshot, options = {}) {
        const normalized = normalizeImportedSnapshot(snapshot);
        const preservedSelection = options.preserveSelection ? state.selectedNodeId : null;

        state.nodes.clear();
        state.links = [];
        state.selectedNodeId = null;
        state.nodeCounter = 0;
        mkCanvas.replaceChildren();

        normalized.nodes.forEach((node) => {
            const numericId = Number(String(node.id).replace("node-", ""));
            if (Number.isFinite(numericId)) {
                state.nodeCounter = Math.max(state.nodeCounter, numericId);
            }
            state.nodes.set(node.id, { ...node });
            mkCanvas.appendChild(makeNodeElement(node));
        });

        state.links = normalized.links.map((link) => ({ ...link }));
        redrawLinks();
        if (preservedSelection && state.nodes.has(preservedSelection)) {
            setSelected(preservedSelection, { silent: true });
        } else {
            setSelected(null, { silent: true });
        }
        updateFlowSummary();
        persistDraft();
    }

    function undo() {
        if (state.history.length <= 1) return;
        const current = state.history.pop();
        state.future.push(current);
        const previous = state.history[state.history.length - 1];
        applySnapshot(previous.snapshot, { preserveSelection: true });
        syncHistoryUi();
        addLog("Undo", previous.label);
        pushDebug("Undo", previous.snapshot, true);
    }

    function redo() {
        if (!state.future.length) return;
        const next = state.future.pop();
        state.history.push(next);
        applySnapshot(next.snapshot, { preserveSelection: true });
        syncHistoryUi();
        addLog("Redo", next.label);
        pushDebug("Redo", next.snapshot, true);
    }

    function persistDraft() {
        localStorage.setItem("luma-mk-script-draft", JSON.stringify(serializeState()));
    }

    function exportFlow() {
        const snapshot = serializeState();
        const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `mk-script-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        addLog("Export", `Exported ${snapshot.nodes.length} blocks to JSON.`);
        pushDebug("Flow exported", snapshot, true);
        window.showFlash?.("Flow exported as JSON", "success");
    }

    function importFlowText(text) {
        const parsed = JSON.parse(text);
        applySnapshot(parsed, { preserveSelection: false });
        recordHistory("Flow imported");
        addLog("Import", `Imported ${state.nodes.size} blocks from JSON.`);
        pushDebug("Flow imported", parsed, true);
        window.showFlash?.("Flow imported", "success");
    }

    function restoreDraft() {
        const previous = localStorage.getItem("luma-mk-script-draft");
        if (!previous) {
            createChain(
                getComposerValue(triggerSelect, "on_message"),
                getComposerValue(conditionSelect, "contains_link"),
                getComposerValue(actionSelect, "timeout_10m"),
            );
            return;
        }

        try {
            applySnapshot(JSON.parse(previous), { preserveSelection: false });
            addLog("Draft Loaded", `Recovered ${state.nodes.size} blocks from local draft.`);
            pushDebug("Draft restored", serializeState(), true);
        } catch (error) {
            clearCanvas(false);
            createChain(
                getComposerValue(triggerSelect, "on_message"),
                getComposerValue(conditionSelect, "contains_link"),
                getComposerValue(actionSelect, "timeout_10m"),
            );
            addLog("Draft Error", "Could not parse previous draft, so a new starter flow was created.");
            pushDebug("Draft restore failed", { error: String(error) }, true);
        }
    }

    mkPalette.querySelectorAll(".mk-block-template").forEach((template) => {
        syncConfigurableTemplate(template);

        template.querySelector(".mk-template-select")?.addEventListener("change", () => {
            syncConfigurableTemplate(template);
        });

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
        const position = clampNodePosition(event.clientX - rect.left - 128, event.clientY - rect.top - 72);
        const definition = getTemplateDefinition(state.draggedTemplate);
        createNode({ ...definition }, position.x, position.y);
    });

    window.addEventListener("pointermove", (event) => {
        if (state.dragNodeState && state.nodes.has(state.dragNodeState.nodeId)) {
            const node = state.nodes.get(state.dragNodeState.nodeId);
            const dx = event.clientX - state.dragNodeState.startX;
            const dy = event.clientY - state.dragNodeState.startY;
            syncCanvasStageSize(state.dragNodeState.nodeStartY + dy + 230);
            const position = clampNodePosition(state.dragNodeState.nodeStartX + dx, state.dragNodeState.nodeStartY + dy);
            node.x = position.x;
            node.y = position.y;
            state.dragNodeState.moved = state.dragNodeState.moved || dx !== 0 || dy !== 0;
            const element = mkCanvas.querySelector(`.mk-node[data-node-id="${node.id}"]`);
            if (element) {
                element.style.left = `${node.x}px`;
                element.style.top = `${node.y}px`;
            }
            redrawLinks();
            updateSelectionInfo();
        }

        if (state.activeLinkStart && state.ghostPath) {
            const wrapRect = mkWrap.getBoundingClientRect();
            const end = { x: event.clientX - wrapRect.left, y: event.clientY - wrapRect.top };
            state.ghostPath.setAttribute("d", curvePath(state.activeLinkStart.start, end));
        }
    });

    window.addEventListener("pointerup", () => {
        if (state.dragNodeState?.moved) {
            const movedNode = state.nodes.get(state.dragNodeState.nodeId);
            finalizeGraphChange("Block moved", movedNode);
        }
        state.dragNodeState = null;

        if (state.activeLinkStart) {
            state.activeLinkStart = null;
            state.ghostPath = null;
            document.querySelectorAll(".mk-port.pending").forEach((port) => port.classList.remove("pending"));
            redrawLinks();
        }
    });

    window.addEventListener("resize", () => {
        redrawLinks();
        updateSelectionInfo();
        updateFlowSummary();
    });

    mkCanvas.addEventListener("pointerdown", (event) => {
        if (event.target === mkCanvas) {
            setSelected(null, { silent: true });
        }
    });

    addTriggerBtn?.addEventListener("click", () => {
        const position = getSuggestedPosition("trigger");
        createNodeByKey("trigger", getComposerValue(triggerSelect, "on_message"), position.x, position.y);
    });

    addConditionBtn?.addEventListener("click", () => {
        const position = getSuggestedPosition("condition");
        createNodeByKey("condition", getComposerValue(conditionSelect, "contains_link"), position.x, position.y);
    });

    addActionBtn?.addEventListener("click", () => {
        const position = getSuggestedPosition("action");
        createNodeByKey("action", getComposerValue(actionSelect, "timeout_10m"), position.x, position.y);
    });

    buildChainBtn?.addEventListener("click", () => {
        createChain(
            getComposerValue(triggerSelect, "on_message"),
            getComposerValue(conditionSelect, "contains_link"),
            getComposerValue(actionSelect, "timeout_10m"),
        );
    });

    presetButtons.forEach((button) => {
        button.addEventListener("click", () => {
            applyPresetFlow(button.dataset.mkPreset || "");
        });
    });

    autoLayoutBtn?.addEventListener("click", autoLayout);
    clearCanvasBtn?.addEventListener("click", () => clearCanvas(true));
    undoBtn?.addEventListener("click", undo);
    redoBtn?.addEventListener("click", redo);
    exportFlowBtn?.addEventListener("click", exportFlow);
    importTriggerBtn?.addEventListener("click", () => importInput?.click());

    importInput?.addEventListener("change", async () => {
        const file = importInput.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            importFlowText(text);
        } catch (error) {
            addLog("Import Error", "Selected JSON could not be loaded.");
            pushDebug("Flow import failed", { error: String(error) }, true);
            window.showFlash?.("Import failed", "error");
        } finally {
            importInput.value = "";
        }
    });

    selectedSubtypeInput?.addEventListener("change", autoFillInspectorFromSubtype);
    applyNodeBtn?.addEventListener("click", applySelectedNodeChanges);
    duplicateNodeBtn?.addEventListener("click", duplicateSelectedNode);
    disconnectNodeBtn?.addEventListener("click", detachSelectedNodeLinks);
    deleteNodeBtn?.addEventListener("click", () => {
        if (state.selectedNodeId) removeNode(state.selectedNodeId);
    });

    clearLogBtn?.addEventListener("click", () => {
        if (debugOutput) {
            debugOutput.textContent = state.debugEnabled ? "Debug console cleared." : "Debug disabled.";
        }
        resetLogList();
    });

    const toggleDebug = () => {
        setDebugOpen(!state.debugOpen);
        if (state.debugOpen) {
            state.debugEnabled = true;
            if (debugToggle) debugToggle.checked = true;
            pushDebug("Debug panel opened", serializeState(), true);
            addLog("Debug", "Detailed debug console opened.");
        }
        syncDebugUi();
    };

    debugToggleBtn?.addEventListener("click", toggleDebug);
    inspectorDebugBtn?.addEventListener("click", () => {
        state.debugEnabled = true;
        setDebugOpen(true);
        syncDebugUi();
    });
    debugCloseBtn?.addEventListener("click", () => setDebugOpen(false));
    composerToggleBtn?.addEventListener("click", () => setComposerOpen(!state.composerOpen));
    composerCloseBtn?.addEventListener("click", () => setComposerOpen(false));

    document.querySelectorAll("[data-close-overlay]").forEach((element) => {
        element.addEventListener("click", () => {
            const kind = element.getAttribute("data-close-overlay");
            if (kind === "composer") setComposerOpen(false);
            if (kind === "debug") setDebugOpen(false);
        });
    });

    debugToggle?.addEventListener("change", () => {
        state.debugEnabled = !!debugToggle.checked;
        syncDebugUi();
        pushDebug(state.debugEnabled ? "Debug enabled" : "Debug disabled", serializeState(), true);
    });

    debugLevel?.addEventListener("change", () => {
        pushDebug(`Debug level set to ${debugLevel.value}`, null, true);
    });

    testFlowBtn?.addEventListener("click", () => {
        const report = validateFlow();
        const payload = {
            blocks: state.nodes.size,
            links: state.links.length,
            selected: state.selectedNodeId,
            debug: state.debugEnabled,
            status: report.status,
            issues: report.issues.length,
        };
        addLog("Preview Run", `Flow tested as ${report.status.toLowerCase()} with ${payload.blocks} blocks and ${payload.links} connections.`);
        pushDebug("Flow preview executed", payload, true);
        window.showFlash?.(`Flow preview ${report.status === "Ready" ? "completed" : "reported warnings"}`, report.status === "Ready" ? "success" : "warning");
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
        const modifier = event.ctrlKey || event.metaKey;
        if (event.key === "Escape") {
            if (state.composerOpen) setComposerOpen(false);
            if (state.debugOpen) setDebugOpen(false);
            if (state.fullSizeEnabled) applyFullSizeMode(false);
            return;
        }

        if (isFormTarget(event.target)) {
            if (modifier && event.key.toLowerCase() === "s") {
                event.preventDefault();
                applySelectedNodeChanges();
            }
            return;
        }

        if ((event.key === "Delete" || event.key === "Backspace") && state.selectedNodeId) {
            event.preventDefault();
            removeNode(state.selectedNodeId);
            return;
        }

        if (!modifier) return;

        const lowered = event.key.toLowerCase();
        if (lowered === "d" && state.selectedNodeId) {
            event.preventDefault();
            duplicateSelectedNode();
            return;
        }
        if (lowered === "z" && !event.shiftKey) {
            event.preventDefault();
            undo();
            return;
        }
        if (lowered === "y" || (lowered === "z" && event.shiftKey)) {
            event.preventDefault();
            redo();
            return;
        }
        if (lowered === "s") {
            event.preventDefault();
            persistDraft();
            addLog("Draft Saved", `Stored ${state.nodes.size} blocks locally.`);
            window.showFlash?.("Draft saved locally", "success");
        }
    });

    try {
        const saved = localStorage.getItem("luma_mk_fullsize") === "1";
        applyFullSizeMode(saved);
    } catch (error) {
        syncFullSizeUi();
    }

    syncDebugUi();
    setComposerOpen(false);
    setDebugOpen(false);
    resetLogList();
    syncCanvasStageSize();
    restoreDraft();
    ensureSvgBounds();
    redrawLinks();
    updateSelectionInfo();
    updateFlowSummary();
    recordHistory("Initial draft");
})();