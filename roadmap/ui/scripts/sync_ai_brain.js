const fs = require('fs');
const path = require('path');

const brainDir = 'C:\\Users\\thucd\\.gemini\\antigravity\\brain\\7c3add27-6609-40f9-8429-5340c5cc77e3';
const destDir = path.join(__dirname, '../data/ai_plans');

if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

['task.md', 'implementation_plan.md', 'walkthrough.md'].forEach(file => {
    const src = path.join(brainDir, file);
    const dest = path.join(destDir, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`✅ Đã đồng bộ: ${file}`);
    } else {
        fs.writeFileSync(dest, `> *Hiện tại chưa có dữ liệu cho file **${file}***\n\nAI đang chưa bắt đầu quá trình Planning hoặc file này chưa được tạo trong phiên làm việc hiện tại.`);
        console.log(`⏳ Tạo placeholder: ${file}`);
    }
});
