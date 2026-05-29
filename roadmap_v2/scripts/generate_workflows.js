const fs = require('fs');
const path = require('path');

const dir = 'm:/QLCH_VanLanh/roadmap';
const dest = 'm:/QLCH_VanLanh/roadmap_v2/data/workflows.json';

const workflows = [
    { id: 'inventory', file: 'inventory-workflow.html', title: 'Kho hàng', icon: '📦' },
    { id: 'pos-orders', file: 'pos-orders-workflow.html', title: 'POS & Đơn hàng', icon: '🛍️' },
    { id: 'repair', file: 'repair-workflow.html', title: 'Sửa chữa', icon: '🔧' },
    { id: 'finance-hr', file: 'finance-hr-workflow.html', title: 'Tài chính & Nhân sự', icon: '💰' },
    { id: 'system-content', file: 'system-content-workflow.html', title: 'Hệ thống & Nội dung', icon: '📝' },
    { id: 'master', file: 'master-workflow.html', title: 'Master Hub', icon: '🌐' }
];

let result = {};

workflows.forEach(wf => {
    try {
        const html = fs.readFileSync(path.join(dir, wf.file), 'utf8');
        const match = html.match(/<div class="mermaid"[^>]*>([\s\S]*?)<\/div>/);
        if (match) {
            let mermaidStr = match[1].trim();

            // Fix newlines injected by HTML formatters for `class` definitions
            mermaidStr = mermaidStr.replace(/class\s+([\s\S]+?)(process|success|warning|terminal|linkNode|system|bug|bugFixed|auth|held|fund|module|database|waiting)\b;?/g, (match, p1, p2) => {
                const cleanedNodes = p1.replace(/\s+/g, '');
                return `class ${cleanedNodes} ${p2}`;
            });

            mermaidStr = mermaidStr.replace(/href\s+"bug-details\.html#([^"]+)"/g, 'call handleBugClick("$1")');

            mermaidStr = mermaidStr.replace(/href\s+"([a-z0-9\-]+)-workflow\.html"/g, 'call handleWorkflowClick("$1")');

            // Wait, what if there's any stray HTML entities like `&gt;`?
            mermaidStr = mermaidStr.replace(/&gt;/g, '>');
            mermaidStr = mermaidStr.replace(/&lt;/g, '<');
            mermaidStr = mermaidStr.replace(/&amp;/g, '&');

            result[wf.id] = {
                title: wf.title,
                icon: wf.icon,
                mermaid: mermaidStr
            };
        }
    } catch (e) {
        console.error('Error processing ' + wf.file, e);
    }
});

fs.writeFileSync(dest, JSON.stringify(result, null, 2));
console.log('Done mapping to JSON!');
