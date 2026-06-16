# Tasks: POS Centralization & B2B Debt

- [x] **Giai đoạn 1: Database Schema & Core Types**
  - [x] Cập nhật `src/lib/types.ts` cho `Order` (`paymentStatus`, `shippingFee`, `linkedRepairIds`, `payment_method: 'Debt' | 'QR'`).
  - [x] Thêm `totalDebt` vào `Customer` interface.
  - [x] Tạo mới `CustomerTransaction` interface.
  - [x] Bổ lưu `serviceWarrantyExpiresAt` vào `RepairTicket`.
  - [x] Mở rộng type cho `InventoryLog` (`REPAIR_RETURN`).

- [x] **Giai đoạn 2: Settings & Cấu hình Ngân hàng (OTP)**
  - [x] Cập nhật `src/app/admin/settings/integrations/page.tsx` để thêm UI thiết lập Ngân hàng (Mã NH, STK, Tên tài khoản).
  - [x] Tích hợp API/Cơ chế OTP để khóa/mở form sửa thông tin Ngân hàng.
  - [x] Tạo API Backend `/api/admin/bank-config` để verify OTP và lưu cấu hình.

- [x] **Giai đoạn 3: Cấu trúc lại Module Sửa chữa (Repairs)**
  - [x] Xóa/Ẩn UI Thanh toán hiện tại trên `src/app/admin/repairs/page.tsx`.
  - [x] Thêm nút **"Đưa lên POS"** giúp tự động mở tab POS với tham số URL `?phone=...`
  - [x] Tự động gán `serviceWarrantyExpiresAt` (+3 tháng) nếu phiếu Hoàn tất không có `parts`.
  - [x] Viết chức năng "Hoàn trả kho" trong tab Linh kiện bằng `runTransaction` + `InventoryLog`.

- [x] **Giai đoạn 4: Trung tâm Thanh toán POS**
  - [x] Cập nhật UI POS (`src/app/admin/pos/page.tsx`) đọc tham số `?phone=` từ URL.
  - [x] Mở rộng hàm `lookupRepairByPhone` để quét toàn bộ phiếu `paymentStatus != 'paid'` và hiện danh sách check chọn.
  - [x] Ánh xạ phiếu sửa chữa + quà tặng (0đ) vào Giỏ hàng POS.
  - [x] Thêm ô nhập `shippingFee` sử dụng `CurrencyInput`.
  - [x] Thêm cảnh báo Warning Banner đỏ nếu `customer.totalDebt > 0`.
  - [x] Thêm Checkbox "Dùng số dư cấn trừ nợ cũ" tại khu vực thanh toán khi Khách đưa > Tổng Bill.

- [x] **Giai đoạn 5: Xử lý Giao dịch POS Checkout (runTransaction)**
  - [x] Cập nhật transaction trong `handleCheckout`:
    - [x] Cập nhật inventory_logs và stock.
    - [x] Nếu phương thức là 'Debt': chuyển `paymentStatus = 'debt'`, cập nhật `Customer.totalDebt`, tạo log `CustomerTransaction(DEBT)`.
    - [x] Nếu có đánh dấu các Phiếu sửa chữa: update `status = 'Completed'`, `paymentStatus = 'paid'` cho các phiếu đó.
    - [x] Xử lý sinh log `CustomerTransaction(PAYMENT)` nếu có Checkbox cấn trừ nợ.

- [x] **Giai đoạn 6: In Hóa đơn có QR Ngân hàng**
  - [x] Fetch cấu hình ngân hàng lúc in hóa đơn (hoặc lưu sẵn ở Context).
  - [x] Generate link ảnh VietQR dựa trên STK, Tổng tiền, ID Đơn hàng.
  - [x] Cập nhật component Hóa đơn POS thêm QR và block nợ cũ/trả dư.

- [x] **Giai đoạn 7: Quản lý Công nợ Khách sỉ (FIFO)**
  - [x] Bổ sung cột "Công nợ" và toggle lọc ở `src/app/admin/customers/page.tsx`.
  - [x] Trong Customer Drawer: Thiết kế tab "Công Nợ / Thu Nợ".
  - [x] Xây dựng thuật toán phân bổ thu nợ (Gạch hóa đơn cũ nhất theo FIFO).
  - [x] Gọi `runTransaction` để update các hóa đơn sang `paid`, giảm nợ KH, và sinh `CustomerTransaction(PAYMENT)`.

- [x] **Giai đoạn 8: Cập nhật Báo cáo Doanh thu (Revenue)**
  - [x] Sửa đổi truy vấn trang `src/app/admin/revenue/page.tsx`.
  - [x] Tách biểu đồ/chỉ số "Doanh thu Thực thu" và "Doanh thu Ghi nợ".
  - [x] Đảm bảo khớp số liệu test case.
