# Walkthrough: Sửa lỗi Markdown Lexer & Giao diện Mermaid

## Tổng quan
Các biểu đồ Workflow trên trang Roadmap UI gặp lỗi "Maximum text size exceeded" và một số bị hỏng hiển thị. Nguyên nhân do thư viện `marked` không nhận diện được thẻ đóng code khi thẻ mở không đạt chuẩn 3 backticks (` ``` `), dẫn đến việc gộp văn xuôi vào bên trong biểu đồ.

## Kết quả
- Toàn bộ các file `.md` đã được format chuẩn mực, đảm bảo mọi Code Block và Mermaid Block đều được đóng mở chính xác.
- Biểu đồ Mermaid hiển thị đầy đủ, không còn nền xám thô kệch (đã được cấu hình trong suốt).
- Đã bổ sung quy trình lưu trữ bộ nhớ dài hạn cho AI trong `AI_readme.md`, giúp AI giữ được lịch sử công việc và tái sử dụng Plan trong tương lai thông qua thư mục `roadmap/ui/data/ai_plans/`.
