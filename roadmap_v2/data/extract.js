const fs = require('fs');

const html = fs.readFileSync('m:/QLCH_VanLanh/roadmap/audit-report.html', 'utf8');

function extractBetween(startStr, endStr) {
  const startIndex = html.indexOf(startStr);
  if (startIndex === -1) return '';
  const endIndex = html.indexOf(endStr, startIndex + startStr.length);
  if (endIndex === -1) return '';
  return html.substring(startIndex + startStr.length, endIndex).trim();
}

const performance = '<table class="detail-table">' + extractBetween('</p>\n\n      <table class="detail-table">', '</div>\n\n    <!-- IMAGE ARCHITECTURE -->');
const imageArch = extractBetween('<h3>🖼️ Kiến Trúc Ảnh Chi Tiết</h3>\n', '</div>\n\n      <!-- SECURITY -->');
const security = extractBetween('<h3>🔒 Security Posture</h3>\n', '</div>\n\n      <!-- COST -->');
const cost = extractBetween('<h3>💰 Ước Lượng Chi Phí Firebase (5,000 users/tháng)</h3>\n', '</div>\n\n      <!-- DATA ARCHITECTURE -->');
const dataArch = '<h4' + extractBetween('</p>\n\n        <h4', '</div>\n\n      <!-- ACTION ITEMS -->');
const actionItems = extractBetween('<h3>📋 Action Items — Thứ Tự Ưu Tiên</h3>\n', '</div>\n\n      <footer');

const data = {
  date: '18.05.2026',
  auditor: 'Antigravity AI + Human Review',
  scores: [
    { value: 'A+', label: 'Performance', status: 'pass' },
    { value: 'A+', label: 'Security', status: 'pass' },
    { value: '$2.60', label: 'Cost/Month', status: 'pass' },
    { value: 'B', label: 'Data Architecture', status: 'warn' }
  ],
  sections: [
    { id: 'performance', title: '⚡ Performance & UX/UI', color: 'success', desc: 'Đánh giá khả năng phục vụ 5,000 users/tháng trên Firebase App Hosting.', content: performance },
    { id: 'image-arch', title: '🖼️ Kiến Trúc Ảnh Chi Tiết', color: 'purple', content: imageArch },
    { id: 'security', title: '🔒 Security Posture', color: 'success', content: security },
    { id: 'cost', title: '💰 Ước Lượng Chi Phí Firebase (5,000 users/tháng)', color: 'success', content: cost },
    { id: 'data-arch', title: '🗄️ Data Architecture — Customer CRM', color: 'warning', desc: 'Kiến trúc được chọn để quản lý thông tin khách hàng tập trung.', content: dataArch },
    { id: 'action-items', title: '📋 Action Items — Thứ Tự Ưu Tiên', color: 'warning', content: actionItems }
  ]
};

fs.writeFileSync('m:/QLCH_VanLanh/roadmap_v2/data/audit-details.json', JSON.stringify(data, null, 2));
console.log('Done!');
