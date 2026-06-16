# Kế hoạch Triển khai: Quản lý tồn kho theo Lô (Batch Tracking) kết hợp FIFO sổ sách

Mục tiêu là theo dõi chính xác nguồn gốc, nhà cung cấp (NCC) và lịch sử nhập của từng linh kiện xuất kho phục vụ cho việc bảo hành/đổi trả, đồng thời không làm thay đổi hay tăng thao tác của KTV trên app. Hệ thống sử dụng phương pháp FIFO ngầm định (Nhập trước - Xuất trước).

> [!IMPORTANT]
> **Thay đổi Kiến trúc cốt lõi**: Tạo thêm collection `inventory_lots` để lưu trữ Trạng thái (State) của từng lô hàng, đảm bảo `inventory_logs` chỉ đóng vai trò là một Immutable Audit Log (chỉ ghi nhận sự kiện). Các thay đổi tồn kho bắt buộc thực hiện trong một Firestore Transaction.

## Proposed Changes

### 1. Tạo Collection Mới: `inventory_lots` (Backend DB)
- Tạo collection `inventory_lots` đại diện cho các lô hàng thực tế.
- Schema: 
  - `lotCode`: Mã phiếu nhập / Mã lô ngắn (VD: `PN-2310-001`).
  - `productId`: ID sản phẩm.
  - `supplierId`: Mã nhà cung cấp.
  - `importPrice`: Giá nhập của lô này.
  - `initialQuantity`: Số lượng ban đầu.
  - `remainingQuantity`: Số lượng còn tồn trong kho của lô này.
  - `status`: `'active'` (còn hàng) | `'empty'` (hết hàng).
  - `createdAt`: Ngày nhập (để phục vụ sắp xếp FIFO).

### 2. Xử lý lúc Nhập kho (Backend `inventory/import`)
- Khi `complete_import`, tạo 1 mã phiếu nhập/lô ngắn gọn.
- Tạo các document mới trong `inventory_lots` tương ứng với các mặt hàng được nhập.
- Hiển thị mã lô ngắn này trên UI phiếu nhập hoàn tất (Admin/Inventory) để thủ kho ghi/in tem dán vật lý.

### 3. Cập nhật thuật toán trừ kho FIFO (Backend `repairs` & `pos`)
- Mọi thao tác trừ kho (POS, Repair, Điều chỉnh) đều phải bọc trong `runTransaction`.
- **Logic bên trong Transaction**:
  1. Trừ tồn kho tổng `stock: increment(-qty)` trên bảng `products` để UI KTV/POS không thay đổi.
  2. Query các `inventory_lots` của `productId` với điều kiện `status == 'active'`, sắp xếp theo `createdAt ASC` (nhập trước xuất trước).
  3. Duyệt qua các lô và trừ dần `remainingQuantity`. Nếu lô nào về 0, chuyển `status` thành `'empty'`.
  4. Gom thông tin các lô bị trừ (gồm `lotCode`, `qty`) và thêm vào trường `lotsDeducted` của payload trước khi ghi `inventory_logs` (thể loại `EXPORT` hoặc `REPAIR_USE`).

### 4. Tính năng Tra cứu Nguồn gốc linh kiện (Admin/Parts)
- Thêm thanh tìm kiếm hoặc nút "Tra cứu bảo hành theo Mã Lô" tại trang quản lý kho/linh kiện.
- Nhập mã Lô (VD: `PN-2310-001`) -> Truy vấn `inventory_lots` để hiển thị: NCC, Giá nhập, Ngày nhập, Tổng số lượng nhập ban đầu và Tồn kho hiện tại.

## Verification Plan

### Automated Tests
- Cần viết unit test cho hàm trừ FIFO: Giả lập xuất số lượng lớn hơn tồn của lô cũ nhất, kiểm tra `remainingQuantity` trên nhiều lô, và mảng `lotsDeducted` trong `inventory_logs` xem có khớp số lượng phân bổ không.

### Manual Verification
- Test Nhập hàng: Xem `inventory_lots` có sinh ra document với `lotCode` ngắn không.
- Test Xuất hàng (KTV): Xem tổng `stock` ở `products` có khớp với tổng `remainingQuantity` của các lô `active` không. Kiểm tra log có chứa mảng `lotsDeducted`.
- Dùng mã lô để tra cứu lại xem thông tin NCC có hiện ra chuẩn xác không.
