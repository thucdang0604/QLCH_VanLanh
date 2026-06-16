# Đồng bộ Customer CRM toàn diện từ đa kênh

**Status:** completed (merged `master`)

Cơ sở dữ liệu khách hàng (`customers`) sẽ được cấu trúc làm Single Source of Truth cho toàn bộ vòng đời khách hàng. Để tránh lỗi quyền truy cập Firestore do Client Rule chặn write, toàn bộ luồng đồng bộ sẽ đi qua API Server.

## 1. Khai báo API đồng bộ chung
Tạo `/api/customers/sync/route.ts` với Firebase Admin SDK (`db.runTransaction`) thực hiện:
- Upsert Customer
- Chỉ update Tên nếu giá trị mới không rỗng và khác "Khách lẻ"
- Chuẩn hóa SĐT trước khi lưu

## 2. Cập nhật các điểm chạm
- **Admin Repairs:** Gọi `/api/customers/sync` sau khi update phiếu.
- **Appointments:** Dùng Admin SDK trực tiếp tạo/cập nhật Customer.
- **POS Checkout:** Fix lỗi không cập nhật tên khách và áp dụng `normalizeVietnamPhone`.
- **Chat Widget:** Thêm API Sync khi khách nhập thông tin Chat.
