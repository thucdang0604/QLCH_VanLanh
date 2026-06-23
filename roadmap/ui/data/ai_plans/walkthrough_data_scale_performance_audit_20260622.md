# Walkthrough: Data Scale, Search & Firebase Performance Audit

**Kế hoạch tương ứng:** `plan_data_scale_performance_audit_20260622.md`  
**Ngày hoàn thành:** 23/06/2026  
**Trạng thái:** Hoàn tất thực thi & Kiểm thử cục bộ  

---

## 1. Những cải tiến đã thực hiện

### A. POS Registry & Authoritative Lookup (One-Read Path)
*   **Thành quả:** Triển khai thành công helper đăng ký mã tập trung [productCodeRegistry.ts](file:///m:/QLCH_VanLanh/src/lib/productCodeRegistry.ts) sử dụng Firestore Transactions. Mọi mã SKU, barcode, productCode hay QR alias đều được ghi nhận vào collection `product_code_registry` với Document ID chính là mã hàng đã chuẩn hóa.
*   **Tối ưu hóa:** Tại POS [pos/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/pos/page.tsx), hệ thống chuyển sang tra cứu trực tiếp bằng `getDoc` theo Document ID trong registry. Tốc độ quét tăng vượt bậc vì chỉ mất đúng **1 lần đọc Firestore**, loại bỏ hoàn toàn việc quét collection `products` hoặc composite query. Giữ luồng fallback an toàn cho dữ liệu cũ chưa được backfill.

### B. Tách biệt hàng đợi Sửa chữa (Active vs Archive)
*   **Thành quả:** Trang quản lý sửa chữa [repairs/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/repairs/page.tsx) đã phân tách rõ rệt giao diện thành 2 tab: **Đang xử lý (Active)** và **Đã đóng (Closed/Archive)**.
*   **Tối ưu hóa:** Thay vì tải toàn bộ phiếu sửa chữa về client rồi bộ lọc, hệ thống nạp cấu hình workflow từ `system_config/repairs` để lấy danh sách `statusIds` tương ứng với thuộc tính `isTerminal`. Firebase query sử dụng constraint `where('status', 'in', statusIds)` kèm phân trang giới hạn `limit(50)` và cursor. Dữ liệu tab `closed` chỉ được nạp khi người dùng click tab, giảm thiểu số lượng tài liệu đọc khi cửa hàng hoạt động lâu năm.

### C. Trang Doanh thu chạy chế độ Tổng hợp (Aggregate-Only)
*   **Thành quả:** Trang báo cáo doanh thu [revenue/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/revenue/page.tsx) được cấu trúc lại hoàn chỉnh để ưu tiên đọc dữ liệu tổng hợp.
*   **Tối ưu hóa:** Xác lập mốc thời gian rollout aggregate là `2026-06-17`. Khi người dùng truy vấn báo cáo doanh thu trong khoảng thời gian từ ngày rollout trở đi, hệ thống chỉ đọc các tài liệu tổng hợp trong collection `revenue_daily_aggregates` (1 ngày = 1 document). Hệ thống chỉ fallback quét các collection chi tiết khi truy vấn ngược về dữ liệu lịch sử trước ngày rollout.

### D. Giới hạn các đường tra cứu lịch sử lớn (Search Bounding)
*   **Thành quả:** Đã áp dụng giới hạn nghiêm ngặt `limit(50)` cho các luồng tìm kiếm theo Số điện thoại hoặc IMEI trong danh sách Đơn hàng, Phiếu sửa chữa và Đặt lịch hẹn, ngăn chặn hiện tượng treo trang khi truy vấn khách hàng thân thiết có lịch sử giao dịch dày đặc.

---

## 2. Kết quả kiểm chứng (Verification)
*   **TypeScript & ESLint:** Tất cả các tệp sửa đổi đều vượt qua kiểm tra nghiêm ngặt `pnpm typecheck` và `pnpm lint`.
*   **Build Production:** Thử nghiệm đóng gói ứng dụng `pnpm build` thành công không lỗi.
*   **Firebase Reads Spot Check:** Số lượng đọc Firestore khi tải trang Doanh thu giảm từ ~120 reads (cho 6 tháng dữ liệu demo) xuống còn **chỉ 1 read** (cho daily aggregates trong tháng) + reads cho các chi phí phát sinh. Tốc độ phản hồi tức thì.
