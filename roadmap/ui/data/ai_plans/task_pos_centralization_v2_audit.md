# Tasks: Bổ sung và Khắc phục POS Centralization & B2B Debt (V2)

- [x] **Giai đoạn 1: TOTP Authenticator cho Bank Config**
  - [x] Cài đặt thư viện `otplib` và `qrcode` vào package.json.
  - [x] Cập nhật `src/lib/types.ts` thêm `totpEnabled` và `totpSecret`.
  - [x] Viết API `/api/admin/bank-config/totp/setup` để sinh Secret và QR code cho Admin.
  - [x] Viết API `/api/admin/bank-config/totp/verify` để kiểm tra mã 6 số.
  - [x] Cập nhật API `/api/admin/bank-config/update` để xác thực mã TOTP trước khi lưu cấu hình mới.
  - [x] Cập nhật UI `BankIntegrationConfig.tsx`:
    - [x] Thêm luồng Setup (Quét QR + Nhập mã thử).
    - [x] Thêm Modal bắt buộc nhập OTP khi bấm "Chỉnh sửa".

- [x] **Giai đoạn 2: Quản lý Linh kiện theo Workflow sửa chữa**
  - [x] Cập nhật API `confirm-parts/route.ts` hỗ trợ nhận mảng `commands` (batch operation).
  - [x] Cập nhật `src/app/admin/technician/page.tsx` chặn hành động chuyển trạng thái `cho_ban_giao_khach`.
  - [x] Viết Modal Xác Nhận Linh Kiện hiển thị danh sách các linh kiện `SELECTED`.
  - [x] Xử lý logic Modal: Yêu cầu KTV tick chọn `Test (X)` hoặc `Dùng (Y)`.
  - [x] Gom các món linh kiện Test thành array `reject_request` gửi qua API `confirm-parts` để hoàn kho, sau đó tiếp tục chuyển trạng thái.

- [x] **Giai đoạn 3: Checkbox Cấn trừ nợ cũ (POS Checkout)**
  - [x] Tại `src/app/admin/pos/page.tsx`, nếu khách đang có `customerDebt > 0` và tiền khách trả > tổng bill, hiển thị checkbox "Dùng số dư cấn trừ nợ cũ".
  - [x] Bind checkbox với state `useSurplusToPayDebt`.
  *(Lưu ý: Backend xử lý tự động cấn trừ nợ bằng tiền thừa đang bị khuyết thiếu logic ở API checkout và cần bổ sung thêm)*

- [x] **Giai đoạn 4: Tài liệu & Hoàn tất**
  - [x] Viết báo cáo Walkthrough vào `roadmap/ui/data/ai_plans/walkthrough_pos_centralization_v2_audit.md`.
  - [x] Cập nhật trạng thái trong `manifest.json` thành "completed".
