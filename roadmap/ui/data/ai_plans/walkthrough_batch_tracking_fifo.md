# Hoàn Tất Cập Nhật Batch Tracking (FIFO)

Tính năng **Theo Dõi Lô Hàng (Batch Tracking)** và **Trừ Kho FIFO** đã được triển khai hoàn tất theo đúng kiến trúc Database mới. Dưới đây là tóm tắt những thay đổi đã được thực hiện:

## 1. Cập Nhật Kiểu Dữ Liệu (`src/lib/types.ts`)
- Định nghĩa thêm interface `InventoryLot` đại diện cho các bản ghi trong collection `inventory_lots`.
- Bổ sung trường `lotsDeducted` vào interface `InventoryLog` để làm dấu vết kiểm toán (audit trail) khi xuất kho.

## 2. Luồng Nhập Kho: Khởi tạo Lô Hàng (`src/app/api/inventory/import/route.ts`)
- Mỗi khi chốt phiếu nhập kho, hệ thống tự động sinh một `lotCode` dạng `PN-YYMM-XXXX`.
- Tạo các bản ghi `inventory_lots` (mang ý nghĩa lưu trạng thái hiện tại của từng lô hàng, bao gồm `initialQuantity`, `remainingQuantity`, và `status: 'active'`).
- Việc ghi nhận lịch sử vào `inventory_logs` (type `IMPORT`) vẫn giữ nguyên như cũ, chỉ đính kèm thêm `lotCode` để dễ đối chiếu.

## 3. Luồng Xuất Kho: Trừ FIFO (`src/lib/inventoryFifo.ts`)
- Đã refactor logic FIFO để **query trực tiếp từ `inventory_lots`** (thay vì query trên `inventory_logs`).
- FIFO ưu tiên trừ số lượng ở các lô cũ nhất (`orderBy('createdAt', 'asc')`) và có `status === 'active'`.
- Khi một lô bị trừ cạn (`remainingQuantity === 0`), trạng thái của lô tự động đổi thành `'empty'`.
- Kết quả trừ lô được trả về thông qua mảng `lotsDeducted`.

## 4. Cập Nhật API POS & Sửa Chữa (`checkout/route.ts`, `handover/route.ts`)
- Tích hợp kết quả `lotsDeducted` từ FIFO vào dữ liệu ghi `inventory_logs` cho các nghiệp vụ `POS_SALE`, `REPAIR_USE` và `EXPORT`. 
- Đảm bảo tính minh bạch: Lịch sử xuất/nhập lưu hoàn toàn trong `inventory_logs`, còn tồn thực tế của từng lô lưu trong `inventory_lots`.

## 5. UI Tra Cứu Mã Lô (`LotTrackingModal.tsx`)
- Sửa lại nguồn query của modal **"Tra cứu Mã Lô"**: Hiện tại modal đã đọc thông tin chính của lô từ `inventory_lots` thay vì phải suy luận từ `inventory_logs`.
- Lịch sử sử dụng của lô vẫn được lấy từ `inventory_logs` một cách chính xác và hiển thị rõ ràng trên UI.

---

> [!WARNING]
> **Lưu ý Cấp Quyền Firestore Index:**
> Vì Firebase Firestore yêu cầu index phức hợp cho các câu query có chứa `where` và `orderBy`, khi bạn thực hiện xuất kho (ví dụ: POS Checkout) lần đầu tiên có thể sẽ gặp lỗi thiếu Index trong terminal (`The query requires an index.`). Nếu gặp lỗi này, bạn chỉ cần copy link sinh ra trong Terminal dán vào trình duyệt để tạo Index tự động cho Firestore.

> [!TIP]
> **Hướng Dẫn Kiểm Tra Tính Năng (Testing):**
> 1. Vào luồng Nhập kho, tạo 2 phiếu nhập khác nhau cho cùng một sản phẩm (tạo thành 2 lô khác nhau).
> 2. Vào luồng POS hoặc Bàn giao sửa chữa, thực hiện bán/xuất kho số lượng lớn hơn số lượng tồn của Lô thứ nhất (để ép hệ thống trừ xuyên qua Lô thứ hai).
> 3. Click nút **Tra Cứu Mã Lô** để kiểm tra lịch sử trừ kho của 2 mã lô vừa rồi xem có khớp với số lượng thực tế hay không.
