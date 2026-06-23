# 🤖 QUY ĐỊNH DÀNH RIÊNG CHO AI (ROADMAP V3 & SPA)

> [!IMPORTANT]
> 🚀 DÀNH CHO AI MỚI BẮT ĐẦU ĐỌC DỰ ÁN NÀY:
> 1. Để hiểu toàn bộ kiến trúc Backend, **KHÔNG CẦN CRAWL MÃ NGUỒN**. Hãy mở ngay file `roadmap/ui/data/source_intelligence.json`! Đây là **Single Source of Truth** chứa 100% bản đồ Database Schema (TypeScript Interfaces) và toàn bộ các API Endpoints kèm giải thích nghiệp vụ chi tiết.
> 2. Để nắm vững phong cách lập trình, design patterns (Firestore Transactions, ID Generation...) chuẩn của dự án, hãy đọc ngay [Codex Guidelines](CODEX_GUIDELINES.md).

Bản đồ mã nguồn và kiến trúc này được quản lý tự động bằng Giao diện Roadmap SPA (`http://localhost:5500/roadmap/ui/`).
Là một AI, bạn có trách nhiệm đọc, cập nhật và duy trì tính toàn vẹn của các tài liệu này. BẮT BUỘC tuân thủ các quy tắc sau:

## 1. SINGLE SOURCE OF TRUTH (NGUỒN SỰ THẬT DUY NHẤT)
- Thư mục `roadmap/ai/` là tài liệu thiết kế gốc (Markdown).
- Khi bạn thay đổi logic, fix bug, hoặc thêm tính năng, **BẮT BUỘC** phải cập nhật file markdown tương ứng trong thư mục này.
- Mọi tài liệu mới tạo phải được nhúng link vào file gốc `master.md` hoặc một file nhánh con để UI có thể tự động crawl (Cross-linking).

## 2. LƯU TRỮ TRÍ TUỆ VÀ KIẾN TRÚC DỮ LIỆU
Giao diện UI (SPA) tải dữ liệu kết hợp từ Markdown (`roadmap/ai/`) và JSON (`roadmap/ui/data/`). Bạn phải làm việc song song với 2 loại cấu trúc này:
- **`master.md`**: Chứa sơ đồ luồng chính, danh sách Bug và khai báo file hệ thống.
- **`source_intelligence.json`**: Bản đồ trí tuệ mã nguồn. Bất cứ khi nào bạn tạo mới Collection, thêm Guardrail, hoặc cấu trúc lại kiến trúc lớn, hãy cập nhật file này. File này được hiển thị nguyên bản trên tab **Source Intelligence** của UI.
- **`manifest.json`**: Registry (Sổ đăng ký) để định tuyến các file kế hoạch AI lên UI.

## 3. QUY TẮC LƯU TRỮ KẾ HOẠCH & TASK DÀI HẠN (AI PLANS)
Thư mục `roadmap/ui/data/ai_plans/` là **bộ nhớ dài hạn** của AI. Đừng để người dùng nhắc bạn phải làm điều này.
- Bất cứ khi nào tạo Implementation Plan, Task list hay Walkthrough (hoặc khi bắt đầu một đầu việc/fix bug lớn), **BẮT BUỘC** lưu file `.md` vào thư mục này (Vd: `plan_ten_tinh_nang.md`, `task_ten_tinh_nang.md`).
- **KHÔNG GHI ĐÈ** lên các file kế hoạch của các đợt làm việc trước đó. Mỗi phiên làm việc hãy tạo một set file riêng.
- **Khai báo Registry**: Sau khi tạo file, phải mở `roadmap/ui/data/manifest.json` và chèn một block JSON vào mảng `"aiPlans"` chứa title, status và đường dẫn trỏ tới các file vừa tạo để hiển thị lên UI.

## 4. QUY TẮC BUGS & GIẢI QUYẾT LỖI
- Tìm thấy bug: Tạo mục mới (Vd: `## BUG-001`) trong file markdown của module tương ứng.
- Đã fix xong: Đổi trạng thái từ `open` sang `fixed` ngay trong file markdown và ghi chú nguyên nhân + file đã sửa. Giao diện UI sẽ tự động scan và cập nhật tỷ lệ hoàn thành.

## 5. RÀO CẢN KỸ THUẬT NGHIÊM NGẶT KHI CẬP NHẬT TÀI LIỆU
- **Lỗi Static Server (Bypass Dotfiles)**: Tuyệt đối **KHÔNG** đặt tên thư mục hoặc file bắt đầu bằng dấu chấm (`.`) (Ví dụ: `.codex-security-scans`). Server local sẽ từ chối truy cập (HTTP 404) các thư mục ẩn, làm sập việc load dữ liệu trên UI. Phải dùng tên thư mục thông thường (vd: `codex-security-scans`).
- **Lỗi Markdown Parser (Mermaid Syntax)**: Khi vẽ biểu đồ Mermaid, **BẮT BUỘC** sử dụng cú pháp 3 backticks (` ```mermaid `) và đóng lại đúng cách trước mọi Heading Markdown. Nếu quên đóng hoặc dùng sai backticks, bộ Lexer sẽ ném lỗi `Maximum text size exceeded` và làm trắng xoá màn hình Roadmap của người dùng.
- **Javascript Template Literals**: Không đặt cặp dấu backticks thô bọc bên ngoài file text trừ khi thật sự cần thiết, hoặc phải đổi thành thẻ HTML `<code>...</code>` để tránh lỗi `SyntaxError` và `ReferenceError` khi UI Parse nội dung động.
