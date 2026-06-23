# Task Import Customers & Suppliers

- [x] Đăng ký file kế hoạch vào `manifest.json`.
- [x] Bổ sung mẫu hàng mẫu (mock data rows) cho `customer` và `supplier` trong `excelImportTemplateFixtures.ts`.
- [x] Cập nhật `ExcelImportMode` và cấu hình `MODE_CONFIG` cho `customer` và `supplier` trong `importSupport.ts`.
- [x] Thêm hàm `getPreviewCheckKeys` trong `importSupport.ts` và tích hợp vào `ExcelImportModal.tsx`.
- [x] Viết các helper tạo template cho `customer` và `supplier` trong `importSupport.ts`.
- [x] Mở rộng bảng check preview và validate dữ liệu trùng lặp cho `customer` và `supplier` trong `ExcelImportModal.tsx`.
- [x] Viết logic thực hiện import cho `customer` và `supplier` trong `ExcelImportModal.tsx`.
- [x] Thêm 2 option mới cho Khách hàng và Nhà cung cấp vào `/admin/initial-data/page.tsx`.
- [/] Kiểm tra lints và build bằng `pnpm lint` / `pnpm build`.
- [ ] Xác minh thủ công tính năng import Khách hàng và Nhà cung cấp trên giao diện.
