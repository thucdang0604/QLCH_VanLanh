# Kế Hoạch Triển Khai Giám Sát An Ninh & Phòng Thủ Chủ Động (Active Defense)

Kế hoạch này thiết lập một hệ thống bảo mật chủ động toàn diện cho dự án QLCH_VanLanh, bao gồm giới hạn tài nguyên an toàn, tường lửa Next.js Middleware (sử dụng Upstash Redis), trang quản lý an ninh trực quan (Security Dashboard) và thắt chặt an toàn upload Firebase Storage.

---

## 1. Thành Phần Đề Xuất Thay Đổi

### 1.1. Cấu Hình Hạ Tầng & Ngân Sách An Toàn (`firebase.json`)
- **Tối ưu hóa RAM:** Tăng bộ nhớ Next.js API/SSR từ `512MiB` lên `1GiB` hoặc `2GiB` để xử lý mượt mà các tác vụ nặng mà không lo sập nguồn (OOM).
- **Giới hạn số lượng Instance tối đa (maxInstances):** Giảm `maxInstances` từ `10` xuống `3`. Việc này giúp giảm chi phí trần tối đa khi bị tấn công spam 24/7 suốt 1 tháng từ 8.000.000 VNĐ xuống còn dưới **2.400.000 VNĐ/tháng**, trong khi hiệu năng lúc bình thường vẫn được đảm bảo tuyệt đối nhờ cơ chế xử lý đồng thời (Concurrency).
- **Cấu hình GCP Billing Alerts:** Thiết lập cảnh báo ngân sách tự động gửi email/Slack khi chi phí dự án chạm mốc 200.000 VNĐ và 500.000 VNĐ.

### 1.2. Tường Lửa Next.js Middleware & Upstash Redis (`middleware.ts`)
- Triển khai bộ lọc giới hạn tần suất (Rate Limiter) tại Next.js Middleware để kiểm tra IP của tất cả các request trước khi chạm vào logic nghiệp vụ và cơ sở dữ liệu Firestore.
- Kết nối tới dịch vụ Upstash Redis (lưu trữ RAM tốc độ cao, miễn phí 10.000 request/ngày) qua giao thức HTTP REST siêu nhẹ (độ trễ dưới 3ms).
- **Cơ chế hoạt động:**
  - Nếu một IP vượt quá 60 request/phút, Middleware lập tức từ chối và trả về mã lỗi HTTP 429 (Too Many Requests).
  - Nếu IP đó cố tình spam liên tục vượt quá 200 request/phút, Middleware tự động ghi IP này vào danh sách đen (Blacklist) trong Redis với thời gian hết hạn (TTL) là 24 giờ.
  - Trong vòng 24 giờ tiếp theo, mọi yêu cầu từ IP này sẽ bị chặn đứng ngay từ cổng vào (HTTP 403 Forbidden) trong vòng 2 mili-giây, bảo vệ tuyệt đối database Firestore khỏi bị quá tải và phát sinh chi phí đọc/ghi.

### 1.3. Trang Quản Lý An Ninh Trực Quan (`/admin/security`)
Xây dựng một giao diện quản trị an ninh chuyên dụng trong hệ thống Admin để theo dõi và đưa ra phản ứng kịp thời:
- **Biểu đồ trực quan:** Hiển thị lưu lượng truy cập realtime (Requests Per Second), tỉ lệ lỗi 4xx/5xx và danh sách các IP/thiết bị đang gửi nhiều yêu cầu nhất.
- **Nút chặn thủ công (Manual Block):** Cung cấp danh sách đen các IP và nút **[Chặn IP]** bên cạnh mỗi IP đáng ngờ. Khi quản trị viên bấm nút, IP đó sẽ lập tức được đồng bộ vào danh sách đen của Middleware để chặn đứng kết nối ngay từ mili-giây tiếp theo.

### 1.4. Nâng Cấp Bảo Mật Firebase Storage (`storage.rules`)
- Thay đổi quy tắc an ninh của Storage để chặn hoàn toàn quyền upload (`write/create`) trực tiếp từ người dùng ẩn danh (unauthenticated) đối với các tệp tin lớn (ảnh 5MB, video 50MB).
- **Giải pháp thay thế:** Xây dựng luồng tải ảnh/video đánh giá sản phẩm thông qua một API trung gian an toàn ở Next.js server (xác thực người dùng, kiểm tra mã đơn hàng hợp lệ rồi mới sinh Presigned URL tải lên Storage), loại bỏ hoàn toàn nguy cơ bị kẻ xấu spam làm cạn kiệt dung lượng bộ nhớ và băng thông GCS.

---

## 2. Kế Hoạch Triển Khai (Lộ Trình Các Bước)

### Phân Đoạn 1: Tối Ưu Cấu Hình Hạ Tầng (An Toàn Tức Thì)
- **File tác động:** [firebase.json](file:///m:/QLCH_VanLanh/firebase.json)
- **Hành động:** Nâng `memory` lên `1GiB` và giảm `maxInstances` xuống `3` để khóa chặt chi phí trần an toàn ở mức thấp nhất.
- **Cấu hình Cloud Console:** Thiết lập GCP Billing Alerts tại trang quản trị Google Cloud.

### Phân Đoạn 2: Xây Dựng Tường Lửa Middleware & Tích Hợp Redis
- **File tác động:** [package.json](file:///m:/QLCH_VanLanh/package.json), [next.config.mjs](file:///m:/QLCH_VanLanh/next.config.mjs), `src/middleware.ts` (mới), `src/lib/rateLimiter.ts` (mới)
- **Hành động:** 
  - Cài đặt thư viện `@upstash/ratelimit` và `@upstash/redis`.
  - Viết helper `rateLimiter.ts` để cấu hình kết nối Redis và định nghĩa các rule chặn (60 req/phút).
  - Tích hợp vào Next.js Middleware để tự động kiểm tra tất cả các request gửi tới `/api/**`.

### Phân Đoạn 3: Phát Triển Dashboard An Ninh Cho Admin
- **File tác động:** `src/app/admin/security/page.tsx` (mới), `src/app/api/admin/security/route.ts` (mới)
- **Hành động:**
  - Tạo trang giao diện an ninh hiển thị danh sách IP đáng ngờ và danh sách đen.
  - Viết API để quản trị viên có thể bấm chặn/gỡ chặn IP thủ công.
  - Tích hợp hiển thị biểu đồ RPS và latency cơ bản từ Cloud Monitoring qua Google APIs (nếu cần thiết).

### Phân Đoạn 4: Thắt Chặt Quy Tắc Storage & App Check
- **File tác động:** [storage.rules](file:///m:/QLCH_VanLanh/storage.rules), `src/app/api/media/upload-url/route.ts` (mới)
- **Hành động:**
  - Cập nhật `storage.rules` chặn upload trực tiếp từ khách vãng lai.
  - Xây dựng API sinh Presigned URL an toàn ở backend để kiểm soát quyền tải lên hình ảnh/video.
  - Kích hoạt và cấu hình Firebase App Check tích hợp reCAPTCHA v3 trên trình duyệt để bảo vệ toàn diện hệ thống.

---

## 3. Kế Hoạch Xác Minh & Nghiệm Thu (Verification Plan)

### 3.1. Thử Nghiệm Tự Động (Automated Load Testing)
- Sử dụng công cụ `autocannon` để mô phỏng một cuộc tấn công spam request cường độ cao từ client gửi tới các API của hệ thống (ví dụ gửi 500 request trong 10 giây).
- **Tiêu chí đạt:** 
  - 60 request đầu tiên phải được xử lý thành công (HTTP 200).
  - Từ request thứ 61 trở đi, hệ thống phải phản hồi ngay lập tức với mã lỗi HTTP 429 và thời gian xử lý dưới 5ms.
  - Các request tiếp theo từ giây thứ 15 trở đi phải bị chặn cứng với mã lỗi HTTP 403 (do IP đã bị tự động đưa vào danh sách đen).

### 3.2. Xác Minh Thủ Công (Manual Verification)
- Truy cập trang `/admin/security` kiểm tra xem danh sách các IP truy cập và số lượng request có hiển thị trực quan và chính xác theo thời gian thực hay không.
- Thử nghiệm tính năng chặn thủ công: Bấm nút **[Chặn IP]** cho IP của một thiết bị test, sau đó dùng thiết bị đó truy cập lại trang web để kiểm tra xem có bị chặn ngay lập tức với lỗi HTTP 403 hay không. Bấm **[Gỡ Chặn]** và kiểm tra xem thiết bị đó có truy cập lại bình thường được hay không.
