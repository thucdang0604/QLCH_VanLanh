# Walkthrough: POS Centralization & B2B Debt

> [!NOTE]
> Chiến dịch **POS Centralization & B2B Debt** đã hoàn tất 100%. Dưới đây là tổng hợp các thay đổi quan trọng đã được tích hợp vào hệ thống, nhằm mục đích tập trung mọi luồng thanh toán (Bán hàng, Sửa chữa, Đóng cọc) về một màn hình POS duy nhất, cũng như xây dựng hệ thống quản lý công nợ (B2B) và thanh toán QR tự động.

## 1. Cấu trúc Database (Core Types)
- **Customer**: Bổ sung trường `totalDebt` để theo dõi dư nợ của khách hàng (Khách sỉ).
- **Order**: Mở rộng `paymentStatus` (chứa trạng thái `debt`), `shippingFee`, `linkedRepairIds`. Thêm phương thức thanh toán `DEBT` và `QR`.
- **RepairTicket**: Tích hợp `serviceWarrantyExpiresAt` (bảo hành dịch vụ sửa chữa) thay vì chỉ bảo hành linh kiện.
- **CustomerTransaction**: Tạo schema lưu trữ mọi giao dịch công nợ (PAYMENT, DEBT) của khách hàng.

## 2. Cấu hình Ngân hàng & OTP
- **Admin Settings (`src/app/admin/settings/integrations/page.tsx`)**: Đã thiết kế giao diện nhập `bankId`, `accountNo`, `accountName`.
- **Bảo mật OTP**: Mọi thay đổi cấu hình Ngân hàng đều yêu cầu nhập mã OTP (gửi qua Admin Email/Telegram) trước khi lưu, đảm bảo an toàn tuyệt đối tránh việc đổi STK trục lợi. API `/api/admin/bank-config` chịu trách nhiệm verify.

## 3. Module Sửa chữa (Repairs)
- **Tách biệt Thanh toán**: Nút "Thanh toán" tại màn hình Quản lý Sửa chữa đã được đổi thành **"Đưa lên POS"**. Khi click, hệ thống tự động redirect sang trang POS và truyền tham số `?phone=...` qua URL.
- **Bảo hành thông minh**: Tự động set `serviceWarrantyExpiresAt` = 3 tháng kể từ lúc Hoàn thành phiếu nếu phiếu sửa chữa không sử dụng linh kiện thay thế nào (chỉ tính công thợ).
- **Hoàn trả kho**: Xử lý logic hoàn trả linh kiện bằng `runTransaction`, lưu log `InventoryLog` với type `REPAIR_RETURN`.

## 4. POS Centralization (Trung tâm POS)
- **Tự động Lookup**: POS tự động nhận diện `phone` từ URL và quét tất cả các Phiếu sửa chữa chưa thanh toán của khách hàng đó. Cho phép nhân viên check/chọn phiếu muốn thanh toán.
- **Ánh xạ Giỏ hàng**: Chuyển đổi Phiếu sửa chữa thành "sản phẩm" trong giỏ POS (gộp cả Linh kiện và Tiền công, kèm Quà tặng 0đ nếu có).
- **Phí giao hàng**: Tích hợp ô nhập Shipping Fee trực tiếp trên POS.
- **Cấn trừ Công nợ**: Nếu Khách hàng đưa dư tiền mặt so với Bill, thu ngân có thể check chọn ô "Dùng số dư cấn trừ nợ cũ" để gạch nợ luôn trên 1 phiên giao dịch.

## 5. POS Checkout (Transaction)
- **Đảm bảo tính ACID**: Khi Checkout từ POS, sử dụng `runTransaction` tại backend để thực thi:
  1. Trừ/Hold Stock linh kiện và sản phẩm.
  2. Ghi nhận `Customer.totalDebt` nếu khách chọn thanh toán bằng Ghi nợ (DEBT).
  3. Cập nhật trạng thái các Phiếu sửa chữa liên quan thành `Completed` & `paid`.
  4. Lưu vết lịch sử `CustomerTransaction`.

## 6. Thanh toán Hóa đơn & VietQR
- **Hóa đơn in (Receipt)**: Component Hóa đơn tự động fetch cấu hình Ngân hàng từ Firestore và sinh ảnh VietQR qua chuẩn `img.vietqr.io`.
- QR chứa sẵn STK, Số tiền, và Nội dung chuyển khoản (Mã Đơn/Khách hàng), giúp khách hàng thanh toán 1 chạm.
- Ẩn QR Code nếu đơn hàng là thanh toán Ghi nợ (Debt) hoặc đã thanh toán hết.

## 7. Quản lý Công nợ (Khách Sỉ) & Thuật toán FIFO
- **Khách hàng (Customers Page)**: Thêm cột "Công nợ" và bộ lọc "Chỉ xem Khách có nợ". Cảnh báo Banner Đỏ trên POS nếu Khách hàng đang có nợ xấu.
- **Thu Nợ (Customer Detail Drawer)**: Xây dựng tab "Thu Nợ" riêng biệt.
- **Thuật toán FIFO (`/api/admin/customers/collect-debt/route.ts`)**: 
  - Khách hàng có thể trả 1 số tiền bất kỳ (VD: 5.000.000đ).
  - API dùng `runTransaction` để tự động dò tìm các Đơn hàng (Orders) đang có trạng thái `paymentStatus = 'debt'` từ CŨ NHẤT đến MỚI NHẤT.
  - Số tiền sẽ được "gạch nợ" dần cho từng hóa đơn đến khi hết. Ghi lại vào `paymentHistory` của từng đơn hàng.

## 8. Cập nhật Báo cáo Doanh thu (Revenue)
- **Tách bạch Dòng tiền**: `src/app/admin/revenue/page.tsx` đã được nâng cấp.
- **Doanh thu Thực thu (Tiền đã vào túi)**: Tính toán chính xác dựa trên `paymentHistory` (gồm Tiền mặt, Bank, POS, Thu nợ từ khách). 
- **Doanh thu Ghi nợ (Tiền nằm ngoài)**: Thể hiện rõ phần dư nợ phát sinh trong ngày để Kế toán dễ đối soát.
