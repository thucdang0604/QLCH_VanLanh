# API Structure - Văn Lành Service Management

Hệ thống sử dụng Next.js API Routes (App Router) kết hợp với Firebase Admin SDK để xử lý các tác vụ yêu cầu bảo mật cao.

## 1. Authentication & Security
Tất cả API quản trị đều được bảo vệ bởi middleware/HOC:
- `requireAdmin`: Kiểm tra `idToken` từ Firebase Auth và xác minh role trong Firestore.
- **Rate Limiting**: Triển khai in-memory store để giới hạn số lượng request từ một IP, đặc biệt là các API tốn kém như Gemini AI.

## 2. Các Endpoints Chính

### 2.1. Analytics (`/api/analytics/`)
- `POST /visit`: Ghi nhận lượt truy cập. Sử dụng Cookie-based Device ID để định danh khách duy nhất.
- `GET /stats`: (Admin only) Lấy thống kê truy cập theo thời gian.

### 2.2. AI Services (`/api/ai/`)
- `POST /generate-article`: Nhận keywords và trả về nội dung bài viết Markdown từ Gemini Pro.
- `POST /chat-assist`: Hỗ trợ trả lời tin nhắn khách hàng (tích hợp Realtime DB).

### 2.3. Revalidation (`/api/revalidate/`)
- `POST /`: Force revalidate các tag như `config`, `products`, `articles` khi Admin thay đổi dữ liệu, đảm bảo cache ISR luôn tươi mới.

### 2.4. Image Optimization (`/api/optimize/`)
- Xử lý nén ảnh, chuyển đổi WebP nếu client không tự xử lý được trước khi upload lên Storage.

## 3. Middleware & Logic
- **CORS Configuration**: Giới hạn chỉ cho phép các domain chính thống (`fixphone.vn`, `qlch-vanlanh.web.app`) truy cập API.
- **Error Handling**: Hệ thống catch-all error handler trả về JSON chuẩn hóa với mã lỗi cụ thể.
