# Task List: Quản lý tồn kho theo Lô (Batch Tracking) kết hợp FIFO

- [x] **1. Cập nhật TypeScript Interfaces (`src/lib/types.ts`)**
  - [x] Thêm interface `InventoryLot` (lotCode, productId, supplierId, importPrice, initialQuantity, remainingQuantity, status, createdAt).
  - [x] Thêm trường `lotsDeducted?: { lotCode: string, qty: number }[]` vào interface `InventoryLog`.

- [x] **2. Luồng Nhập Kho: Khởi tạo Lô hàng (`src/app/admin/parts/page.tsx` hoặc API tương ứng)**
  - [x] Sinh mã lô ngắn gọn `PN-YYMM-XXXX` khi bắt đầu chốt phiếu nhập.
  - [x] Thêm logic tạo các record `inventory_lots` cho từng mặt hàng trong `executeFinalImport` (trong cùng Transaction).
  - [x] `inventory_logs` (type `IMPORT`) vẫn ghi nhận như cũ, chỉ đính kèm thêm tham chiếu `lotCode` để dễ dàng đối chiếu.

- [x] **3. Luồng Xuất Kho: Trừ FIFO (`src/app/admin/pos/page.tsx` và Server APIs)**
  - [x] Xây dựng hàm helper `deductInventoryLots(transaction, db, productId, qtyToDeduct)` để xử lý chung logic FIFO.
  - [x] Áp dụng hàm FIFO vào luồng POS Checkout (`pos/page.tsx` / `checkout/route.ts`).
  - [x] Áp dụng hàm FIFO vào luồng Sửa chữa (`repairs/page.tsx` / `handover/route.ts`).
  - [x] Gắn `lotsDeducted` vào payload khi ghi `inventory_logs` (`EXPORT`, `REPAIR_USE`).

- [x] **4. UI Tra Cứu Mã Lô (`src/app/admin/parts/page.tsx`)**
  - [x] Bổ sung thanh tìm kiếm "Tra cứu theo Mã Lô" trên giao diện Quản lý Linh kiện/Sản phẩm.
  - [x] Hiển thị thông tin chi tiết Lô: Mã Lô, Sản phẩm, Nhà cung cấp, Giá nhập, Tồn kho lô, Ngày nhập.

- [x] **5. Kiểm tra & Đảm bảo Data Integrity**
  - [x] Chạy luồng Nhập 2 lần để tạo 2 lô. *(Manual test bởi người dùng)*
  - [x] Chạy POS Checkout với số lượng trừ xuyên 2 lô. *(Manual test bởi người dùng)*
  - [x] Kiểm tra document `inventory_logs` sinh ra có mảng `lotsDeducted` chính xác không. *(Manual test bởi người dùng)*
  - [x] Kiểm tra `inventory_lots` xem trạng thái có chuyển thành `empty` nếu hết sạch không. *(Manual test bởi người dùng)*
