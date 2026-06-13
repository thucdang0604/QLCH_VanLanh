# Tasks: POS Centralization & B2B Debt

- [ ] **Giai đoạn 1: Database Schema & Core Types**
  - [ ] Cập nhật `src/lib/types.ts` cho `Order` (`paymentStatus`, `shippingFee`, `linkedRepairIds`, `payment_method: 'Debt' | 'QR'`).
  - [ ] Thêm `totalDebt` vào `Customer` interface.
  - [ ] Tạo mới `CustomerTransaction` interface.
  - [ ] Bổ lưu `serviceWarrantyExpiresAt` vào `RepairTicket`.
  - [ ] Mở rộng type cho `InventoryLog` (`REPAIR_RETURN`).

- [ ] **Giai đoạn 2: Settings & Cấu hình Ngân hàng (OTP)**
  - [ ] Cập nhật `src/app/admin/settings/integrations/page.tsx` để thêm UI thiết lập Ngân hàng (Mã NH, STK, Tên tài khoản).
  - [ ] Tích hợp API/Cơ chế OTP để khóa/mở form sửa thông tin Ngân hàng.
  - [ ] Tạo API Backend `/api/admin/bank-config` để verify OTP và lưu cấu hình (nếu cần thiết).

- [ ] **Giai đoạn 3: Cấu trúc lại Module Sửa chữa (Repairs)**
  - [ ] Xóa/Ẩn UI Thanh toán hiện tại trên `src/app/admin/repairs/page.tsx`.
  - [ ] Thêm nút **"Đưa lên POS"** giúp tự động mở tab POS với tham số URL `?phone=...`
  - [ ] Tự động gán `serviceWarrantyExpiresAt` (+3 tháng) nếu phiếu Hoàn tất không có `parts`.
  - [ ] Viết chức năng "Hoàn trả kho" trong tab Linh kiện bằng `runTransaction` + `InventoryLog`.

- [ ] **Giai đoạn 4: Trung tâm Thanh toán POS**
  - [ ] Cập nhật UI POS (`src/app/admin/pos/page.tsx`) đọc tham số `?phone=` từ URL.
  - [ ] Mở rộng hàm `lookupRepairByPhone` để quét toàn bộ phiếu `paymentStatus != 'paid'` và hiện danh sách check chọn.
  - [ ] Ánh xạ phiếu sửa chữa + quà tặng (0đ) vào Giỏ hàng POS.
  - [ ] Thêm ô nhập `shippingFee` sử dụng `CurrencyInput`.
  - [ ] Thêm cảnh báo Warning Banner đỏ nếu `customer.totalDebt > 0`.
  - [ ] Thêm Checkbox "Dùng số dư cấn trừ nợ cũ" tại khu vực thanh toán khi Khách đưa > Tổng Bill.

- [ ] **Giai đoạn 5: Xử lý Giao dịch POS Checkout (runTransaction)**
  - [ ] Cập nhật transaction trong `handleCheckout`:
    - [ ] Cập nhật inventory_logs và stock.
    - [ ] Nếu phương thức là 'Debt': chuyển `paymentStatus = 'debt'`, cập nhật `Customer.totalDebt`, tạo log `CustomerTransaction(DEBT)`.
    - [ ] Nếu có đánh dấu các Phiếu sửa chữa: update `status = 'Completed'`, `paymentStatus = 'paid'` cho các phiếu đó.
    - [ ] Xử lý sinh log `CustomerTransaction(PAYMENT)` nếu có Checkbox cấn trừ nợ.

- [ ] **Giai đoạn 6: In Hóa đơn có QR Ngân hàng**
  - [ ] Fetch cấu hình ngân hàng lúc in hóa đơn (hoặc lưu sẵn ở Context).
  - [ ] Generate link ảnh VietQR dựa trên STK, Tổng tiền, ID Đơn hàng.
  - [ ] Cập nhật component Hóa đơn POS thêm QR và block nợ cũ/trả dư.

- [ ] **Giai đoạn 7: Quản lý Công nợ Khách sỉ (FIFO)**
  - [ ] Bổ sung cột "Công nợ" và toggle lọc ở `src/app/admin/customers/page.tsx`.
  - [ ] Trong Customer Drawer: Thiết kế tab "Công Nợ / Thu Nợ".
  - [ ] Xây dựng thuật toán phân bổ thu nợ (Gạch hóa đơn cũ nhất theo FIFO).
  - [ ] Gọi `runTransaction` để update các hóa đơn sang `paid`, giảm nợ KH, và sinh `CustomerTransaction(PAYMENT)`.

- [ ] **Giai đoạn 8: Cập nhật Báo cáo Doanh thu (Revenue)**
  - [ ] Sửa đổi truy vấn trang `src/app/admin/revenue/page.tsx`.
  - [ ] Tách biểu đồ/chỉ số "Doanh thu Thực thu" và "Doanh thu Ghi nợ".
  - [ ] Đảm bảo khớp số liệu test case.
