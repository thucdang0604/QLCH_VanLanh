# Kế hoạch sửa lỗi lưu khách hàng mới và hiển thị trạng thái Công nợ đơn hàng

Tài liệu này mô tả chi tiết phương án xử lý lỗi không hiển thị khách hàng mới được tạo từ POS, đồng thời bổ sung trạng thái hiển thị "Ghi nợ - chờ thu" và số tiền nợ còn lại cho các đơn hàng chưa thanh toán đủ trên trang Quản lý đơn hàng.

---

## 1. Phân tích nguyên nhân & Giải pháp kỹ thuật

### 1.1. Lỗi không lưu/hiển thị khách hàng mới tạo từ POS
- **Nguyên nhân**: Trong tệp `src/app/api/pos/checkout/route.ts` (phần xử lý lưu khách hàng mới khi `custSnap.exists` bằng `false`), đối tượng `newCust` được khởi tạo và ghi vào Firestore chỉ gồm các trường: `phone`, `name`, `type`, `totalSpent`, `totalOrders`, `totalRepairs`, `totalAppointments`. Tệp tin này hoàn toàn thiếu hai trường thời gian `createdAt` và `updatedAt`.
  Trong khi đó, trang danh sách khách hàng `src/app/admin/customers/page.tsx` thực hiện truy vấn sắp xếp: `orderBy('updatedAt', 'desc')`.
  Theo cơ chế hoạt động của Firestore, bất kỳ tài liệu nào thiếu trường được chỉ định trong `orderBy` sẽ bị tự động loại bỏ khỏi kết quả truy vấn. Do đó, khách hàng mới tạo vẫn nằm trong database nhưng vĩnh viễn không hiển thị trong danh sách khách hàng.
- **Giải pháp**:
  - Khi khởi tạo `newCust`, bổ sung đầy đủ các trường thời gian bằng Server-Side Timestamps:
    - `createdAt: FieldValue.serverTimestamp()`
    - `updatedAt: FieldValue.serverTimestamp()`
    - `lastVisit: FieldValue.serverTimestamp()`
  - Đồng thời, khởi tạo trường `totalDebt` bằng giá trị `deltaDebt` của giao dịch hiện tại để đảm bảo công nợ ban đầu của khách hàng mới được đồng bộ chính xác.

### 1.2. Hiển thị trạng thái "Ghi nợ - chờ thu" và số tiền nợ còn lại trên UI Đơn hàng
- **Yêu cầu**:
  - Hiển thị trạng thái của đơn hàng là "Ghi nợ - chờ thu" (badge màu đỏ/cam nổi bật) nếu đơn hàng chưa thanh toán đủ (tổng tiền > số tiền đã trả) và đơn hàng không bị hủy.
  - Hiển thị số tiền còn nợ lại ngay dưới tổng tiền của đơn hàng đó.
- **Giải pháp**:
  - Tại tệp `src/app/admin/orders/page.tsx` của module Đơn hàng:
    - Thêm icon `AlertTriangle` từ `lucide-react` để hiển thị biểu tượng cảnh báo nợ.
    - Viết hàm trợ giúp `getOrderDebtInfo(order: Order)` để tính toán chính xác số nợ còn lại dựa trên lịch sử thanh toán (`paymentHistory`) và tiền cọc (`deposit_amount`), đồng thời kiểm tra xem đơn hàng có thuộc diện nợ hay không.
    - **Trong danh sách Đơn hàng (Mobile & Desktop)**: Nếu đơn hàng có nợ (`isDebt === true`), ghi đè cấu hình trạng thái hiển thị thành `"Ghi nợ - chờ thu"` (badge màu đỏ nhạt `bg-red-50 text-red-700 border border-red-100` kèm icon `AlertTriangle`). Đồng thời hiển thị dòng chữ đỏ `(Còn nợ: {số_tiền})` ngay phía dưới tổng tiền.
    - **Trong Modal Chi tiết đơn hàng**: Thay đổi badge trạng thái chính thành `"Ghi nợ - chờ thu"` nếu có nợ, đồng thời cải tiến phần tổng tiền cuối trang để hiển thị rõ ràng khoản nợ còn lại (hỗ trợ cả các trường hợp cọc bằng 0 hoặc nợ 100% hóa đơn).
    - **Trong In ấn (Thermal & A5)**: Sử dụng hàm trợ giúp `getReceiptPaymentHtml(order, type)` để hiển thị chính xác số tiền đã cọc/thanh toán và số tiền còn nợ lại trên hóa đơn in ra của khách hàng.

---

## 2. Các tệp tin cần chỉnh sửa

### [Component CRM Backend]
#### [MODIFY] [route.ts](file:///m:/QLCH_VanLanh/src/app/api/pos/checkout/route.ts)
- Bổ sung `createdAt`, `updatedAt`, `lastVisit` và `totalDebt` khi tạo mới khách hàng `newCust`.

---

### [Component Orders UI]
#### [MODIFY] [page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/orders/page.tsx)
- Thêm `AlertTriangle` vào phần import từ `lucide-react`.
- Thêm hàm trợ giúp `getOrderDebtInfo` ở phạm vi tệp tin.
- Thêm hàm trợ giúp `getReceiptPaymentHtml` phục vụ in ấn hóa đơn.
- Cập nhật hiển thị badge trạng thái và tổng tiền/nợ còn lại trong Mobile View, Desktop View, Modal Chi tiết, và các mẫu in hóa đơn Thermal (80mm) & A5.

---

## 3. Kế hoạch xác minh (Verification Plan)

### Kiểm tra tự động
- Chạy typecheck và lint để đảm bảo mã nguồn tuân thủ tiêu chuẩn:
  ```bash
  pnpm typecheck
  pnpm lint
  ```

### Kiểm tra thủ công
1. **Kiểm tra lưu khách hàng mới**:
   - Thực hiện thanh toán một đơn hàng POS mới, nhập một SĐT mới chưa từng có trong hệ thống và một tên khách hàng mới.
   - Truy cập trang **Khách hàng** (`/admin/customers`).
   - **Kết quả mong muốn**: Khách hàng mới xuất hiện ngay lập tức ở đầu danh sách (do có `updatedAt` đầy đủ), hiển thị chính xác tên, số điện thoại và số nợ ban đầu (nếu có).
2. **Kiểm tra hiển thị trạng thái nợ & số tiền nợ**:
   - Truy cập trang **Đơn hàng** (`/admin/orders`).
   - Tìm kiếm đơn hàng vừa thanh toán thiếu từ POS ở trên.
   - **Kết quả mong muốn**:
     - Trạng thái của đơn hàng hiển thị badge màu đỏ `"Ghi nợ - chờ thu"` kèm icon tam giác cảnh báo.
     - Dưới cột "Tổng tiền" xuất hiện dòng chữ đỏ chỉ rõ số tiền còn nợ (ví dụ: `(Còn nợ: 200.000đ)`).
     - Bấm xem chi tiết đơn hàng, badge trạng thái chính trong modal hiển thị `"Ghi nợ - chờ thu"`, và phần tổng kết hiển thị chi tiết số tiền cọc/đã trả và khoản nợ còn lại.
     - Kiểm tra in hóa đơn (cả Thermal 80mm và A5) để đảm bảo thông tin nợ/cọc được in đúng biểu mẫu mới.
