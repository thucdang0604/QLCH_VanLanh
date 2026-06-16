# Thực thi Quản lý Lô Hàng (Batch Tracking)

- `[x]` 1. **Khởi tạo ID ngắn và Nâng cấp log `IMPORT`**
  - Cập nhật hàm `complete_import` trong `src/app/api/inventory/import/route.ts`.
  - Sinh mã `lotCode` dạng `PN-YYMM-XXX` hoặc tương đương cho mỗi đợt nhập.
  - Lưu `lotCode`, `supplierId`, `remainingQuantity` vào DB khi ghi log `inventory_logs` (type `IMPORT`).
  - Cập nhật UI Admin/Inventory để hiển thị mã phiếu nhập rút gọn.

- `[x]` 2. **Cập nhật thuật toán trừ kho FIFO**
  - Cập nhật `src/app/api/repairs/handover/route.ts` (Sửa chữa).
  - Cập nhật `src/app/api/pos/checkout/route.ts` (Bán lẻ).
  - Viết helper chung (nếu cần) để tự động quét `IMPORT` logs cũ và trừ `remainingQuantity` theo thứ tự FIFO, sau đó trả về mảng `lotsDeducted`.
  - Cập nhật log `EXPORT`/`REPAIR_USE` để đính kèm `lotsDeducted`.

- `[x]` 3. **Phát triển UI Tra cứu Nguồn gốc linh kiện**
  - Cập nhật `src/app/admin/parts/page.tsx` hoặc tạo component nhỏ để tìm Lô theo mã `lotCode`.
  - Hiển thị đầy đủ thông tin: Lô hàng nhập từ ai, khi nào, giá bao nhiêu, hiện tại còn tồn bao nhiêu, đã tiêu hao ở những sửa chữa/đơn hàng nào.

- `[x]` 4. **Kiểm tra và Xác nhận**
  - Chạy `pnpm run dev` để test luồng hoàn tất phiếu nhập mới, in ra được mã ngắn.
  - Test luồng xuất kho trừ kho FIFO.
  - Khắc phục các lỗi nếu có.
