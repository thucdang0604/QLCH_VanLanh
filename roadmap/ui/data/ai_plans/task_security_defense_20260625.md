# Danh Sách Nhiệm Vụ: Giám Sát An Ninh & Phòng Thủ Chủ Động

Bảng checklist chi tiết các đầu việc cần thực hiện để xây dựng hệ thống bảo mật chủ động cho dự án QLCH_VanLanh.

---

## 🚀 DANH SÁCH CÁC ĐẦU VIỆC

### 1. Phân Đoạn 1: Tối Ưu Cấu Hình Hạ Tầng & Ngân Sách
- [ ] Chỉnh sửa tệp [firebase.json](file:///m:/QLCH_VanLanh/firebase.json) nâng cấu hình `memory` lên `1GiB` hoặc `2GiB` để xử lý các tác vụ Excel và hình ảnh ổn định.
- [ ] Chỉnh sửa tệp [firebase.json](file:///m:/QLCH_VanLanh/firebase.json) hạ cấu hình `maxInstances` của `frameworksBackend` xuống `3` để khóa chặt mức chi phí trần tối đa khi bị tấn công.
- [ ] Truy cập Google Cloud Console -> Billing -> Budgets & Alerts để cấu hình các mốc cảnh báo chi tiêu (200.000 VNĐ, 500.000 VNĐ) gửi qua Email/Slack.

### 2. Phân Đoạn 2: Xây Dựng Tường Lửa Middleware & Tích Hợp Redis
- [ ] Chạy lệnh cài đặt các gói thư viện `@upstash/ratelimit` và `@upstash/redis` vào dự án.
- [ ] Tạo tài khoản và khởi tạo một Serverless Redis database miễn phí trên Upstash, lấy URL và Token kết nối an toàn.
- [ ] Cấu hình các biến môi trường kết nối Redis (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) trong tệp `.env.local` và trang cấu hình biến môi trường của Firebase.
- [ ] Viết tệp helper `src/lib/rateLimiter.ts` để thiết lập kết nối và định nghĩa quy tắc chặn (tối đa 60 request/phút trên mỗi IP, tự động blacklist IP khi vượt 200 request/phút).
- [ ] Tạo tệp Next.js Middleware `src/middleware.ts` để chặn và kiểm tra IP của toàn bộ các request gửi tới các route API `/api/**`.
- [ ] Xử lý loại trừ (Bypass) kiểm tra tần suất đối với các API tĩnh hoặc không tốn tài nguyên (nếu có).

### 3. Phân Đoạn 3: Phát Triển Dashboard An Ninh Cho Admin
- [ ] Tạo trang giao diện an ninh tại `src/app/admin/security/page.tsx` hiển thị biểu đồ tần suất truy cập realtime, danh sách IP đáng ngờ nhất và danh sách các IP đang bị chặn.
- [ ] Viết API Route `/api/admin/security/block` hỗ trợ phương thức POST để ghi một IP vào danh sách đen của Redis theo yêu cầu thủ công của quản trị viên.
- [ ] Viết API Route `/api/admin/security/unblock` hỗ trợ phương thức POST để gỡ bỏ một IP khỏi danh sách đen của Redis.
- [ ] Thêm liên kết dẫn tới trang An Ninh (`/admin/security`) trong menu điều hướng của trang quản trị Admin Sidebar.

### 4. Phân Đoạn 4: Thắt Chặt Quy Tắc Storage & App Check
- [ ] Cập nhật tệp [storage.rules](file:///m:/QLCH_VanLanh/storage.rules) để khóa hoàn toàn quyền upload trực tiếp của người dùng ẩn danh lên các thư mục chứa tệp lớn.
- [ ] Viết API Route `/api/media/upload-url` thực hiện xác thực người dùng và kiểm tra điều kiện nghiệp vụ (ví dụ: chỉ cho phép upload ảnh nếu họ có lịch sửa chữa hoặc hóa đơn hợp lệ), sau đó sử dụng Admin SDK để sinh ra Presigned URL tải lên Storage an toàn.
- [ ] Tích hợp SDK Firebase App Check ở phía Web Client, cấu hình sử dụng reCAPTCHA v3 để bảo vệ Firestore, Storage và Cloud Functions khỏi các truy cập giả mạo từ script tự động bên ngoài.

---

## 📊 TIẾN ĐỘ THỰC HIỆN
- **Trạng thái kế hoạch:** Đang chuẩn bị (Awaiting Approval)
- **Tiến độ tổng thể:** 0% hoàn thành
