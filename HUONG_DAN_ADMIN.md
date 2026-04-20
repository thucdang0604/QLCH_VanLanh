# HƯỚNG DẪN SỬ DỤNG CHO QUẢN TRỊ VIÊN (ADMIN DASHBOARD)
*Dự án Văn Lành Services (qlch-vanlanh.web.app)*

Tài liệu này hướng dẫn quản trị viên cách sử dụng và hiểu được cơ chế hoạt động của những tính năng trọng yếu trong hệ thống Admin Dashboard.

---

## 1. TỔNG QUAN HỆ THỐNG
**Đường dẫn:** `/admin`
Khu vực này được bảo vệ bởi hệ thống RBAC (Role-Based Access Control). Customer không thể truy cập.
- **Admin:** Có toàn quyền.
- **Staff (Nhân viên/KTV):** Bị giới hạn không xem được Báo cáo doanh thu, cài đặt hệ thống, quản lý nhân viên.

Dashboard tổng quan cung cấp cho bạn:
- Tình trạng Khách đang online trực tuyến (Live Visitor Counter qua Realtime DB).
- Tổng lượt truy cập hôm nay (Theo vết page views qua Firestore).
- Số lượng phiếu sửa chữa / đơn hàng POS / lịch hẹn đang chờ xử lý.

---

## 2. QUẢN LÝ QUY TRÌNH SỬA CHỮA (TÍNH NĂNG CỐT LÕI)

### A. Cấu Hình Quy Trình (State Machine)
**Đường dẫn:** `/admin/settings/repairs` (Chỉ Admin)
**Mô tả:** Quy trình sửa chữa được định nghĩa dạng "Luồng trạng thái" thay vì đường thẳng.
- Bạn có thể **Kéo - Thả** để sắp xếp 10 trạng thái có sẵn.
- Tính năng quan trọng nhất: **"Trạng thái tiếp theo cho phép" (allowedNext)**. Bạn chọn trạng thái A được phép chuyển sang trạng thái nào. (VD: "Đang kiểm tra" CHỈ có thể chuyển tiếp sang "Đã báo giá" hoặc "Hoàn phí"). Điều này ngăn chặn kỹ thuật viên bấm nhầm trạng thái không hợp lệ.

### B. Quản lý Phiếu Sửa Chữa
**Đường dẫn:** `/admin/repairs` (Cho Lễ tân / Quản lý)
- **Tạo phiếu:** Nhập thông tin Khách (nhập số điện thoại, nếu khách quen hệ thống tự load), nhập thiết bị, checklist tình trạng gửi (mật khẩu, vỡ kính,...). Có thể tải ảnh lên (preRepairMedia).
- **Payment Gate (Chốt kiểm tra tài chính):** Khi bạn đổi trạng thái vé sửa chữa thành `Hoàn tất đơn/Chờ bàn giao` hoặc `Out`, hệ thống sẽ TỰ ĐỘNG BẬT lên bảng `Handover Financial`.
  - Bạn THẤY ĐƯỢC: Tổng chi phí, khoản khách đã đặt cọc, số tiền CẦN THU LẠI.
  - Bạn BUỘC PHẢI CHECK vào ô "Tôi xác nhận đã thu đủ số tiền..." trước khi phần mềm cho duyệt trả máy cho khách.

### C. Khu vực Kỹ Thuật Viên
**Đường dẫn:** `/admin/technician` (Cho Staff chuyên sửa)
- **Kanban View:** Giao diện các cột trạng thái cho kỹ thuật viên chia tab trực quan kéo thả.
- Tính năng này đã **Ẩn giá tiền** và ẩn những phiếu đã Hoàn thành/Đã trả. KTV chỉ tập trung vào thiết bị và nút trạng thái hợp lệ. 
- Tại trạng thái cuối (Done/Đã sửa xong), KTV có thể chụp hoặc tải video bàn giao máy lên báo cáo.

---

## 3. CHĂM SÓC KHÁCH HÀNG & AI CHATBOT

### A. Tra Cứu Khách Hàng (Tracking Groups)
- Khi khách tra cứu trên Public site `/tracking` bằng SĐT, website sử dụng **Nhóm tra cứu**.
- Thay vì để khách thấy KTV chuyển 10 trạng thái chi tiết, bạn sẽ gom các nhóm trạng thái nhỏ lại ở góc độ Khách sẽ chỉ là "Đang sửa chữa", "Hoàn tất". Giúp làm **ẩn thời gian thực thi** chi tiết để giảm áp lực cho KTV bị khách giục.

### B. Robot Tư Vấn AI (Gemini Agent)
**Đường dẫn:** `/admin/chat`
- **Tính năng RAG & Memory:** Con bot tự phân tích dữ liệu bảng Giá Sản phẩm và Dịch Vụ tại Firestore của cửa hàng để phản hồi chính xác chứ không "chém gió".
- **Độ trễ 30 giây:** Bot chỉ lên tiếng nếu khách chat 30 giây mà Lễ tân (người thật) chưa trả lời.
- **Tắt ngang Bot:** Tại giao diện chat trong admin, nếu lễ tân nhận thấy khách cần tư vấn sâu, có thể bấm nút Tắt Bot đi tại phiên hội thoại đó để trực tiếp hỗ trợ khách thủ công.

### C. Quản lý Đánh giá Review
**Đường dẫn:** `/admin/reviews`
- Các đánh giá được khách quét QR hoặc đánh giá từ trang tra cứu bảo hành sẽ chạy về đây.
- Admin có quyền Duyệt / Ẩn (Approved/Pending/Rejected) để những đánh giá tốt được hiển thị tự động trên thanh Cuộn ngoài trang chủ (Floating Reviews).

---

## 4. QUẢN LÝ BÁN LẺ & KHO HÀNG

### A. Tồn Kho Tổng Hợp
**Đường dẫn:** `/admin/inventory` và `/admin/inventory/stock`
- Bạn có thể **Nhập hàng** cho cả Linh Kiện (dành riêng sửa chữa) hoặc Sản Phẩm bán lẻ.
- Trang Tồn Kho: Liệt kê số liệu hàng hóa để bạn tracking, có hiển thị cảnh báo đỏ hoặc cam nếu sản phẩm Sắp Hết hoặc Đã Hết (out of stock).

### B. Hoa Hồng Kỹ Thuật / Sale (Commission Rule)
**Đường dẫn:** `/admin/commissions`
Hệ thống ưu tiên 3 cấp bậc tính phần trăm / chiết khấu:
1. **Cấp 3 (Ưu tiên nhất):** Gắn hoa hồng theo 1 ID thiết bị/dịch vụ cụ thể (VD: Thay pin iPhone X hoa hồng 20K).
2. **Cấp 2:** Gắn hoa hồng theo cả Danh Mục (VD: Phụ kiện hoa hồng 10%).
3. **Cấp 1:** Mặc định chung cho toàn bộ đơn hàng nếu 2 mức trên không bắt được logic.

### C. Máy POS Bán Quầy
**Đường dẫn:** `/admin/pos`
- Dùng cho lễ tân bán sạc cap bao da tại quầy nhanh chóng ra bill, giao diện lớn và lược bớt thông tin dư thừa của e-commerce.

---

## 5. NỘI DUNG & WEBSITE CÔNG KHAI

### CMS Bài Viết Tin Tức
**Đường dẫn:** `/admin/articles`
- Dễ dàng định đạng bài viết, chèn ảnh, viết bài blog SEO hỗ trợ từ editor `ReactQuill`.
- Nếu bạn muốn đưa clip từ Facebook hoặc YouTube vào bài viết: Bạn chỉ cần Dán nguyên URL vào trường Nhúng (EmbedUrl) để nó hiện Video to đầu bài, hoặc dùng công cụ dải băng để nhúng vào chính giữa bài viết một cách linh hoạt. Mọi thứ được quản lý tự động, không yêu cầu kỹ thuật chèn code iframe.

---
**Một vài lưu ý nhỏ:**
- Việc thay đổi chi tiết như Số Điện Thoại tổng đài, Liên kết Zalo, Facebook, Màu sắc chủ đạo của dự án, v.v., đều có thể thay đổi dễ dàng tại phần Cài Đặt (Dynamic Config), hệ thống sẽ tự update không cần code lại.
