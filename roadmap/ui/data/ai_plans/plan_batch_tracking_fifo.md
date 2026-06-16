# Kế hoạch Triển khai: Quản lý tồn kho theo Lô (Batch Tracking) kết hợp FIFO sổ sách

Mục tiêu là theo dõi chính xác nguồn gốc, nhà cung cấp (NCC) và lịch sử nhập của từng linh kiện xuất kho phục vụ cho việc bảo hành/đổi trả, đồng thời không làm thay đổi hay tăng thao tác của KTV trên app.

> [!NOTE]
> Kế hoạch này áp dụng chiến lược **Tái sử dụng tối đa cấu trúc dữ liệu hiện tại**, không tạo thêm database collection mới, giúp tiết kiệm công sức maintain và không làm hỏng các báo cáo cũ.

## Proposed Changes

### 1. Sinh Mã Lô Ngắn khi Nhập Kho (Backend `inventory/import`)
- Khi người dùng `complete_import`, tạo 1 mã phiếu nhập ngắn (VD: `PN-2310-001`). 
- Hiển thị mã ngắn này trên UI phiếu nhập hoàn tất (Admin/Inventory) thay vì ID ngẫu nhiên của Firebase để thủ kho ghi dễ dàng lên tem dán vật lý.

### 2. Tái sử dụng `inventory_logs` thành Lô Hàng (Backend DB)
- Không tạo collection `inventory_lots`.
- Sửa lại lúc ghi log `inventory_logs` (type `IMPORT`): Bổ sung 3 trường mới:
  - `remainingQuantity`: số lượng tồn kho chưa sử dụng của lô này (ban đầu bằng `quantity`).
  - `supplierId`: Mã nhà cung cấp.
  - `lotCode`: Mã phiếu nhập ngắn.
- Các logs `IMPORT` có `remainingQuantity > 0` sẽ đóng vai trò như các "Lô Hàng".

### 3. Cập nhật thuật toán trừ kho FIFO (Backend `repairs` & `pos`)
- Các API trừ kho sẽ thay đổi quy trình xử lý:
  - Vẫn giữ nguyên logic trừ tồn kho tổng `stock: increment(-qty)` trên file sản phẩm để UI KTV / POS không bị thay đổi.
  - Sau đó, truy vấn các `inventory_logs` (type `IMPORT`, cùng `productId`, `remainingQuantity > 0`), sắp xếp theo `createdAt ASC` (nhập trước lấy trước).
  - Trừ dần `remainingQuantity` trên các logs lô hàng này cho đến khi đủ số lượng.
- Việc ghi log xuất (`EXPORT` hoặc `REPAIR_USE`) vẫn gom lại thành 1 record như cũ để bảo toàn báo cáo doanh thu/hao hụt, nhưng bổ sung thêm mảng `lotsDeducted: [{ lotCode: '...', qty: ... }]`.

### 4. Tính năng Tra cứu Nguồn gốc linh kiện (Admin/Parts)
- Thêm một thanh tìm kiếm hoặc nút "Tra cứu bảo hành theo Mã Lô" tại trang quản lý kho.
- Nhập mã Lô (VD: `PN-2310-001`) -> Hệ thống truy vấn `inventory_logs` (type `IMPORT`) để hiển thị thông tin NCC, Giá nhập, Ngày nhập, và lịch sử sử dụng của lô đó.

## Verification Plan

### Automated Tests
- Bổ sung unit test cho luồng trừ kho FIFO: xuất 1 số lượng lớn hơn tồn kho của lô cũ nhất, kiểm tra xem mảng `lotsDeducted` có ghi đúng 2 lô hàng không, và `remainingQuantity` của 2 lô đó có giảm đúng không.

### Manual Verification
- Thực hiện 1 phiếu nhập hàng mới và xem hệ thống có trả về mã ngắn không.
- Làm thủ tục thanh toán/giao máy trên app KTV.
- Dùng mã lô để tra cứu lại xem số lượng đã tiêu hao có khớp với đơn sửa chữa không.
