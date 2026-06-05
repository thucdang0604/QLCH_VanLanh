const fs = require('fs');

const appPath = 'm:/QLCH_VanLanh/roadmap/ui/app.js';
let code = fs.readFileSync(appPath, 'utf8');

code = code.replace(/đọc <code>\.codex-security-scans<\/code>/g, 'đọc <code>.codex-security-scans</code>');
code = code.replace(/đọc \\.codex-security-scans/g, 'đọc <code>.codex-security-scans</code>');

fs.writeFileSync(appPath, code, 'utf8');
