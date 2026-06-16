# Tasks: Bổ sung và Khắc phục POS Centralization & B2B Debt

- [ ] **Giai đoạn 1: TOTP Authenticator cho Bank Config**
  - [ ] Cài đặt thư viện `otplib` và `qrcode` vào package.json.
  - [ ] Cập nhật `src/lib/types.ts` thêm `totpEnabled` và `totpSecret`.
  - [ ] Viết API `/api/admin/bank-config/totp/setup` để sinh Secret và QR code cho Admin.
  - [ ] Viết API `/api/admin/bank-config/totp/verify` để kiểm tra mã 6 số.
  - [ ] Cập nhật API `/api/admin/bank-config/update` để xác thực mã TOTP trước khi lưu cấu hình mới.
  - [ ] Cập nhật UI `BankIntegrationConfig.tsx`:
    - [ ] Thêm luồng Setup (Quét QR + Nhập mã thử).
    - [ ] Thêm Modal bắt buộc nhập OTP khi bấm "Chỉnh sửa".

- [ ] **Giai đoạn 2: Quản lý Linh kiện theo Workflow sửa chữa**
  - [ ] Cập nhật API `confirm-parts/route.ts` hỗ trợ nhận mảng `commands` (batch operation).
  - [ ] Cập nhật `src/app/admin/technician/page.tsx` chặn hành động chuyển trạng thái `cho_ban_giao_khach`.
  - [ ] Viết Modal Xác Nhận Linh Kiện hiển thị danh sách các linh kiện `SELECTED`.
  - [ ] Xử lý logic Modal: Yêu cầu KTV tick chọn `Test (X)` hoặc `Dùng (Y)`.
  - [ ] Gom các món linh kiện Test thành array `reject_request` gửi qua API `confirm-parts` để hoàn kho, sau đó tiếp tục chuyển trạng thái.

- [ ] **Giai đoạn 3: Checkbox Cấn trừ nợ cũ (POS Checkout)**
  - [ ] Tại `src/app/admin/pos/page.tsx`, nếu khách đang có `customerDebt > 0` và tiền khách trả > tổng bill, hiển thị checkbox "Dùng số dư cấn trừ nợ cũ".
  - [ ] Bind checkbox với state `useSurplusToPayDebt`.

- [ ] **Giai đoạn 4: Tài liệu & Hoàn tất**
  - [ ] Viết báo cáo Walkthrough vào `roadmap/ui/data/ai_plans/walkthrough_pos_centralization_v2_audit.md`.
  - [ ] Cập nhật trạng thái trong `manifest.json` thành "completed".
