# DANH SÁCH TÌNH TRẠNG CÁC TÍNH NĂNG (Văn Lành Services)

Dưới đây là tổng hợp tình trạng phát triển của dự án, các tính năng nào đã hoàn thiện và tính năng nào còn cần phải phát triển trong tương lai, dựa trên hồ sơ tài liệu của dự án.

## 🟢 CÁC TÍNH NĂNG ĐÃ HOÀN THÀNH (Phase 1, 2, 3)

### 1. Hệ Thống Cốt Lõi & Phân Quyền
- [x] Tích hợp Firebase Auth (Email/Password + Google).
- [x] Hệ thống phân quyền RBAC (Role-Based Access Control) cho Admin, Staff, và Customer.
- [x] Trang đăng nhập Admin được bảo mật (Protected Routes).
- [x] Tích hợp Firestore database và Firebase Storage (quản lý ảnh/video).
- [x] Hệ thống Dynamic Config (cấu hình giao diện động qua `system_config`).

### 2. Quản Lý Sửa Chữa (Mini-ERP)
- [x] **State Machine (Quy trình Sửa chữa):** Quản lý quy trình sửa chữa theo dạng Node Graph với `allowedNext[]` (10 trạng thái từ lúc tiếp nhận đến khi trả máy/hoàn phí). Cấu hình trực quan dạng kéo thả.
- [x] **Khu vực Kỹ thuật viên (KTV):** Biểu diễn dạng Kanban + List view. Ẩn giá, ẩn thông tin tạo phiếu, KTV chỉ cập nhật trạng thái theo đúng luồng.
- [x] **Tracking Groups (Tra cứu khách hàng):** Gộp nhóm trạng thái, ẩn thời gian, xem tiến độ trực quan qua số điện thoại.
- [x] **Chốt chặn Bàn giao (Payment Gate):** Modal bắt buộc hiển thị phần tài chính (số tiền còn nợ/cọc) trước khi hoàn tất hoặc chuyển máy qua trạng thái hoàn phí. Đảm bảo thu tiền trước khi xuất.
- [x] **Quản lý Lịch hẹn (Appointments):** Luồng luân chuyển từ Đặt lịch -> Tạo phiếu sửa chữa.

### 3. Bán Hàng & Kho (POS & Inventory)
- [x] **Module Bán hàng POS:** Bán hàng tại quầy nhanh chóng, dự phòng hình ảnh khi lỗi mạng.
- [x] **Đơn hàng (Orders):** Quản lý đơn hàng bán lẻ (Đồng bộ Real-time qua Firebase).
- [x] **Quản lý Kho:** Nhập hàng phân nhánh (Linh kiện / Sản phẩm bán lẻ), tự do điền nội dung.
- [x] **Tồn Kho:** Bảng tổng hợp tồn kho có chức năng phân loại và cảnh báo sắp/đã hết hàng.

### 4. Nhân Sự & Kế Toán
- [x] **Hoa hồng 3 cấp (Commissions):** Theo ưu tiên Cấp 3 (từng sản phẩm) -> Cấp 2 (danh mục) -> Cấp 1 (mặc định toàn bộ).
- [x] **Quản lý Nhân sự & Doanh thu:** Phân quyền và tính toán báo cáo cho toàn bộ nội bộ nhân viên.

### 5. Trải Nghiệm Khách Hàng (UX) & Marketing
- [x] **AI Chatbot (Gemini Cải Tiến):** Hỗ trợ RAG truy xuất giá và dịch vụ từ Firestore, có bộ nhớ hội thoại, logic phản hồi tự nhiên, độ trễ 30s. Cho phép Admin bật/tắt (Toggle) thủ công.
- [x] **Đánh giá Khách hàng (Reviews):** Inline Review sau khi nhận máy, QR Code Đánh giá, Widget đánh giá nổi bật (Floating).
- [x] **CMS Bài Viết:** Quản trị nội dung tin tức, khuyến mãi dùng `react-quill` có hỗ trợ nhúng thẻ Video (Youtube/FB).
- [x] **Multi-channel Contact:** Nút liên hệ gộp (Zalo, Messenger, AI Chatbot).
- [x] **Thông Báo & Dashboard:** Trung tâm thông báo chia tab, đếm số người Online theo thời gian thực (Realtime DB), theo dõi lượt truy cập bài đăng.

---

## 🔴 CÁC VẤN ĐỀ / TÍNH NĂNG CHƯA HOÀN THÀNH (Future)

Đây là các tính năng được lên kế hoạch phát triển tiếp theo hoặc cần được hoàn thiện:

- [ ] **Thông báo qua Email (Email notifications):** Gửi email cho khách hàng hoặc nội bộ khi đơn sửa chữa thay đổi trạng thái hoặc để marketing.
- [ ] **Đa ngôn ngữ (Multi-language support):** Hỗ trợ dịch trang web cho đối tượng khách không sử dụng tiếng Việt.
- [ ] **Hỗ trợ PWA (Progressive Web App):** Chuyển website thành app cài đặt trên thiết bị di động, hoạt động mượt mà hơn như app Native.
- [ ] **Máy quét Mã vạch/QR (Barcode/QR scanner cho POS):** Tích hợp ứng dụng quét mã cho thiết bị di động hoặc máy Scan mã vạch vật lý để thao tác thêm sản phẩm POS nhanh hơn.
- [ ] **Xuất báo cáo định dạng PDF (PDF export reports):** Xuất trực tiếp các hóa đơn bàn giao máy, lịch sử doanh thu định dạng PDF cho kế toán lưu trữ bản cứng dễ dàng hơn. Cải tiến PrintableReceipt (đang phát triển phần cài đặt template).
- [ ] **Hệ thống nhắc nhở tự động:** (Gợi ý) Nhắc nhở lễ tân nếu để một đơn tồn tại một trạng thái quá lâu (ví dụ "Đang kiểm tra" quá X giờ).
