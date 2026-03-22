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
    const testFlowBtn = document.getElementById("mk-test-flow");
    const saveFlowBtn = document.getElementById("mk-save-flow");

    if (!mkWrap || !mkCanvas || !mkConnections || !mkPalette) {
        return;
    }

    const nodes = new Map();
    const links = [];
    let selectedNodeId = null;
    let draggedTemplate = null;
    let dragNodeState = null;
    let activeLinkStart = null;
    let ghostPath = null;
    let nodeCounter = 0;

    const typeColorMap = {
        trigger: "#61caff",
        condition: "#ffd761",
        action: "#7dffa4",
    };

    const canvasRect = () => mkCanvas.getBoundingClientRect();

    function addLog(title, text) {
        if (!mkLogList) return;
        const row = document.createElement("div");
        row.className = "mk-log-item";

        const strong = document.createElement("strong");
        strong.textContent = title;
        row.appendChild(strong);

        const body = document.createTextNode(text);
        row.appendChild(body);

        mkLogList.prepend(row);

        while (mkLogList.children.length > 8) {
            mkLogList.removeChild(mkLogList.lastElementChild);
        }
    }

    function updateSelectionInfo() {
        if (!selectedTitle || !selectedSub || !selectedHelp) return;
        if (!selectedNodeId || !nodes.has(selectedNodeId)) {
            selectedTitle.textContent = "No block selected";
            selectedSub.textContent = "Drop blocks and connect ports to assemble the rule.";
            selectedHelp.textContent = "Select a block on the canvas to view details.";
            return;
        }

        const node = nodes.get(selectedNodeId);
        selectedTitle.textContent = node.title;
        selectedSub.textContent = `Type: ${node.type} | Key: ${node.sub}`;
        selectedHelp.textContent = `Position: (${Math.round(node.x)}, ${Math.round(node.y)}) | Outgoing links: ${links.filter((l) => l.from === node.id).length}`;
    }

    function setSelected(nodeId) {
        selectedNodeId = nodeId;
        document.querySelectorAll(".mk-node").forEach((el) => {
            el.classList.toggle("is-selected", el.dataset.nodeId === nodeId);
        });
        updateSelectionInfo();
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
        const distance = Math.max(60, Math.abs(p2.x - p1.x) * 0.65);
        const c1x = p1.x + distance;
        const c2x = p2.x - distance;
        return `M ${p1.x} ${p1.y} C ${c1x} ${p1.y}, ${c2x} ${p2.y}, ${p2.x} ${p2.y}`;
    }

    function redrawLinks() {
        ensureSvgBounds();
        mkConnections.innerHTML = "";

        links.forEach((link) => {
            const fromNode = nodes.get(link.from);
            const toNode = nodes.get(link.to);
            if (!fromNode || !toNode) return;

            const fromPort = document.querySelector(`.mk-node[data-node-id=\"${link.from}\"] .mk-port.out`);
            const toPort = document.querySelector(`.mk-node[data-node-id=\"${link.to}\"] .mk-port.in`);
            if (!fromPort || !toPort) return;

            const start = getPortCenter(fromPort);
            const end = getPortCenter(toPort);

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("class", "mk-connection");
            path.setAttribute("d", curvePath(start, end));
            mkConnections.appendChild(path);
        });

        if (ghostPath) {
            mkConnections.appendChild(ghostPath);
        }
    }

    function updateMinimap() {
        if (!mkMinimap) return;
        mkMinimap.innerHTML = "";

        const bounds = { w: mkCanvas.clientWidth || 1, h: mkCanvas.clientHeight || 1 };

        nodes.forEach((node) => {
            const dot = document.createElement("span");
            dot.className = "mk-minimap-node";
            dot.style.left = `${(node.x / bounds.w) * 100}%`;
            dot.style.top = `${(node.y / bounds.h) * 100}%`;
            dot.style.background = typeColorMap[node.type] || "#9ba7ff";
            if (node.id === selectedNodeId) {
                dot.style.outline = "2px solid #ffffff";
            }
            mkMinimap.appendChild(dot);
        });
    }

    function makeNodeElement(node) {
        const el = document.createElement("article");
        el.className = "mk-node";
        el.dataset.nodeId = node.id;
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
        el.style.borderColor = typeColorMap[node.type] || "#7180ff";

        el.innerHTML = `
            <div class="mk-node-head">
                <strong>${node.title}</strong>
                <small>${node.sub}</small>
            </div>
            <div class="mk-node-body">${node.type.toUpperCase()} block</div>
            <button class="mk-port in" type="button" title="Input"></button>
            <button class="mk-port out" type="button" title="Output"></button>
        `;

        const head = el.querySelector(".mk-node-head");
        const portOut = el.querySelector(".mk-port.out");
        const portIn = el.querySelector(".mk-port.in");

        el.addEventListener("pointerdown", () => {
            setSelected(node.id);
        });

        head.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            setSelected(node.id);
            dragNodeState = {
                nodeId: node.id,
                startX: event.clientX,
                startY: event.clientY,
                nodeStartX: node.x,
                nodeStartY: node.y,
            };
        });

        portOut.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();

            const start = getPortCenter(portOut);
            ghostPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            ghostPath.setAttribute("class", "mk-connection ghost");
            ghostPath.setAttribute("d", curvePath(start, start));

            activeLinkStart = {
                nodeId: node.id,
                start,
            };
            redrawLinks();
        });

        portIn.addEventListener("pointerup", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!activeLinkStart || activeLinkStart.nodeId === node.id) return;

            const duplicate = links.some((l) => l.from === activeLinkStart.nodeId && l.to === node.id);
            if (!duplicate) {
                links.push({ from: activeLinkStart.nodeId, to: node.id });
                addLog("Link Added", `Connected ${activeLinkStart.nodeId} -> ${node.id}`);
            }

            activeLinkStart = null;
            ghostPath = null;
            redrawLinks();
            updateSelectionInfo();
        });

        return el;
    }

    function createNodeFromTemplate(template, x, y) {
        nodeCounter += 1;
        const node = {
            id: `node-${nodeCounter}`,
            type: template.dataset.type || "action",
            title: template.dataset.title || "Block",
            sub: template.dataset.sub || "block",
            x,
            y,
        };

        nodes.set(node.id, node);
        const nodeEl = makeNodeElement(node);
        mkCanvas.appendChild(nodeEl);
        setSelected(node.id);
        redrawLinks();
        updateMinimap();
        addLog("Block Added", `${node.title} placed on canvas.`);
    }

    mkPalette.querySelectorAll(".mk-block-template").forEach((template) => {
        template.addEventListener("dragstart", () => {
            draggedTemplate = template;
            template.classList.add("is-dragging");
        });
        template.addEventListener("dragend", () => {
            template.classList.remove("is-dragging");
            draggedTemplate = null;
        });
    });

    mkWrap.addEventListener("dragover", (event) => {
        event.preventDefault();
    });

    mkWrap.addEventListener("drop", (event) => {
        event.preventDefault();
        if (!draggedTemplate) return;

        const rect = canvasRect();
        const x = Math.max(16, event.clientX - rect.left - 120);
        const y = Math.max(16, event.clientY - rect.top - 50);
        createNodeFromTemplate(draggedTemplate, x, y);
    });

    window.addEventListener("pointermove", (event) => {
        if (dragNodeState && nodes.has(dragNodeState.nodeId)) {
            const node = nodes.get(dragNodeState.nodeId);
            const dx = event.clientX - dragNodeState.startX;
            const dy = event.clientY - dragNodeState.startY;
            node.x = Math.max(8, dragNodeState.nodeStartX + dx);
            node.y = Math.max(8, dragNodeState.nodeStartY + dy);

            const nodeEl = mkCanvas.querySelector(`.mk-node[data-node-id=\"${node.id}\"]`);
            if (nodeEl) {
                nodeEl.style.left = `${node.x}px`;
                nodeEl.style.top = `${node.y}px`;
            }

            redrawLinks();
            updateMinimap();
            updateSelectionInfo();
        }

        if (activeLinkStart && ghostPath) {
            const wrapRect = mkWrap.getBoundingClientRect();
            const end = {
                x: event.clientX - wrapRect.left,
                y: event.clientY - wrapRect.top,
            };
            ghostPath.setAttribute("d", curvePath(activeLinkStart.start, end));
        }
    });

    window.addEventListener("pointerup", () => {
        dragNodeState = null;

        if (activeLinkStart) {
            activeLinkStart = null;
            ghostPath = null;
            redrawLinks();
        }
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

    testFlowBtn?.addEventListener("click", () => {
        const nodeCount = nodes.size;
        const linkCount = links.length;
        addLog("Preview Run", `Flow tested with ${nodeCount} blocks and ${linkCount} connections.`);
        if (window.showFlash) {
            window.showFlash("Flow preview completed", "ok");
        }
    });

    saveFlowBtn?.addEventListener("click", () => {
        const draft = {
            nodes: Array.from(nodes.values()),
            links: [...links],
            savedAt: new Date().toISOString(),
        };
        localStorage.setItem("luma-mk-script-draft", JSON.stringify(draft));
        addLog("Draft Saved", `Stored ${draft.nodes.length} blocks locally.`);
        if (window.showFlash) {
            window.showFlash("Draft saved locally", "ok");
        }
    });

    const previous = localStorage.getItem("luma-mk-script-draft");
    if (previous) {
        try {
            const parsed = JSON.parse(previous);
            if (Array.isArray(parsed.nodes)) {
                parsed.nodes.forEach((nodeData) => {
                    nodeCounter = Math.max(nodeCounter, Number(String(nodeData.id).replace("node-", "")) || 0);
                    nodes.set(nodeData.id, {
                        id: nodeData.id,
                        type: nodeData.type || "action",
                        title: nodeData.title || "Block",
                        sub: nodeData.sub || "block",
                        x: Number(nodeData.x) || 24,
                        y: Number(nodeData.y) || 24,
                    });
                    mkCanvas.appendChild(makeNodeElement(nodes.get(nodeData.id)));
                });
            }
            if (Array.isArray(parsed.links)) {
                parsed.links.forEach((ln) => {
                    if (ln && nodes.has(ln.from) && nodes.has(ln.to)) {
                        links.push({ from: ln.from, to: ln.to });
                    }
                });
            }
            addLog("Draft Loaded", `Recovered ${nodes.size} blocks from local draft.`);
        } catch {
            addLog("Draft Error", "Could not parse previous draft.");
        }
    }

    ensureSvgBounds();
    redrawLinks();
    updateMinimap();
    updateSelectionInfo();
})();
