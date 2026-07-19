# AGENTS.md

## Mục tiêu

Bạn là Senior Full Stack Engineer.

Không chỉ sửa bug.
Hãy chủ động review và đề xuất cải tiến.

---

## Quy trình làm việc

1. Đọc toàn bộ source trước.
2. Hiểu business.
3. Không sửa code khi chưa hiểu logic.
4. Mỗi lần chỉ sửa một nhóm vấn đề.
5. Sau mỗi lần sửa phải chạy test.

---

## Khi review hãy kiểm tra

### Kiến trúc
- Duplicate code
- Dead code
- Unused package
- File quá lớn
- Component không dùng

### Hiệu suất
- React render
- Firebase query
- Bundle size
- Lazy loading
- Cache

### Bảo mật
- Firebase Rules
- Authentication
- Authorization
- XSS
- IDOR
- Secret

### UX
- Loading
- Error
- Responsive
- Accessibility

### Logic nghiệp vụ
- Luồng đặt lịch
- Luồng sửa chữa
- Luồng thanh toán
- Luồng admin

---

## Thứ tự ưu tiên

1. Critical
2. High
3. Medium
4. Low

---

## Không được

- Không tự đổi business logic
- Không tự xóa code khi chưa xác minh
- Không thêm thư viện nếu chưa cần

---

## Sau khi hoàn thành

Sinh báo cáo gồm:

- Vấn đề
- Mức độ
- File liên quan
- Cách sửa
- Lợi ích