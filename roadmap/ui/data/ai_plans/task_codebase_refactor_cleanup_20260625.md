# Danh sách Nhiệm vụ Dọn dẹp & Khắc phục Lỗi (Task List - Refactor & Cleanup)

Danh sách công việc chi tiết để thực hiện dọn dẹp nợ kỹ thuật, gỡ bỏ code thừa, và vá các lỗ hổng logic tiềm ẩn.

## 📋 Checklist Công việc

### Pha 1: Refactor Import & Dọn dẹp Dead Code
- [ ] Cập nhật import từ `@/lib/permissions` sang `@/lib/adminModules` tại 5 file:
  - [ ] `src/app/admin/layout.tsx`
  - [ ] `src/app/admin/page.tsx`
  - [ ] `src/app/admin/staff/page.tsx`
  - [ ] `src/lib/apiAuth.ts`
  - [ ] `src/middleware.ts`
- [ ] Xóa bỏ an toàn 8 file dư thừa:
  - [ ] `src/lib/commissionUtils.ts`
  - [ ] `src/lib/warrantyUtils.ts`
  - [ ] `src/lib/customerSync.ts`
  - [ ] `src/lib/sms.ts`
  - [ ] `src/lib/permissions.ts`
  - [ ] `src/components/common/Container.tsx`
  - [ ] `src/app/api/restore/route.ts`
- [ ] Dọn dẹp `package.json`: Gỡ bỏ 2 script rác không hoạt động `"graph"` và `"graph:serve"`
- [ ] Gỡ bỏ dependency thừa: Chạy lệnh `pnpm remove puppeteer-core`

### Pha 2: Khắc phục Lỗi Logic & Tích hợp Tính năng
- [ ] Khắc phục lỗi trùng lặp Firebase App `'bounty-otp'` trong `src/components/MissionsWidget.tsx`
- [ ] Tích hợp nút `ExportImportReportButton.tsx` vào trang quản trị linh kiện `/admin/parts`
- [ ] Rà soát và bọc an toàn so khớp chuỗi nghiệp vụ (case-sensitivity)
- [ ] Xác minh và hardening tính an toàn của các Transaction tồn kho (held/stock)

### Pha 3: Tối ưu hóa & Nâng cấp
- [ ] Thiết lập cơ chế cache 24h cho Google Reviews API `/api/reviews/google`
- [ ] Áp dụng lazy loading và tối ưu nén ảnh cho trang quản trị Admin

### Pha 4: Xác minh Hệ thống
- [ ] Chạy `pnpm lint` kiểm tra lỗi cú pháp
- [ ] Chạy `pnpm typecheck` kiểm tra lỗi TypeScript
- [ ] Chạy `pnpm build` kiểm tra build production thành công 100%

## 🔄 Tiến độ Tổng quan
- **Đã hoàn thành:** 0 / 18 nhiệm vụ (~0%)
- **Trạng thái:** Chờ phê duyệt
