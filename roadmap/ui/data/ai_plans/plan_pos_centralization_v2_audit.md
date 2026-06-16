# Đánh giá và Khắc phục: POS Centralization & B2B Debt (V2)

Dưới đây là kế hoạch chi tiết khắc phục và triển khai 3 yêu cầu bổ sung của hệ thống QLCH_VanLanh bao gồm: Thay thế SMS bằng TOTP Authenticator cho Cấu hình Ngân Hàng, Dùng tiền thừa để cấn trừ nợ cũ trên giao diện POS, và Chức năng xác nhận hoàn trả linh kiện trước khi KTV bàn giao máy.

## Proposed Changes

### Core & Dependencies
Cài đặt thư viện tạo và xác thực TOTP:
- Thêm `otplib` và `qrcode` vào `package.json`. Chạy `pnpm i` để cài đặt.

---

### Bank Integration (TOTP Authenticator)

#### [MODIFY] `src/lib/types.ts`
- Thêm các thuộc tính tùy chọn vào cấu hình hệ thống: `totpEnabled?: boolean`, `totpSecret?: string`.

#### [NEW] `src/app/api/admin/bank-config/totp/setup/route.ts`
- API GET: Sử dụng `otplib` để sinh `secret` và tạo `keyuri` định danh `QLCH_VanLanh`.
- Trả về dạng JSON gồm `secret` và `qrCodeUrl` (Base64 data URL) để hiển thị lên frontend.

#### [NEW] `src/app/api/admin/bank-config/totp/verify/route.ts`
- API POST: Nhận `token` và tùy chọn `secret`.
- Nếu có `secret` (lúc đang setup): xác thực token với secret. Nếu đúng, lưu `totpSecret` và `totpEnabled=true` vào collection `settings/bank_config`.
- Nếu không có `secret` (lúc Edit): đọc `totpSecret` từ DB và xác thực. Trả kết quả true/false.

#### [MODIFY] `src/components/admin/settings/BankIntegrationConfig.tsx`
- **Setup UI:** Hiển thị nút "Thiết lập Authenticator" nếu chưa có cấu hình. Mở Modal hiển thị QR Code và yêu cầu nhập mã 6 số.
- **Edit UI:** Thay thế nút "Chỉnh sửa" thông thường. Khi nhấn vào, bật Modal yêu cầu "Nhập mã Authenticator". Chỉ khi nhập mã đúng (verify qua API trả về true) thì `isEditing` mới bật lên cho phép sửa.

#### [MODIFY] `src/app/api/admin/bank-config/update/route.ts`
- Backend chặn lưu cấu hình nếu hệ thống đã bật TOTP nhưng request không gửi kèm `otpToken` hợp lệ.

---

### Dùng tiền thừa cấn trừ nợ cũ tại POS

#### [MODIFY] `src/app/admin/pos/page.tsx`
- Backend API `api/pos/checkout/route.ts` đã có sẵn logic nhận biến `use_surplus_to_pay_debt` và tiến hành cấn trừ.
- Sửa lại UI POS tại khu vực tính tiền: Khi `paymentMethod` là Tiền mặt/MoMo/Bank, và `Khách đưa (deposit)` > `Tổng tiền (total)`, và `Nợ khách hàng (customerDebt)` > 0.
- Hiển thị checkbox: `"Khách đang có nợ cũ: {customerDebt}. Dùng tiền thừa {surplus} để cấn trừ nợ?"`.
- Bind checkbox này với biến state `useSurplusToPayDebt` (đã khai báo sẵn).

---

### Hoàn trả linh kiện lúc Bàn giao (Test vs Use)

#### [MODIFY] `src/app/api/repairs/confirm-parts/route.ts`
- Sửa cấu trúc API để hỗ trợ nhận một mảng `commands: any[]` thay vì chỉ một `command` duy nhất.
- Lặp qua mảng `commands` để thực thi tuần tự (cho phép Reject nhiều linh kiện 1 lúc trong cùng 1 Transaction mà không gây lỗi versioning).

#### [MODIFY] `src/app/admin/technician/page.tsx`
- Tại hàm `executeStatusChange`, bổ sung một Interceptor mới:
- Nếu trạng thái đích (`newStatus`) là `cho_ban_giao_khach` (Bước 4).
- Lọc danh sách linh kiện trong phiếu: Nếu có bất kỳ linh kiện nào ở trạng thái `SELECTED` (đang giữ chỗ).
- Mở Modal **Xác nhận linh kiện sử dụng**:
  - Liệt kê toàn bộ linh kiện `SELECTED`.
  - Có 2 lựa chọn Radio Box bắt buộc KTV tick vào cho mỗi dòng: `[ ] Hoàn kho (Test)` và `[ ] Đã dùng`.
- Khi bấm "Xác nhận & Chuyển bước", thu thập các linh kiện đánh dấu `Hoàn kho`.
- Gọi `api/repairs/confirm-parts` với danh sách lệnh `reject_request` (trả đồ Test về kho).
- Đợi API chạy xong (linh kiện sẽ chuyển status thành `REJECTED` và hoàn tồn kho), sau đó tiếp tục gọi API `transition` để chuyển trạng thái phiếu sang "Chờ bàn giao khách".
