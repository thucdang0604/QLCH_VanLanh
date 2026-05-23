# User Flows - Văn Lành Service Management System

## 1. Quy trình Sửa chữa (Repair Workflow)
Đây là quy trình cốt lõi của hệ thống, kết nối giữa khách hàng và kỹ thuật viên.

### Flow chính:
1. **Tiếp nhận**: Khách mang máy đến -> Admin kiểm tra, tạo **Repair Ticket** trong hệ thống.
   - *Hệ thống*: Sinh mã Ticket ID, gửi thông báo cho khách (nếu có).
2. **Kiểm tra & Báo giá**: Kỹ thuật viên (Technician) kiểm tra chi tiết -> Cập nhật linh kiện cần thay và tiền công.
   - *Hệ thống*: Chuyển trạng thái Ticket thành "Đang chờ báo giá" hoặc "Đang sửa chữa".
3. **Thực hiện**: Technician thay thế linh kiện.
   - *Hệ thống*: Khi thêm linh kiện vào Ticket, số lượng tương ứng trong kho chuyển từ `stock` sang `held`.
4. **Hoàn tất**: Máy sửa xong -> Admin kiểm tra cuối -> Khách thanh toán.
   - *Hệ thống*: Xuất hóa đơn, in tem bảo hành (tự động tính ngày hết hạn), trừ vĩnh viễn số lượng trong kho.
5. **Sau sửa chữa**: Hệ thống tự động mời khách hàng đánh giá (Geofenced Review).

## 2. Quy trình Mua sắm (E-commerce Flow)
1. **Khám phá**: Khách hàng truy cập Storefront qua các trang Category hoặc Search.
2. **Giỏ hàng**: Thêm sản phẩm vào giỏ, chọn variant (màu sắc, dung lượng).
3. **Thanh toán (Checkout)**: Nhập thông tin giao hàng -> Hệ thống tính toán phí ship (nếu có).
4. **Xử lý đơn**: Admin nhận đơn hàng trong Dashboard -> Xác nhận -> Giao hàng.
   - *Hệ thống*: Giảm tồn kho sản phẩm tương ứng.

## 3. Quy trình Sáng tạo nội dung với AI (AI Content Flow)
1. **Yêu cầu**: Admin vào mục "Tin tức" -> "Tạo bài viết với AI".
2. **Input**: Nhập chủ đề hoặc từ khóa (ví dụ: "Cách bảo quản pin iPhone").
3. **Xử lý AI**: Hệ thống gọi Gemini API để tạo nội dung Markdown bao gồm Tiêu đề, Mô tả và Nội dung chi tiết.
4. **Biên tập**: Admin chỉnh sửa lại bằng Quill Editor, thêm ảnh minh họa.
5. **Xuất bản**: Bài viết hiển thị trên Storefront, tự động có Schema SEO.

## 4. Quy trình Quản lý Menu động (Dynamic Menu Flow)
1. **Chỉnh sửa**: Admin vào "Cài đặt" -> "Menu điều hướng".
2. **Cấu trúc**: Thêm/Xóa/Sắp xếp các item menu hoặc sub-menu.
3. **Cập nhật**: Lưu thay đổi.
   - *Hệ thống*: Cập nhật tài liệu `navigation_settings` trong Firestore. Trang Storefront (Customer) sẽ tự động hiển thị menu mới nhờ cơ chế revalidation.

## 5. Quy trình Tiếp nhận Bảo hành (Warranty Flow)
Quy trình dành riêng cho các máy đã từng sửa chữa tại cửa hàng và quay lại bảo hành linh kiện.

### Các bước thực hiện:
1. **Tra cứu**: Admin tra cứu phiếu cũ qua Số điện thoại, IMEI hoặc mã Ticket.
2. **Kích hoạt**: Mở phiếu gốc -> Chọn "Tạo phiếu bảo hành".
   - *Hệ thống*: Hiển thị danh sách các linh kiện đã thay thế kèm ngày hết hạn. Tự động ẩn hoặc cảnh báo nếu linh kiện đã quá hạn.
3. **Chọn linh kiện**: Admin tích chọn (Check) linh kiện khách hàng mang đến khiếu nại.
   - *Hệ thống*: Kiểm tra xem có phiếu bảo hành nào khác đang xử lý (Active) cho máy này không để tránh tạo trùng.
4. **Khởi tạo**: Hệ thống sinh **Warranty Ticket** mới (loại phiếu: `warranty`).
   - *Hệ thống*: Tự động sao chép thông tin Khách hàng, Thiết bị và liên kết ID phiếu gốc (`originalTicketId`).
5. **Xử lý**: Kỹ thuật viên kiểm tra lỗi bảo hành -> Thực hiện khắc phục hoặc đổi linh kiện mới.
6. **Kết thúc**: 
   - Nếu bảo hành thành công: Đóng phiếu (Done).
   - Nếu không bảo hành được (Lỗi khách hàng, cháy nổ...): Trả máy (Out).
   - Nếu lỗi nặng/không linh kiện thay thế: Hoàn phí (**Refund**) -> Hệ thống tự động trừ hoa hồng đã tính cho KTV ở phiếu cũ.
