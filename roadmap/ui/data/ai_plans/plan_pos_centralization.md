# Kế hoạch Triển khai: Tập trung Thanh toán về POS & Nâng cấp Hệ thống (Bản Chốt Cuối Cùng)

Dựa trên quyết định của bạn, Kế hoạch đã được hoàn thiện để phục vụ quá trình Code.

## Tổng quan Giải pháp (Đã chốt)
- **Tập trung về POS:** Xóa chức năng thanh toán tại Sửa chữa, mọi thứ đổ về POS.
- **Tách biệt Doanh thu:** Tách rõ Doanh thu Tiền mặt (Thực thu) và Doanh thu Nợ.
- **Kế toán B2B (Công nợ Sỉ):** Áp dụng gạch nợ tự động FIFO khi khách sỉ thanh toán 1 cục.
- **Bảo mật Ngân hàng:** Đổi STK nhận tiền cần xác thực OTP gửi về SĐT Admin.
- **Thanh toán QR (Manual Sync):** Không dùng Webhook. Nhân viên thu ngân bấm xác nhận tay. Mã QR có chứa sẵn STK, nội dung, số tiền sẽ được **in thẳng ra Bill/Hóa đơn** để khách quét.

---

## Các thay đổi chi tiết

### 1. Database Schema & Types (`src/lib/types.ts`)
- **`Order`**: 
  - Thêm `paymentStatus: 'paid' | 'unpaid' | 'debt'`. 
  - Thêm `shippingFee?: number`.
  - Thêm `linkedRepairIds?: string[]`.
- **`Customer`**: Thêm trường `totalDebt?: number`.
- **`CustomerTransaction`** [NEW]: Lịch sử nợ (type: `'DEBT'` | `'PAYMENT'`), lưu `amount`, `orderIds[]`.
- **`RepairTicket`**: Thêm `serviceWarrantyExpiresAt?: FirestoreDateValue`.
- **`InventoryLog`**: Thêm `type: 'REPAIR_RETURN'`.

### 2. Phân tách Doanh thu (`src/app/admin/revenue/page.tsx`)
- **Doanh thu Thực thu:** Cộng tiền các đơn `paymentStatus = 'paid'` và các `CustomerTransaction(type: 'PAYMENT')` trong ngày.
- **Doanh thu Ghi nợ:** Cộng tiền các đơn `paymentStatus = 'debt'` xuất trong ngày.

### 3. Module Sửa chữa (`src/app/admin/repairs/page.tsx`)
- Xóa Modal thanh toán. Thay bằng nút **"Đưa lên POS"**. 
- Mang theo danh sách Linh kiện + Phí Dịch vụ + Quà tặng (giá 0đ) sang POS.
- Nút "Hoàn trả kho" ở tab Linh kiện để trả `products.stock` và ghi log `REPAIR_RETURN`.
- Nếu phiếu hoàn tất không có thay linh kiện -> tự động set `serviceWarrantyExpiresAt` (+3 tháng).

### 4. Module POS (`src/app/admin/pos/page.tsx`)
- Fetch phiếu sửa chữa chưa thanh toán của KH để đưa vào giỏ.
- Thêm CurrencyInput `shippingFee`.
- Checkbox Trả thừa cấn nợ (Dùng số dư trừ nợ cũ) sinh ra `CustomerTransaction(PAYMENT)`.
- **In Bill có QR:** Component hóa đơn in ra sẽ có sẵn mã VietQR (Tạo từ URL `img.vietqr.io` kèm STK của cửa hàng + Tổng tiền Bill + ID Đơn hàng). Khách cầm bill tự quét.

### 5. Quản lý Khách hàng & Công nợ (FIFO)
- Giao diện **Thanh toán Nợ** ở chi tiết Khách hàng (`src/app/admin/customers/page.tsx`).
- Nhập số tiền trả gộp -> Hệ thống quét các đơn `paymentStatus = 'debt'` cũ nhất -> tự động cập nhật sang `paid` -> trừ `totalDebt` -> ghi `CustomerTransaction(PAYMENT)`.

### 6. Cài đặt Ngân hàng (OTP)
- `src/app/admin/settings/integrations/page.tsx` lưu Cấu hình Ngân hàng (Mã NH, STK, Tên).
- Áp dụng logic OTP chặn mở khóa form (dùng Firebase Phone Auth hoặc cơ chế mô phỏng tùy môi trường dev).

## Verification
- Chạy thử xuất đơn POS, In Bill kiểm tra có mã QR quét đúng nội dung không.
- Chạy thử gạch nợ 1 cục tiền xem các bill cũ có chuyển thành 'paid' không.
- Kiểm tra Báo cáo doanh thu bị lệch giữa nợ và thực thu không.
