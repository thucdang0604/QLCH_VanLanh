# Danh sách Nhiệm vụ Dọn dẹp & Khắc phục Lỗi (Task List - Refactor & Cleanup)

Danh sách công việc chi tiết để thực hiện dọn dẹp nợ kỹ thuật, gỡ bỏ code thừa, và vá các lỗ hổng logic tiềm ẩn.

## 📋 Checklist Công việc

### Pha 1: Refactor Import & Dọn dẹp Dead Code
- [x] Cập nhật import từ `@/lib/permissions` sang `@/lib/adminModules` tại 5 file:
  - [x] `src/app/admin/layout.tsx`
  - [x] `src/app/admin/page.tsx`
  - [x] `src/app/admin/staff/page.tsx`
  - [x] `src/lib/apiAuth.ts`
  - [x] `src/middleware.ts`
- [x] Xóa bỏ an toàn 7 file dư thừa:
  - [x] `src/lib/commissionUtils.ts`
  - [x] `src/lib/warrantyUtils.ts`
  - [x] `src/lib/customerSync.ts`
  - [x] `src/lib/sms.ts`
  - [x] `src/lib/permissions.ts`
  - [x] `src/components/common/Container.tsx`
  - [x] `src/app/api/restore/route.ts`
- [x] Dọn dẹp `package.json`: Gỡ bỏ 2 script rác không hoạt động `"graph"` và `"graph:serve"`
- [x] Gỡ bỏ dependency thừa: Đã gỡ bỏ `puppeteer-core`

### Pha 2: Khắc phục Lỗi Logic & Tích hợp Tính năng
- [x] Khắc phục lỗi trùng lặp Firebase App `'bounty-otp'` trong `src/components/MissionsWidget.tsx`
- [x] Tích hợp nút `ExportImportReportButton.tsx` vào trang quản trị linh kiện `/admin/parts`
- [x] Rà soát và bọc an toàn so khớp chuỗi nghiệp vụ (case-sensitivity) trong `commissionCalcServer.ts`
- [x] Xác minh và hardening tính an toàn của các Transaction tồn kho (held/stock)

### Pha 3: Tối ưu hóa & Nâng cấp
- [x] Thiết lập cơ chế cache 24h cho Google Reviews API `/api/reviews/google`
- [x] Áp dụng lazy loading và tối ưu nén ảnh cho trang quản trị Admin (`products/page.tsx`)

### Pha 5: Khắc phục lỗi vận hành phát sinh trên Production
- [x] Sửa lỗi 403 Google Reviews API bằng cách trích xuất và chuyển tiếp tiêu đề Referer từ client sang Google Places API
- [x] Tích hợp cơ chế tự động quét, tối ưu (.webp) và upload ảnh Base64 trong bài viết lên Firebase Storage trước khi lưu để tránh giới hạn 1MB của Firestore

### Pha 4: Xác minh Hệ thống
- [ ] Chạy `pnpm lint` kiểm tra lỗi cú pháp
- [ ] Chạy `pnpm typecheck` kiểm tra lỗi TypeScript
- [ ] Chạy `pnpm build` kiểm tra build production thành công 100%

## 🔄 Tiến độ Tổng quan
- **Đã hoàn thành:** 18 / 20 nhiệm vụ (~90%)
- **Trạng thái:** Đang thực hiện xác minh hệ thống (Pha 4)
