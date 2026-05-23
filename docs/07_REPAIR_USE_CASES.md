# Repair & Warranty Use Cases - Deep Dive

Tài liệu này chi tiết hóa các tình huống nghiệp vụ thực tế (Use Cases) mà hệ thống Văn Lành Service xử lý, bao gồm cả các logic ẩn và các trường hợp biên.

---

## 1. Tiếp nhận & Kiểm tra (Reception & Inspection)

### Use Case 1.1: Tiếp nhận máy có hư hỏng ngoại quan
- **Tình huống**: Khách hàng mang máy vỡ màn hình và móp vỏ.
- **Xử lý hệ thống**:
    - Nhân viên tạo phiếu, điền thông tin ngoại quan vào **Checklist 8 mục**.
    - Chụp ảnh/Quay video tình trạng máy trước khi sửa (**preRepairMedia**) và upload lên Firebase Storage.
    - **Logic**: Checklist bắt buộc phải "OK" hoặc ghi chú rõ lỗi thì hệ thống mới cho phép chuyển sang trạng thái "Đang kiểm tra".

### Use Case 1.2: Kỹ thuật viên phát hiện lỗi phát sinh
- **Tình huống**: Đang sửa màn hình thì phát hiện Pin bị phồng.
- **Xử lý hệ thống**:
    - KTV cập nhật thêm linh kiện "Pin" vào mảng `parts`.
    - **Logic**: Hệ thống kiểm tra tồn kho Pin. Nếu có sẵn, Pin chuyển sang trạng thái `held`. Nếu không, hệ thống tự tạo một **Draft Import Receipt** để nhắc Admin nhập hàng.

---

## 2. Quản lý Linh kiện & Tồn kho (Inventory Management)

### Use Case 2.1: KTV chọn nhầm linh kiện
- **Tình huống**: KTV chọn Màn hình iPhone 11 nhưng thực tế là iPhone 11 Pro.
- **Xử lý hệ thống**:
    - KTV xóa linh kiện sai khỏi phiếu.
    - **Logic**: Firestore trigger (hoặc `writeBatch`) thực hiện: `stock(iPhone 11) + 1` và `held(iPhone 11) - 1`. Trả lại trạng thái cân bằng.

### Use Case 2.2: Ưu tiên linh kiện cho phiếu cũ
- **Tình huống**: Có 1 màn hình cuối cùng trong kho. Hai phiếu cùng yêu cầu.
- **Xử lý hệ thống**:
    - Hệ thống sử dụng **Firestore Transaction** khi nhấn "Chọn linh kiện".
    - **Logic**: Phiếu nào nhấn trước sẽ chiếm quyền giữ hàng (`held`). Phiếu sau sẽ thấy số lượng `stock = 0` và chuyển sang trạng thái `requested` (chờ nhập hàng).

---

## 3. Hoàn tất & Thanh toán (Closure & Payment)

### Use Case 3.1: Giảm giá đặc biệt cho khách quen
- **Tình huống**: Tổng bill 2,050,000đ. Admin giảm 50,000đ cho khách.
- **Xử lý hệ thống**:
    - Tại màn hình **Handover (Payment Gate)**, Admin nhập `discountAmount = 50000`.
    - **Logic**: `payment.amount` được tính lại = `(parts + labor + fees) - discount`.
    - **Hoa hồng**: Nếu quy tắc hoa hồng bật `applyAfterDiscount`, hoa hồng nhân viên sẽ tính trên 2,000,000đ thay vì 2,050,000đ.

### Use Case 3.2: Khách không sửa, trả máy (Out)
- **Tình huống**: Khách thấy báo giá cao quá nên không sửa.
- **Xử lý hệ thống**:
    - Admin chuyển trạng thái sang `out` (Trả máy).
    - **Logic**: Toàn bộ linh kiện đã `held` sẽ được giải phóng ngược lại `stock`. Phiếu đóng lại với phí 0đ (hoặc chỉ thu phí kiểm tra nếu có cấu hình `additionalFees`).

---

## 4. Bảo hành & Khiếu nại (Warranty & Claims)

### Use Case 4.1: Bảo hành 1 phần linh kiện
- **Tình huống**: Phiếu gốc thay Màn hình và Pin. 2 tháng sau Màn hình lỗi, Pin vẫn tốt.
- **Xử lý hệ thống**:
    - Admin tra cứu phiếu gốc, chọn "Tạo phiếu bảo hành".
    - Hệ thống hiển thị danh sách linh kiện còn hạn. Admin chỉ tích chọn "Màn hình".
    - **Logic**: Tạo phiếu mới với `ticketType: 'warranty'`. Lưu `claimedPartIndexes: [0]` (index của màn hình).
    - **KPI**: KTV cũ thực hiện ca bảo hành này sẽ không được tính thêm hoa hồng, và hệ thống có thể ghi nhận "Tỷ lệ bảo hành" của KTV đó.

### Use Case 4.2: Hoàn tiền sau khi bảo hành không thành công
- **Tình huống**: Máy bảo hành 3 lần vẫn lỗi, quyết định hoàn tiền cho khách.
- **Xử lý hệ thống**:
    - Admin chọn trạng thái `refund` (Hoàn phí).
    - **Logic**: 
        1. `payment.status` = `refunded`.
        2. Tạo bản ghi **Commission âm** cho KTV đã nhận hoa hồng trước đó (suffix `_refund`).
        3. Release linh kiện nếu có thay thế trong phiếu bảo hành.

---

## 5. Phân quyền & KPI (RBAC & Analytics)

### Use Case 5.1: KTV tự theo dõi thu nhập
- **Tình huống**: KTV muốn biết tháng này kiếm được bao nhiêu hoa hồng.
- **Xử lý hệ thống**:
    - KTV vào mục "Cá nhân".
    - **Logic**: Hệ thống query collection `commissions` lọc theo `staffId == user.uid` và `createdAt` trong tháng hiện tại. Hiển thị tổng số tiền và danh sách các phiếu đã hoàn thành.

### Use Case 5.2: Theo dõi thời gian sửa chữa trung bình
- **Tình huống**: Chủ cửa hàng muốn biết khâu nào đang bị nghẽn.
- **Xử lý hệ thống**:
    - Hệ thống phân tích mảng `statusTimeline` của hàng nghìn phiếu.
    - **Logic**: Tính trung bình `durationInMinutes` của trạng thái "Chờ linh kiện" so với "Đang sửa chữa" để đưa ra quyết định nhập hàng sớm hơn.
