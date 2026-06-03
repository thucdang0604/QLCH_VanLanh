# Implementation Plan: Cải thiện UI Lexer & Sửa lỗi Mermaid

## Mục Tiêu
- Sửa lỗi "Maximum text size in diagram exceeded" khi render Mermaid do nội dung file quá dài.
- Xử lý vấn đề Lexer của Markdown không nhận diện được thẻ đóng code khi thẻ mở không chuẩn (` ``mermaid ` thay vì ` ```mermaid `).
- Đảm bảo AI sau này không bị ghi đè plan/task.

## Phân tích
- Các file trong `roadmap/ai/modules` bị lỗi hở thẻ backticks.
- Parser gộp tất cả văn bản sau đó vào thành 1 khối code khổng lồ, khiến biểu đồ Mermaid bị lỗi và không render được.
- Đổi nền subgraph thành trong suốt.

## Giải Pháp
1. Tạo Script Node.js tự động thay thế ` ``mermaid ` thành ` ```mermaid `.
2. Đóng thẻ ` ``` ` một cách tự động ngay trước các thẻ tiêu đề `# ` nếu code block đang mở.
3. Chỉnh `clusterBkg: 'transparent'` trong `app.js`.
