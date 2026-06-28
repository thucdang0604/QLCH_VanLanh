# Task: Service Variants

- [x] Giữ schema `Service` không thêm ID biến thể riêng.
- [x] Bỏ cấu hình biến thể thủ công trong modal `/admin/services`.
- [x] Fetch biến thể dịch vụ active cùng taxonomy danh mục trên server.
- [x] Render selector biến thể trên trang chi tiết dịch vụ.
- [x] Đưa selector biến thể lên phía trên form đặt lịch và để thông tin dịch vụ nằm ngay dưới ảnh.
- [x] Thay dropdown chọn ngày bằng calendar tháng trong form đặt lịch.
- [ ] Browser smoke với dữ liệu thật có ít nhất hai dịch vụ cùng deepest `categoryIds`.

## Verification

- Targeted ESLint cho các file đã chạm.
- TypeScript check lọc theo các file đã chạm.
- Full typecheck hiện còn lỗi `TS7006 implicit any` ở các page admin khác ngoài scope.
- Browser validation 27.06 bị chặn vì in-app Browser backend `iab` không khả dụng trong phiên Codex.
