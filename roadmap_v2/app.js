// State
let manifestData = null;
let workflowsData = null;
let dashboardData = null;
let auditDetailsData = null;
let securityScansData = null;
let currentView = 'dashboard';
let panZoomInstance = null;

// Global handlers for Mermaid clicks
window.handleBugClick = function (bugId) {
    console.log("handleBugClick", bugId);
    navigateTo('bug', bugId);
};

window.handleWorkflowClick = function (workflowId) {
    console.log("handleWorkflowClick", workflowId);
    navigateTo('workflow', workflowId);
};

window.handleMasterNodeClick = function (nodeId) {
    console.log("handleMasterNodeClick", nodeId);
    
    const svg = document.querySelector('.mermaid svg');
    if (!svg) return;

    if (window.currentHighlightedNode === nodeId) {
        window.clearHighlight();
        return;
    }
    window.currentHighlightedNode = nodeId;

    const connections = parseMermaidConnections(workflowsData['master'].mermaid);
    const flowNodes = getFlowNodes(nodeId, connections);
    
    // Nodes
    const nodes = svg.querySelectorAll('.node');
    nodes.forEach(node => {
        const idAttr = node.getAttribute('id') || '';
        
        let isNodeInFlow = Array.from(flowNodes).some(fn => {
             const regex = new RegExp(`(^|\\-)${fn}(\\-|$)`);
             return regex.test(idAttr);
        });

        if (isNodeInFlow) {
            node.classList.add('highlighted');
            node.classList.remove('dimmed');
        } else {
            node.classList.add('dimmed');
            node.classList.remove('highlighted');
        }
    });

    // Edges
    const edges = svg.querySelectorAll('.edgePath, .edgePaths path, .edgePaths g');
    edges.forEach(edge => {
        const classAttr = edge.getAttribute('class') || '';
        const idAttr = edge.getAttribute('id') || '';
        
        let isEdgeInFlow = false;
        const lsMatch = classAttr.match(/ls-([a-zA-Z0-9_]+)/);
        const leMatch = classAttr.match(/le-([a-zA-Z0-9_]+)/);
        
        if (lsMatch && leMatch) {
            if (flowNodes.has(lsMatch[1]) && flowNodes.has(leMatch[1])) {
                isEdgeInFlow = true;
            }
        } else {
            for (const conn of connections) {
                if (flowNodes.has(conn.from) && flowNodes.has(conn.to)) {
                    if (idAttr.includes(`L-${conn.from}-${conn.to}`)) {
                        isEdgeInFlow = true;
                        break;
                    }
                }
            }
        }

        if (isEdgeInFlow) {
            edge.classList.add('highlighted');
            edge.classList.remove('dimmed');
        } else {
            edge.classList.add('dimmed');
            edge.classList.remove('highlighted');
        }
    });
    
    let clearBtn = document.getElementById('clear-highlight-btn');
    if (!clearBtn) {
        const viewControls = document.getElementById('view-controls');
        clearBtn = document.createElement('button');
        clearBtn.id = 'clear-highlight-btn';
        clearBtn.className = 'btn';
        clearBtn.style.background = 'var(--danger)';
        clearBtn.style.borderColor = 'var(--danger)';
        clearBtn.innerHTML = '❌ Xóa Highlight';
        clearBtn.onclick = window.clearHighlight;
        viewControls.appendChild(clearBtn);
    }
    clearBtn.style.display = 'inline-flex';
};

window.clearHighlight = function() {
    window.currentHighlightedNode = null;
    const svg = document.querySelector('.mermaid svg');
    if (!svg) return;
    
    svg.querySelectorAll('.node, .edgePaths path, .edgePaths g').forEach(el => {
        el.classList.remove('highlighted', 'dimmed');
    });
    
    const clearBtn = document.getElementById('clear-highlight-btn');
    if (clearBtn) clearBtn.style.display = 'none';
};

function parseMermaidConnections(mermaidStr) {
    const connections = [];
    const lines = mermaidStr.split('\n');
    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('%%')) continue;
        
        const arrowMatch = line.match(/(-->|---|-\.->|==>|<-->)/);
        if (!arrowMatch) continue;
        
        const arrowIdx = arrowMatch.index;
        const leftPart = line.substring(0, arrowIdx).trim();
        let rightPart = line.substring(arrowIdx + arrowMatch[0].length).trim();
        
        rightPart = rightPart.replace(/^\|[^\|]+\|\s*/, '').trim();
        
        const fromNode = leftPart.match(/^([a-zA-Z0-9_]+)/);
        const toNode = rightPart.match(/^([a-zA-Z0-9_]+)/);
        
        if (fromNode && toNode) {
            connections.push({ from: fromNode[1], to: toNode[1] });
        }
    }
    return connections;
}

function getFlowNodes(startNodeId, connections) {
    const reachable = new Set();
    reachable.add(startNodeId);
    
    let queue = [startNodeId];
    while (queue.length > 0) {
        const curr = queue.shift();
        connections.forEach(c => {
            if (c.from === curr && !reachable.has(c.to)) {
                reachable.add(c.to);
                queue.push(c.to);
            }
        });
    }
    
    queue = [startNodeId];
    while (queue.length > 0) {
        const curr = queue.shift();
        connections.forEach(c => {
            if (c.to === curr && !reachable.has(c.from)) {
                reachable.add(c.from);
                queue.push(c.from);
            }
        });
    }
    
    return reachable;
}

// Global handler for toggling audit details
window.toggleAuditDetails = function () {
    const detailsDiv = document.getElementById('audit-details-container');
    const btn = document.getElementById('btn-toggle-audit');
    if (detailsDiv.style.display === 'none') {
        detailsDiv.style.display = 'block';
        btn.innerHTML = '🔼 Ẩn Báo Cáo Chi Tiết';
    } else {
        detailsDiv.style.display = 'none';
        btn.innerHTML = '📄 Xem Báo Cáo Chi Tiết';
    }
};

window.toggleFixedBugs = function (moduleId) {
    const el = document.getElementById(`fixed-bugs-${moduleId}`);
    const btn = document.getElementById(`btn-fixed-bugs-${moduleId}`);
    if (el.style.display === 'none') {
        el.style.display = 'block';
        btn.innerHTML = `🔼 Ẩn các bug đã fix`;
    } else {
        el.style.display = 'none';
        btn.innerHTML = `🔽 Xem các bug đã fix (${el.dataset.count})`;
    }
};

window.toggleChangelogDetails = function (logId) {
    const el = document.getElementById(`changelog-details-${logId}`);
    const btn = document.getElementById(`btn-changelog-${logId}`);
    if (el.style.display === 'none') {
        el.style.display = 'block';
        btn.innerHTML = `🔼 Thu gọn`;
    } else {
        el.style.display = 'none';
        btn.innerHTML = `🔽 Xem chi tiết`;
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
        flowchart: { useMaxWidth: false, htmlLabels: true, curve: 'basis' }
    });

    await loadData();
    renderSidebar();
    navigateTo('dashboard');
});

// Fetch Data
async function loadData() {
    try {
        const freshData = { cache: 'no-store' };
        const [manifestRes, workflowsRes, dashboardRes, auditDetailsRes, securityScansRes] = await Promise.all([
            fetch('data/manifest.json', freshData),
            fetch('data/workflows.json', freshData),
            fetch('data/dashboard.json', freshData),
            fetch('data/audit-details.json', freshData),
            fetch('data/security-scans.json', freshData)
        ]);
        manifestData = await manifestRes.json();
        workflowsData = await workflowsRes.json();
        dashboardData = await dashboardRes.json();
        auditDetailsData = await auditDetailsRes.json();
        securityScansData = await securityScansRes.json();
    } catch (e) {
        console.error("Failed to load data:", e);
        document.getElementById('dynamic-content').innerHTML = `<h3 style="color:red">Lỗi tải dữ liệu JSON</h3>`;
    }
}

// Render Sidebar
function renderSidebar() {
    const menu = document.getElementById('sidebar-menu');
    let html = `
        <a class="menu-item" id="nav-dashboard" onclick="navigateTo('dashboard')">📊 Dashboard Tổng</a>
        
        <div class="menu-section">
            <div class="menu-title">🧩 Luồng Xử Lý (Workflows)</div>
    `;

    for (const [id, wf] of Object.entries(workflowsData)) {
        html += `<a class="menu-item" id="nav-${id}" onclick="navigateTo('workflow', '${id}')">${wf.icon} ${wf.title.replace('Workflow ', '').replace(' Chi Tiết', '')}</a>`;
    }

    html += `
        </div>
        
        <div class="menu-section">
            <div class="menu-title">🐛 Lỗi & Lộ Trình</div>
            <a class="menu-item" id="nav-bugs" onclick="navigateTo('bugs')">🐛 Quản Lý Bug</a>
            <a class="menu-item" id="nav-roadmap" onclick="navigateTo('roadmap')">🚀 Lộ Trình & Tính Năng</a>
        </div>
        
        <div class="menu-section">
            <div class="menu-title">🤖 AI Automation</div>
            <a class="menu-item" id="nav-ai-plans" onclick="navigateTo('ai-plans')">📝 AI Plans & Tasks</a>
        </div>
        
        <div class="menu-section">
            <div class="menu-title">🛡️ Đảm Bảo Chất Lượng</div>
            <a class="menu-item" id="nav-audit" onclick="navigateTo('audit')">📋 Lịch Sử Kiểm Định (Audits)</a>
            <a class="menu-item" id="nav-security-scans" onclick="navigateTo('security-scans')">🔒 Security Scans</a>
            <a class="menu-item" id="nav-dependencies" onclick="navigateTo('dependencies')">📦 Dependencies</a>
        </div>
    `;
    menu.innerHTML = html;
}

// Navigation Logic
async function navigateTo(view, param = null) {
    // Update Active Menu
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));

    const loader = document.getElementById('loader');
    const content = document.getElementById('dynamic-content');
    const viewTitle = document.getElementById('view-title');
    const viewControls = document.getElementById('view-controls');

    if (panZoomInstance) {
        panZoomInstance.destroy();
        panZoomInstance = null;
    }

    loader.classList.remove('hidden');
    content.innerHTML = '';
    viewControls.innerHTML = '';

    // Small delay for UI smoothness
    await new Promise(r => setTimeout(r, 100));

    if (view === 'dashboard') {
        document.getElementById('nav-dashboard').classList.add('active');
        viewTitle.innerHTML = '📊 Project Dashboard';
        renderDashboard();
    } else if (view === 'bugs') {
        document.getElementById('nav-bugs').classList.add('active');
        viewTitle.innerHTML = '🐛 Quản Lý Bug';
        renderBugsView();
    } else if (view === 'roadmap') {
        document.getElementById('nav-roadmap').classList.add('active');
        viewTitle.innerHTML = '🚀 Lộ Trình & Tính Năng';
        renderRoadmapView();
    } else if (view === 'ai-plans') {
        document.getElementById('nav-ai-plans').classList.add('active');
        viewTitle.innerHTML = '🤖 AI Plan & Tasks';
        renderAIPlansView();
    } else if (view === 'audit') {
        document.getElementById('nav-audit').classList.add('active');
        viewTitle.innerHTML = '📋 Báo Cáo Kiểm Định';
        renderAuditView();
    } else if (view === 'security-scans') {
        document.getElementById('nav-security-scans').classList.add('active');
        viewTitle.innerHTML = '🔒 Security Scans & Data Protection';
        renderSecurityScansView();
    } else if (view === 'dependencies') {
        document.getElementById('nav-dependencies').classList.add('active');
        viewTitle.innerHTML = '📦 Dependencies & Packages';
        renderDependenciesView();
    } else if (view === 'workflow') {
        const targetNav = document.getElementById(`nav-${param}`);
        if (targetNav) targetNav.classList.add('active');
        viewTitle.innerHTML = workflowsData[param].icon + ' ' + workflowsData[param].title;
        await renderWorkflow(param);
    } else if (view === 'bug') {
        viewTitle.innerHTML = '🐛 Chi tiết Bug';
        viewControls.innerHTML = `<button class="btn" onclick="navigateTo('bugs')">⬅ Quay lại</button>`;
        renderBug(param);
    }

    loader.classList.add('hidden');
}


// Render Dashboard
function renderDashboard() {
    const content = document.getElementById('dynamic-content');

    const totalBugs = manifestData.bugs.length;
    const fixedBugs = manifestData.bugs.filter(i => i.status === 'fixed' || i.status === 'verified').length;
    const progress = totalBugs === 0 ? 100 : Math.round((fixedBugs / totalBugs) * 100);
    const openBugs = manifestData.bugs.filter(i => i.status === 'open');

    let html = `
        <div class="dashboard-view">
            <div class="stats-grid">
                <div class="stat-card">
                    <div style="color: var(--text-secondary)">Tiến độ dự án</div>
                    <div class="stat-value" style="color: ${progress === 100 ? 'var(--success)' : 'var(--accent-color)'}">${progress}%</div>
                </div>
                <div class="stat-card">
                    <div style="color: var(--text-secondary)">Bugs đã vá</div>
                    <div class="stat-value" style="color: var(--success)">${fixedBugs}</div>
                </div>
                <div class="stat-card">
                    <div style="color: var(--text-secondary)">Bugs đang mở</div>
                    <div class="stat-value" style="color: var(--danger)">${openBugs.length}</div>
                </div>
            </div>

            <div style="margin-bottom: 30px;"></div>
    `;

    if (openBugs.length > 0) {
        html += `
            <h3 style="margin-bottom: 15px; color: var(--danger);">🔥 Bugs Đang Mở (${openBugs.length})</h3>
            <div class="bug-list" style="margin-bottom: 2rem;">
        `;
        openBugs.forEach(bug => {
            html += `
                <div class="bug-item" onclick="navigateTo('bug', '${bug.id}')">
                    <div style="display:flex; align-items:center; gap: 15px;">
                        <span class="bug-id">${bug.id}</span>
                        <span>${bug.title}</span>
                    </div>
                    <span class="badge badge-${bug.severity}">${bug.severity}</span>
                </div>
            `;
        });
        html += `</div>`;
    }

    // CORE PRINCIPLES
    if (dashboardData.corePrinciples && dashboardData.corePrinciples.length > 0) {
        html += `
            <h3 style="margin-bottom: 15px; color: var(--accent-color);">💎 Nguyên Tắc Cốt Lõi</h3>
            <div class="grid">
        `;
        dashboardData.corePrinciples.forEach(cp => {
            html += `
                <div class="card">
                    <div class="card-title">${cp.topic}</div>
                    <div class="card-desc" style="line-height:1.5;">${cp.rule}</div>
                </div>
            `;
        });
        html += `</div>`;
    }

    // AUDIT REPORT
    if (dashboardData.auditReport && dashboardData.auditReport.categories) {
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 style="margin: 0; color: var(--accent-color);">📋 Báo Cáo Kiểm Định (${dashboardData.auditReport.date})</h3>
                <a href="../roadmap/audit-report.html" target="_blank" class="btn" style="background: rgba(56, 189, 248, 0.1); color: var(--accent-color); border: 1px solid var(--accent-color); text-decoration: none;">📄 Xem Báo Cáo Chi Tiết</a>
            </div>
            <div class="grid">
        `;
        dashboardData.auditReport.categories.forEach(cat => {
            html += `
                <div class="card" style="border-left: 3px solid var(--${cat.color});">
                    <div class="card-title">
                        ${cat.name}
                        <span class="badge badge-${cat.color}">${cat.status}</span>
                    </div>
                    <ul class="task-list">
            `;
            cat.items.forEach(item => {
                html += `<li class="task-item mini" style="line-height:1.4;">${item}</li>`;
            });
            html += `
                    </ul>
                </div>
            `;
        });
        html += `</div>`;
    }

    // SCALING ROADMAP
    if (dashboardData.scalingRoadmap && dashboardData.scalingRoadmap.length > 0) {
        html += `
            <h3 style="margin-bottom: 15px; color: var(--accent-color);">🚀 Scaling Roadmap</h3>
            <div class="grid">
        `;
        dashboardData.scalingRoadmap.forEach(item => {
            let badgeColorStyle = item.color === 'purple' ? 'background: rgba(168, 85, 247, 0.2); color: #c084fc;'
                : item.color.startsWith('#') || item.color.startsWith('var') ? `background: rgba(0,0,0,0.2); border:1px solid ${item.color}; color: ${item.color};`
                    : '';
            let badgeClass = badgeColorStyle ? 'badge' : `badge badge-${item.color}`;
            let badgeStyleAttr = badgeColorStyle ? `style="${badgeColorStyle}"` : '';

            html += `
                <div class="card">
                    <div class="card-title">
                        ${item.name}
                        <span class="${badgeClass}" ${badgeStyleAttr}>${item.status}</span>
                    </div>
                    <div class="card-desc" style="line-height:1.5;">${item.desc}</div>
                    <ul class="task-list">
            `;
            item.tasks.forEach(task => {
                const isDone = item.status === 'DONE' || item.status === 'COMPLETED' || task.includes('<b>Đã');
                html += `
                        <li class="task-item">
                            <div class="checkbox ${isDone ? 'done' : ''}"></div>
                            <div style="font-size: 0.85rem; line-height:1.4; ${isDone ? 'color: var(--text-secondary); text-decoration: line-through;' : ''}">${task}</div>
                        </li>
                `;
            });
            html += `</ul>`;

            if (item.details) {
                html += `
                    <details>
                        <summary>Xem chi tiết</summary>
                        <pre style="margin-top:0.5rem; font-size:0.75rem; color:var(--text-secondary); background:rgba(0,0,0,0.3); padding:0.5rem; border-radius:4px; overflow-x:auto;"><code>${item.details.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
                    </details>
                `;
            }
            html += `</div>`;
        });
        html += `</div>`;
    }

    // MODULE BUGS
    if (dashboardData.moduleBugs && dashboardData.moduleBugs.length > 0) {
        html += `
            <h3 style="margin-bottom: 15px; color: var(--accent-color);">🔥 Bug Theo Module</h3>
            <div class="grid">
        `;
        dashboardData.moduleBugs.forEach((mod, modIdx) => {
            let titleColor = mod.color.startsWith('var') ? mod.color : `var(--${mod.color})`;
            html += `
                <div class="card">
                    <div class="card-title" style="color: ${titleColor}">${mod.module}</div>
                    <ul class="task-list">
            `;

            const openModBugs = mod.bugs.filter(b => b.status !== 'fixed' && b.status !== 'verified');
            const fixedModBugs = mod.bugs.filter(b => b.status === 'fixed' || b.status === 'verified');

            // Render open bugs
            openModBugs.forEach(bug => {
                const bugManifest = manifestData.bugs.find(b => b.id === bug.id);
                const hasDetails = bugManifest ? `onclick="navigateTo('bug', '${bug.id}')" style="cursor:pointer;" title="Click để xem chi tiết"` : '';
                const hoverStyle = bugManifest ? `onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'"` : '';

                html += `
                    <li class="task-item" ${hasDetails} ${hoverStyle}>
                        <div class="checkbox"></div>
                        <div style="font-size: 0.85rem; line-height:1.4; color: var(--text-color);">
                            <b>[${bug.id}]</b> ${bug.title}
                        </div>
                    </li>
                `;
            });
            html += `</ul>`;

            // Render fixed bugs toggle
            if (fixedModBugs.length > 0) {
                const modId = `mod-${modIdx}`;
                html += `
                    <div style="margin-top: 10px; border-top: 1px dashed var(--border-color); padding-top: 10px;">
                        <button id="btn-fixed-bugs-${modId}" class="btn" style="background:transparent; border:none; color:var(--text-secondary); font-size: 0.8rem; padding: 5px; cursor: pointer;" onclick="toggleFixedBugs('${modId}')">🔽 Xem các bug đã fix (${fixedModBugs.length})</button>
                    </div>
                    <div id="fixed-bugs-${modId}" data-count="${fixedModBugs.length}" style="display: none; margin-top: 10px;">
                        <ul class="task-list">
                `;
                fixedModBugs.forEach(bug => {
                    const bugManifest = manifestData.bugs.find(b => b.id === bug.id);
                    const hasDetails = bugManifest ? `onclick="navigateTo('bug', '${bug.id}')" style="cursor:pointer;" title="Click để xem chi tiết"` : '';
                    const hoverStyle = bugManifest ? `onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'"` : '';

                    html += `
                        <li class="task-item" ${hasDetails} ${hoverStyle}>
                            <div class="checkbox done"></div>
                            <div style="font-size: 0.85rem; line-height:1.4; color: var(--text-secondary); text-decoration: line-through;">
                                <b>[${bug.id}]</b> ${bug.title}
                            </div>
                        </li>
                    `;
                });
                html += `</ul></div>`;
            }
            html += `</div>`; // end card
        });
        html += `</div>`;
    }

    // CHANGELOG
    if (dashboardData.changelog && dashboardData.changelog.length > 0) {
        html += `
            <h3 style="margin-bottom: 15px; color: var(--accent-color);">📝 Nhật Ký Thay Đổi</h3>
            <div class="card" style="margin-bottom: 2rem;">
        `;
        dashboardData.changelog.forEach((log, logIdx) => {
            const color = log.color || 'accent-color';
            const logColor = color === 'purple' ? '#c084fc' : (color.startsWith('var') ? color : `var(--${color})`);
            const logDesc = log.desc || log.summary || log.title || '';
            html += `
                <div class="log-item">
                    <div class="log-date" style="color: ${logColor}">${log.date}</div>
                    <div style="font-size: 0.85rem; line-height: 1.5; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: flex-start;">
                        <span>${logDesc}</span>
            `;

            if (log.details) {
                const logId = `log-${logIdx}`;
                html += `
                        <button id="btn-changelog-${logId}" class="btn" style="background:transparent; border:1px solid var(--border-color); color:var(--text-secondary); font-size: 0.75rem; padding: 2px 8px; cursor: pointer; border-radius: 4px; white-space: nowrap; margin-left: 10px;" onclick="toggleChangelogDetails('${logId}')">🔽 Xem chi tiết</button>
                    </div>
                    <div id="changelog-details-${logId}" style="display: none; border-left: 2px solid var(--border-color); margin-left: 5px; padding-left: 10px; margin-top: 5px;">
                        <ul class="task-list" style="margin: 0;">
                `;
                log.details.forEach(detail => {
                    html += `<li class="task-item mini" style="border:none; padding: 2px 0;">- ${detail}</li>`;
                });
                html += `</ul></div>`;
            } else {
                html += `</div>`;
            }

            html += `</div>`;
        });
        html += `</div>`;
    }

    html += `</div>`;
    content.innerHTML = html;
}

// Render Workflow (Mermaid)
async function renderWorkflow(id) {
    const content = document.getElementById('dynamic-content');
    const wf = workflowsData[id];

    const viewControls = document.getElementById('view-controls');
    viewControls.innerHTML = `
        <button class="btn" id="reset-btn">🔄 Reset View</button>
        <button class="btn" id="zoom-in-btn">➕ Zoom In</button>
        <button class="btn" id="zoom-out-btn">➖ Zoom Out</button>
    `;

    // Wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'workflow-view';

    const mermaidDiv = document.createElement('div');
    mermaidDiv.className = 'mermaid';
    mermaidDiv.id = 'mermaid-graph';
    mermaidDiv.textContent = wf.mermaid;

    wrapper.appendChild(mermaidDiv);
    content.appendChild(wrapper);

    try {
        await mermaid.run({ querySelector: '.mermaid' });
        const svgElement = document.querySelector('.mermaid svg');
        if (svgElement) {
            svgElement.style.width = '100%';
            svgElement.style.height = '100%';

            panZoomInstance = svgPanZoom(svgElement, {
                zoomEnabled: true,
                controlIconsEnabled: false,
                fit: true,
                center: true,
                minZoom: 0.1,
                maxZoom: 10,
                zoomScaleSensitivity: 0.2
            });

            document.getElementById('reset-btn').addEventListener('click', () => {
                panZoomInstance.resize(); panZoomInstance.fit(); panZoomInstance.center();
            });
            document.getElementById('zoom-in-btn').addEventListener('click', () => panZoomInstance.zoomIn());
            document.getElementById('zoom-out-btn').addEventListener('click', () => panZoomInstance.zoomOut());
        }
    } catch (e) {
        console.error("Mermaid error:", e);
        content.innerHTML = `<div style="padding: 20px; color: red;">Lỗi vẽ biểu đồ: ${e.message}</div>`;
    }
}

// Render Bug Detail
function renderBug(id) {
    const content = document.getElementById('dynamic-content');
    const bug = manifestData.bugs.find(i => i.id === id);

    if (!bug) return;

    let html = `
        <div class="bug-detail-view">
            <h2 style="color: var(--accent-color); margin-top:0;">[${bug.id}] ${bug.title}</h2>
            <div style="margin-bottom: 20px;">
                <span class="badge badge-${bug.severity}">Mức độ: ${bug.severity}</span>
                <span class="badge" style="background:#334155; margin-left: 10px;">Module: ${bug.module}</span>
            </div>

            <h3>Symptom (Triệu chứng)</h3>
            <p style="line-height: 1.6;">${bug.symptom || 'Chưa cập nhật'}</p>

            ${bug.cause ? `<h3>Nguyên nhân (Cause)</h3><p style="line-height: 1.6;">${bug.cause}</p>` : ''}
            
            ${bug.solution ? `<h3>Giải pháp (Solution)</h3><p style="line-height: 1.6;">${bug.solution}</p>` : ''}
            
            ${bug.code ? `<h3>Code Fix</h3><pre style="background:var(--bg-card); padding:15px; border-radius:5px; overflow-x:auto;"><code>${bug.code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>` : ''}

            ${bug.fixHint && !bug.solution ? `<h3>Gợi ý Fix (Fix Hint)</h3><p style="line-height: 1.6;">${bug.fixHint}</p>` : ''}

            <h3>Files Ảnh Hưởng</h3>
            <div class="bug-files">
                ${bug.affectedFiles ? bug.affectedFiles.join('<br>') : 'Chưa xác định'}
            </div>
            
            <div style="margin-top: 30px;">
                ${bug.status !== 'fixed' && bug.status !== 'verified' ? `<button class="btn" style="background:var(--success); border-color:var(--success);" onclick="alert('Tính năng cập nhật trạng thái sẽ tích hợp sau')">Đánh dấu đã Vá (Fixed)</button>` : `<div style="color:var(--success); font-weight:bold;">✅ Bug này đã được vá</div>`}
            </div>
        </div>
    `;

    content.innerHTML = html;
}

// Render Bugs View
function renderBugsView() {
    const content = document.getElementById('dynamic-content');

    const openBugs = manifestData.bugs.filter(i => i.status === 'open');
    const fixedBugs = manifestData.bugs.filter(i => i.status === 'fixed' || i.status === 'verified');

    let html = `<div class="dashboard-view">`;

    if (openBugs.length > 0) {
        html += `<h3 style="color: var(--danger); margin-bottom: 15px;">🔥 Bugs Đang Mở (${openBugs.length})</h3>
                 <div class="grid">`;
        openBugs.forEach(bug => {
            html += `
                <div class="card" onclick="navigateTo('bug', '${bug.id}')" style="cursor: pointer; transition: 0.2s; border-left: 4px solid var(--danger);" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <span class="bug-id">${bug.id}</span>
                            <h4 style="margin: 10px 0; font-size: 1.1rem;">${bug.title}</h4>
                            <span class="badge" style="background:#334155;">Module: ${bug.module}</span>
                        </div>
                        <span class="badge badge-${bug.severity}">${bug.severity}</span>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }

    if (fixedBugs.length > 0) {
        html += `<h3 style="color: var(--success); margin-top: 30px; margin-bottom: 15px;">✅ Bugs Đã Vá (${fixedBugs.length})</h3>
                 <div class="grid">`;
        fixedBugs.forEach(bug => {
            html += `
                <div class="card" onclick="navigateTo('bug', '${bug.id}')" style="cursor: pointer; opacity: 0.7; transition: 0.2s; border-left: 4px solid var(--success);" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <span class="bug-id" style="color: var(--success); border-color: var(--success); background: rgba(34, 197, 94, 0.1);">${bug.id}</span>
                            <h4 style="margin: 10px 0; color: var(--text-secondary); text-decoration: line-through; font-size: 1.1rem;">${bug.title}</h4>
                            <span class="badge" style="background:#334155;">Module: ${bug.module}</span>
                        </div>
                        <span class="badge badge-success">Fixed</span>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }

    html += `</div>`;
    content.innerHTML = html;
}

// Render Roadmap View
function renderRoadmapView() {
    const content = document.getElementById('dynamic-content');
    let html = `<div class="dashboard-view">`;

    if (dashboardData.scalingRoadmap && dashboardData.scalingRoadmap.length > 0) {
        html += `<div class="grid">`;
        dashboardData.scalingRoadmap.forEach(item => {
            let badgeColorStyle = item.color === 'purple' ? 'background: rgba(168, 85, 247, 0.2); color: #c084fc;'
                : item.color.startsWith('#') || item.color.startsWith('var') ? `background: rgba(0,0,0,0.2); border:1px solid ${item.color}; color: ${item.color};`
                    : '';
            let badgeClass = badgeColorStyle ? 'badge' : `badge badge-${item.color}`;
            let badgeStyleAttr = badgeColorStyle ? `style="${badgeColorStyle}"` : '';

            html += `
                <div class="card">
                    <div class="card-title">
                        ${item.name}
                        <span class="${badgeClass}" ${badgeStyleAttr}>${item.status}</span>
                    </div>
                    <div class="card-desc" style="line-height:1.5;">${item.desc}</div>
                    <ul class="task-list">
            `;
            item.tasks.forEach(task => {
                const isDone = item.status === 'DONE' || item.status === 'COMPLETED' || task.includes('<b>Đã');
                html += `
                        <li class="task-item">
                            <div class="checkbox ${isDone ? 'done' : ''}"></div>
                            <div style="font-size: 0.85rem; line-height:1.4; ${isDone ? 'color: var(--text-secondary); text-decoration: line-through;' : ''}">${task}</div>
                        </li>
                `;
            });
            html += `</ul>`;

            if (item.details) {
                html += `
                    <details>
                        <summary>Xem chi tiết</summary>
                        <pre style="margin-top:0.5rem; font-size:0.75rem; color:var(--text-secondary); background:rgba(0,0,0,0.3); padding:0.5rem; border-radius:4px; overflow-x:auto;"><code>${item.details.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
                    </details>
                `;
            }
            html += `</div>`;
        });
        html += `</div>`;
    } else {
        html += `<p style="color: var(--text-secondary);">Chưa có thông tin roadmap.</p>`;
    }

    html += `</div>`;
    content.innerHTML = html;
}

// Render Audit View
function renderAuditView() {
    const content = document.getElementById('dynamic-content');
    let html = `<div class="dashboard-view">`;

    // Render Summary First
    if (dashboardData.auditReport && dashboardData.auditReport.categories) {
        html += `
            <div style="background: var(--sidebar-bg); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; margin-bottom: 30px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--border-color);">
                    <div>
                        <h3 style="margin: 0; color: var(--accent-color); font-size: 1.2rem;">📋 Báo Cáo Kiểm Định (${dashboardData.auditReport.date})</h3>
                        <div style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 5px;">Audit toàn diện hệ thống chuẩn bị cho chiến dịch marketing fixphone.vn — ${dashboardData.auditReport.categories.length} hạng mục chính.</div>
                    </div>
                    <button id="btn-toggle-audit" onclick="toggleAuditDetails()" class="btn" style="background: rgba(56, 189, 248, 0.1); color: var(--accent-color); border: 1px solid var(--accent-color); cursor: pointer;">📄 Xem Báo Cáo Chi Tiết</button>
                </div>
                <div class="grid">
        `;
        dashboardData.auditReport.categories.forEach(cat => {
            html += `
                <div class="card" style="border-left: 3px solid var(--${cat.color});">
                    <div class="card-title">
                        ${cat.name}
                        <span class="badge badge-${cat.color}">${cat.status}</span>
                    </div>
                    <ul class="task-list">
            `;
            cat.items.forEach(item => {
                html += `<li class="task-item mini" style="line-height:1.4;">${item}</li>`;
            });
            html += `
                    </ul>
                </div>
            `;
        });
        html += `</div></div>`;
    }

    // Hidden Details Container
    html += `<div id="audit-details-container" style="display: none; border-top: 1px dashed var(--border-color); padding-top: 20px; margin-top: 20px;">`;

    if (auditDetailsData) {
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div>
                    <h3 style="margin: 0; color: var(--accent-color); font-size: 1.2rem;">🔍 Chi Tiết Kết Quả Kiểm Định</h3>
                    <div style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 5px;">Người thực hiện: ${auditDetailsData.auditor}</div>
                </div>
            </div>
            
            <div class="grid" style="margin-bottom: 30px;">
        `;

        // Render Scores
        if (auditDetailsData.scores) {
            auditDetailsData.scores.forEach(score => {
                const color = score.status === 'pass' ? 'var(--success)' : (score.status === 'warn' ? 'var(--warning)' : 'var(--danger)');
                html += `
                    <div class="card" style="text-align: center; border-left: 3px solid ${color};">
                        <div style="font-size: 2rem; font-weight: bold; color: ${color}; margin-bottom: 10px;">${score.value}</div>
                        <div style="color: var(--text-secondary); font-size: 0.9rem;">${score.label}</div>
                    </div>
                `;
            });
        }

        html += `</div>`; // Close grid

        // Render Sections
        if (auditDetailsData.sections) {
            auditDetailsData.sections.forEach(sec => {
                html += `
                    <div class="card" style="border-left: 4px solid var(--${sec.color || 'accent-color'}); margin-bottom: 20px;">
                        <h3 style="color: var(--${sec.color || 'text-primary'}); margin-top: 0;">${sec.title}</h3>
                        ${sec.desc ? `<p style="color: var(--text-secondary); font-style: italic; margin-bottom: 15px;">${sec.desc}</p>` : ''}
                        <div class="audit-content">
                            ${sec.content}
                        </div>
                    </div>
                `;
            });
        }
    } else {
        html += `<p style="color: var(--text-secondary);">Chưa có báo cáo kiểm định chi tiết.</p>`;
    }

    html += `</div>`; // Close details container
    html += `</div>`; // Close dashboard view
    content.innerHTML = html;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderSecurityScansView() {
    const content = document.getElementById('dynamic-content');
    if (!securityScansData || !Array.isArray(securityScansData.files)) {
        content.innerHTML = `<p style="color: var(--text-secondary);">Chưa có danh mục security scan.</p>`;
        return;
    }

    let fileList = '';
    securityScansData.files.forEach((file, index) => {
        fileList += `
            <button type="button" id="security-file-${file.id}" class="security-file-item ${index === 0 ? 'active' : ''}" onclick="loadSecurityScanFile('${file.id}')">
                <span class="security-file-order">${escapeHtml(file.order)}</span>
                <span class="security-file-meta">
                    <strong>${escapeHtml(file.label)}</strong>
                    <small>${escapeHtml(file.type)} · ${escapeHtml(file.description)}</small>
                </span>
                <span class="badge badge-${file.status === 'fixed' ? 'success' : 'info'}">${escapeHtml(file.status)}</span>
            </button>
        `;
    });

    const releaseGate = securityScansData.releaseGate
        .map(item => `<li>${escapeHtml(item)}</li>`)
        .join('');

    content.innerHTML = `
        <div class="security-scan-header">
            <div>
                <p class="security-eyebrow">${escapeHtml(securityScansData.date)} · ${escapeHtml(securityScansData.branch)}</p>
                <h3>${escapeHtml(securityScansData.title)}</h3>
                <p>${escapeHtml(securityScansData.summary)}</p>
            </div>
            <div class="security-gate">
                <h4>Release gate</h4>
                <ol>${releaseGate}</ol>
            </div>
        </div>
        <div class="security-scan-layout">
            <aside class="security-file-list">
                <p class="security-root">Nguồn: <code>${escapeHtml(securityScansData.rootPath)}</code></p>
                ${fileList}
            </aside>
            <section class="security-reader" id="security-reader">
                <div class="loader" style="margin: 30px auto;"></div>
            </section>
        </div>
    `;

    loadSecurityScanFile(securityScansData.files[0].id);
}

window.loadSecurityScanFile = async function (fileId) {
    const file = securityScansData.files.find(item => item.id === fileId);
    const reader = document.getElementById('security-reader');
    if (!file || !reader) return;

    document.querySelectorAll('.security-file-item').forEach(item => item.classList.remove('active'));
    const selected = document.getElementById(`security-file-${fileId}`);
    if (selected) selected.classList.add('active');

    reader.innerHTML = `<div class="loader" style="margin: 30px auto;"></div>`;
    try {
        const response = await fetch(file.url + '?t=' + new Date().getTime());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const markdown = await response.text();
        reader.innerHTML = `
            <div class="security-reader-heading">
                <div>
                    <h3>${escapeHtml(file.label)}</h3>
                    <code>${escapeHtml(file.relativePath)}</code>
                </div>
                <span class="badge badge-${file.status === 'fixed' ? 'success' : 'info'}">${escapeHtml(file.status)}</span>
            </div>
            <div class="markdown-body">${marked.parse(markdown)}</div>
        `;
    } catch (error) {
        reader.innerHTML = `
            <h3>${escapeHtml(file.label)}</h3>
            <p>Không tải được nội dung file nguồn: <code>${escapeHtml(file.relativePath)}</code>.</p>
            <p class="card-desc">Hãy mở roadmap bằng static server từ thư mục gốc dự án để truy cập được `.codex-security-scans`.</p>
        `;
    }
};

// Render AI Plans View
async function renderAIPlansView() {
    const content = document.getElementById('dynamic-content');
    content.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 50px;">
        <div class="loader" style="margin: 20px auto;"></div>
        Đang tải dữ liệu AI Plans...
    </div>`;

    const plans = manifestData.aiPlans || [];
    if (plans.length === 0) {
        content.innerHTML = `<div class="dashboard-view"><p style="color: var(--text-secondary);">Chưa có AI Plan nào được lưu trữ.</p></div>`;
        return;
    }

    // Default to the latest plan (last item in array)
    const currentPlanIndex = plans.length - 1;
    
    let html = `<div class="dashboard-view" style="display: flex; gap: 20px; align-items: flex-start;">
        <div style="flex: 0 0 250px; background: var(--bg-card); border-radius: 8px; padding: 15px; border: 1px solid var(--border-color); position: sticky; top: 20px;">
            <h3 style="margin-top:0; color: var(--accent-color); font-size: 1.1rem; padding-bottom: 10px; border-bottom: 1px solid var(--border-color);">Lịch sử AI Plans</h3>
            <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px;">`;
            
    // Clone and reverse to show newest first in menu
    [...plans].reverse().forEach((p, i) => {
        const isSelected = p.id === plans[currentPlanIndex].id;
        html += `<li id="plan-menu-${p.id}" class="menu-item ${isSelected ? 'active' : ''}" style="padding: 10px; border-radius: 6px; cursor: pointer; border: 1px solid ${isSelected ? 'var(--accent-color)' : 'transparent'}; background: ${isSelected ? 'rgba(56,189,248,0.1)' : 'transparent'}; transition: 0.2s;" onclick="loadAIPlanData('${p.id}')">
            <div style="font-weight: 600; color: ${isSelected ? 'var(--accent-color)' : 'var(--text-color)'}; font-size: 0.9rem;">${p.title}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">📅 ${p.date}</div>
        </li>`;
    });

    html += `</ul>
        </div>
        <div style="flex: 1;" id="plan-details-container">
        </div>
    </div>`;
    
    content.innerHTML = html;
    
    // Load default plan
    await loadAIPlanData(plans[currentPlanIndex].id);
}

window.loadAIPlanData = async function(planId) {
    const plans = manifestData.aiPlans || [];
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    
    // Update Menu Selection
    plans.forEach(p => {
        const el = document.getElementById(`plan-menu-${p.id}`);
        if(el) {
            if (p.id === planId) {
                el.classList.add('active');
                el.style.border = '1px solid var(--accent-color)';
                el.style.background = 'rgba(56,189,248,0.1)';
                el.querySelector('div').style.color = 'var(--accent-color)';
            } else {
                el.classList.remove('active');
                el.style.border = '1px solid transparent';
                el.style.background = 'transparent';
                el.querySelector('div').style.color = 'var(--text-color)';
            }
        }
    });

    const container = document.getElementById('plan-details-container');
    container.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 50px;"><div class="loader" style="margin: 20px auto;"></div>Đang tải chi tiết plan...</div>`;
    
    const files = [
        { id: 'plan', title: 'Implementation Plan', url: plan.planFile },
        { id: 'task', title: 'Task Tracker', url: plan.taskFile },
        { id: 'walkthrough', title: 'Walkthrough', url: plan.walkthroughFile }
    ];

    let html = `<div class="tabs" style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 15px;">`;

    files.forEach((f, idx) => {
        html += `<button class="btn ${idx === 0 ? 'active' : ''}" id="tab-btn-${f.id}" onclick="switchAIPlanTab('${f.id}')" style="${idx === 0 ? 'background: var(--accent-color); border-color: var(--accent-color); color: #fff;' : 'background: transparent; color: var(--text-secondary);'} font-weight: 600;">${f.title}</button>`;
    });

    html += `</div><div class="tab-contents">`;

    for (let i = 0; i < files.length; i++) {
        const f = files[i];
        let mdContent = '';
        if (f.url) {
            try {
                const res = await fetch(f.url + '?t=' + new Date().getTime());
                if (res.ok) {
                    mdContent = await res.text();
                } else {
                    mdContent = `*Không tìm thấy file ${f.url} hoặc file rỗng.*\\n\\nAI chưa tạo file này.`;
                }
            } catch (e) {
                mdContent = `*Lỗi tải file ${f.url}*\\n\\n\`\`\`\\n${e.message}\\n\`\`\``;
            }
        } else {
            mdContent = `*Chưa có file nào được đính kèm.*`;
        }

        html += `
            <div id="tab-content-${f.id}" class="ai-tab-content" style="display: ${i === 0 ? 'block' : 'none'}; background: var(--bg-color); padding: 25px; border-radius: 8px; border: 1px solid var(--border-color);">
                <div class="markdown-body" style="line-height: 1.6; font-size: 0.95rem;">${marked.parse(mdContent)}</div>
            </div>
        `;
    }

    html += `</div>`;
    container.innerHTML = html;
}

window.switchAIPlanTab = function (tabId) {
    const files = ['plan', 'task', 'walkthrough'];
    files.forEach(id => {
        const btn = document.getElementById(`tab-btn-${id}`);
        const content = document.getElementById(`tab-content-${id}`);
        if (id === tabId) {
            btn.style.background = 'var(--accent-color)';
            btn.style.borderColor = 'var(--accent-color)';
            btn.style.color = '#fff';
            content.style.display = 'block';
        } else {
            btn.style.background = 'transparent';
            btn.style.borderColor = 'var(--border-color)';
            btn.style.color = 'var(--text-secondary)';
            content.style.display = 'none';
        }
    });
}

// Render Dependencies View
function renderDependenciesView() {
    const content = document.getElementById('dynamic-content');
    const deps = dashboardData.dependencies;

    if (!deps) {
        content.innerHTML = `<div class="dashboard-view"><p style="color: var(--text-secondary);">Chưa có dữ liệu dependencies.</p></div>`;
        return;
    }

    let html = `<div class="dashboard-view">`;

    // Header Stats
    const totalProd = deps.production ? deps.production.length : 0;
    const totalDev = deps.devDependencies ? deps.devDependencies.length : 0;
    const totalUpgrades = deps.upgradeRecommendations ? deps.upgradeRecommendations.length : 0;
    const highRisk = deps.upgradeRecommendations ? deps.upgradeRecommendations.filter(u => u.risk === 'high').length : 0;

    html += `
        <div class="stats-grid">
            <div class="stat-card">
                <div style="color: var(--text-secondary)">Package Manager</div>
                <div class="stat-value" style="color: var(--accent-color); font-size: 1.8rem;">${deps.packageManager} v${deps.packageManagerVersion}</div>
            </div>
            <div class="stat-card">
                <div style="color: var(--text-secondary)">Production</div>
                <div class="stat-value" style="color: var(--success)">${totalProd}</div>
            </div>
            <div class="stat-card">
                <div style="color: var(--text-secondary)">DevDependencies</div>
                <div class="stat-value" style="color: var(--warning)">${totalDev}</div>
            </div>
            <div class="stat-card">
                <div style="color: var(--text-secondary)">Nâng cấp khả dụng</div>
                <div class="stat-value" style="color: ${highRisk > 0 ? 'var(--danger)' : 'var(--accent-color)'}">${totalUpgrades}</div>
            </div>
        </div>
        <div style="margin-bottom: 10px; font-size: 0.85rem; color: var(--text-secondary);">
            📅 Kiểm tra lần cuối: <b>${deps.lastAudit}</b> · Lockfile: <code>${deps.lockfile}</code>
        </div>
    `;

    // Production Dependencies Table
    if (deps.production && deps.production.length > 0) {
        html += `
            <h3 style="margin: 25px 0 15px; color: var(--success);">🟢 Production Dependencies (${deps.production.length})</h3>
            <div class="card" style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border-color); text-align: left;">
                            <th style="padding: 10px; color: var(--text-secondary);">Package</th>
                            <th style="padding: 10px; color: var(--text-secondary);">Version</th>
                            <th style="padding: 10px; color: var(--text-secondary);">Mục đích</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        deps.production.forEach(dep => {
            html += `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 8px 10px;"><code style="color: var(--accent-color);">${dep.name}</code></td>
                    <td style="padding: 8px 10px;"><span class="badge" style="background: rgba(34,197,94,0.15); color: #4ade80; font-size: 0.75rem;">${dep.version}</span></td>
                    <td style="padding: 8px 10px; color: var(--text-secondary);">${dep.purpose}</td>
                </tr>
            `;
        });
        html += `</tbody></table></div>`;
    }

    // Dev Dependencies Table
    if (deps.devDependencies && deps.devDependencies.length > 0) {
        html += `
            <h3 style="margin: 25px 0 15px; color: var(--warning);">🟡 Dev Dependencies (${deps.devDependencies.length})</h3>
            <div class="card" style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border-color); text-align: left;">
                            <th style="padding: 10px; color: var(--text-secondary);">Package</th>
                            <th style="padding: 10px; color: var(--text-secondary);">Version</th>
                            <th style="padding: 10px; color: var(--text-secondary);">Mục đích</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        deps.devDependencies.forEach(dep => {
            html += `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 8px 10px;"><code style="color: var(--warning);">${dep.name}</code></td>
                    <td style="padding: 8px 10px;"><span class="badge" style="background: rgba(234,179,8,0.15); color: #facc15; font-size: 0.75rem;">${dep.version}</span></td>
                    <td style="padding: 8px 10px; color: var(--text-secondary);">${dep.purpose}</td>
                </tr>
            `;
        });
        html += `</tbody></table></div>`;
    }

    // Upgrade Recommendations
    if (deps.upgradeRecommendations && deps.upgradeRecommendations.length > 0) {
        html += `
            <h3 style="margin: 25px 0 15px; color: var(--accent-color);">⬆️ Đề Xuất Nâng Cấp (${deps.upgradeRecommendations.length})</h3>
            <div class="card" style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border-color); text-align: left;">
                            <th style="padding: 10px; color: var(--text-secondary);">Package</th>
                            <th style="padding: 10px; color: var(--text-secondary);">Hiện tại</th>
                            <th style="padding: 10px; color: var(--text-secondary);">Mới nhất</th>
                            <th style="padding: 10px; color: var(--text-secondary);">Rủi ro</th>
                            <th style="padding: 10px; color: var(--text-secondary);">Ghi chú</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        deps.upgradeRecommendations.forEach(rec => {
            const riskColor = rec.risk === 'high' ? 'var(--danger)' : (rec.risk === 'medium' ? 'var(--warning)' : 'var(--success)');
            const riskBg = rec.risk === 'high' ? 'rgba(239,68,68,0.15)' : (rec.risk === 'medium' ? 'rgba(234,179,8,0.15)' : 'rgba(34,197,94,0.15)');
            const riskLabel = rec.risk === 'high' ? '🔴 Cao' : (rec.risk === 'medium' ? '🟡 TB' : '🟢 Thấp');
            html += `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 8px 10px;"><code style="color: var(--accent-color);">${rec.name}</code></td>
                    <td style="padding: 8px 10px;"><code>${rec.current}</code></td>
                    <td style="padding: 8px 10px;"><code style="color: var(--success);">${rec.latest}</code></td>
                    <td style="padding: 8px 10px;"><span class="badge" style="background: ${riskBg}; color: ${riskColor}; font-size: 0.75rem;">${riskLabel}</span></td>
                    <td style="padding: 8px 10px; color: var(--text-secondary); font-size: 0.8rem;">${rec.note}</td>
                </tr>
            `;
        });
        html += `</tbody></table></div>`;
    }

    html += `</div>`;
    content.innerHTML = html;
}
