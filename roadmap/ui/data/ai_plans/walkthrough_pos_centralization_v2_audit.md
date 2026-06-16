# Walkthrough: POS Centralization & B2B Debt - Giai đoạn Mở rộng

## Tổng quan
Quá trình này nhằm bổ sung các tính năng cốt lõi cho dự án QLCH_VanLanh theo hướng phát triển tập trung POS, với 3 tính năng mới được hoàn thiện:
1. **TOTP Authenticator cho Bank Config:** Thay thế SMS OTP, cung cấp hệ thống bảo mật bằng 2FA TOTP (Google Authenticator) khi thay đổi số tài khoản ngân hàng của cửa hàng.
2. **Quản lý Linh kiện theo Workflow Sửa chữa:** Cho phép KTV chọn xác nhận các linh kiện **Đã dùng** hoặc **Hoàn kho (Test)** khi chuyển trạng thái phiếu sang "Chờ bàn giao khách". Các linh kiện dư/không cần thiết được tự động hoàn lại kho, giúp quản lý tồn kho chính xác hơn.
3. **Cấn trừ Nợ cũ trong POS Checkout:** Bổ sung checkbox để tự động sử dụng số tiền thanh toán thừa (so với tổng hóa đơn) để cấn trừ nợ cũ cho khách hàng trực tiếp trên màn hình bán hàng.

## Chi tiết Triển khai

### Giai đoạn 1: TOTP Authenticator cho Bank Config
- **Cấu hình:** Cài đặt `otplib` và `qrcode` vào server.
- **Backend API:** 
  - Tạo `GET /api/admin/bank-config/totp/setup` để sinh mã Secret và ảnh QR Code cho ứng dụng Authenticator.
  - Tạo `POST /api/admin/bank-config/totp/verify` để admin điền mã 6 số nhằm verify và gắn kết tài khoản.
  - Sửa đổi `POST /api/admin/bank-config/update` để yêu cầu phải nhập mã OTP nếu tính năng TOTP đang được kích hoạt.
- **Frontend UI (`src/components/admin/settings/BankIntegrationConfig.tsx`):**
  - Hiện mã QR cho lần cài đặt đầu tiên.
  - Chặn button "Chỉnh sửa" bằng một Modal yêu cầu nhập mã OTP (nếu đã kích hoạt TOTP).

### Giai đoạn 2: Quản lý Linh kiện theo Workflow sửa chữa
- **Backend API (`/api/repairs/confirm-parts/route.ts`):**
  - Refactor lại API để có thể nhận batch request gồm nhiều `commands` thay vì chỉ 1 lệnh đơn.
  - Xử lý các command type `reject_request` (Hoàn kho) qua một array duy nhất trong transaction để tối ưu hóa read/write và giữ vẹn toàn bộ version của phiếu.
- **Frontend UI (`src/app/admin/technician/page.tsx`):**
  - Chặn quá trình KTV chuyển trạng thái sang `cho_ban_giao_khach` (Customer Handover) và gọi Modal "Xác nhận sử dụng linh kiện".
  - Liệt kê các linh kiện "Đã Chọn" để KTV phân loại: `Đã dùng` (giữ nguyên) hoặc `Hoàn kho (Test)` (lệnh reject_request).
  - Sau khi xác nhận các linh kiện hoàn lại, hệ thống mới gọi API chuyển trạng thái phiếu.

### Giai đoạn 3: Cấn trừ nợ cũ (POS Checkout)
- **Cập nhật UI (`src/app/admin/pos/page.tsx`):**
  - Hiển thị thông báo "Khách có nợ cũ" kèm checkbox "Dùng số tiền thừa để cấn trừ nợ" nếu số tiền trả `deposit` lớn hơn `total`.
- **Backend API (`/api/pos/checkout/route.ts`):**
  - Hệ thống tự động tính toán `debtDecrease` từ số tiền thừa và dùng số tiền đó để trừ nợ cũ trên profile của khách hàng.
  - Bổ sung `debtOffsetAmount` vào payload đơn hàng POS lưu trong Firestore nhằm mục đích đối soát tài chính sau này. Lịch sử giao dịch cũng được lưu trong `customer_transactions`.

## Xác minh
1. **Bảo mật:** TOTP OTP hoạt động ổn định và thay thế SMS hiệu quả.
2. **Kỹ thuật:** Khi phiếu sửa chữa chuyển sang "Chờ bàn giao khách", hệ thống bắt buộc KTV phải tương tác để xác nhận linh kiện.
3. **Thanh toán:** Khi POS có tiền trả > hóa đơn và chọn Checkbox, hệ thống tự động sinh `customer_transactions` trừ nợ thay vì chỉ đút túi tiền thối.

> [!NOTE]
> Các thay đổi tuân thủ nghiêm ngặt theo các nguyên tắc Karpathy, giữ cho footprint code nhỏ nhất, không phá vỡ logic cũ và đã xác minh thông qua các flow độc lập.
