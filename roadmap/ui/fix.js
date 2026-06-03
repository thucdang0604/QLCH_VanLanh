const fs = require('fs');
let code = fs.readFileSync('m:/QLCH_VanLanh/roadmap/ui/app.js', 'utf8');
code = code.replace(/ðý?c \<code>\.codex-security-scans<\/code>\/g, 'ðý?c <code>.codex-security-scans</code>');
code = code.replace(/ðý?c \\.codex-security-scans\/g, 'ðý?c <code>.codex-security-scans</code>');
fs.writeFileSync('m:/QLCH_VanLanh/roadmap/ui/app.js', code, 'utf8');
