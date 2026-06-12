# Task List - Admin IA + RBAC Cleanup 2026-06-08

## Goal

Gom layout admin theo module vận hành và chuẩn hóa route/permission từ một registry dùng chung, giữ nguyên schema `users.permissions: string[]` để không cần migration trong batch đầu.

## Implementation Checklist

- [x] Tạo registry admin module dùng chung cho sidebar, route permission map, badge route map, permission list và first accessible route.
- [x] Giữ `permissions.ts` làm lớp tương thích để middleware/API/UI dùng import cũ nhưng dữ liệu lấy từ registry mới.
- [x] Gom sidebar admin thành 6 nhóm: Tổng quan, Bán hàng, Sửa chữa, Kho hàng, Khách hàng & CSKH, Quản trị.
- [x] Ẩn các trang cấu hình phụ khỏi sidebar chính nhưng vẫn map quyền cho route guard.
- [x] Sửa `/admin/customers` dùng `manage_customers` thay vì `manage_orders`.
- [x] Sửa `/admin/settings/discount-rules` dùng `manage_discounts` thống nhất.
- [x] Bỏ guard `admin_only` ở trang reviews; dùng `manage_reviews`.
- [x] Thêm preset quyền trong trang Nhân viên: Thu ngân, KTV, Kho, CSKH, Content.
- [x] Staff route không có trong registry bị deny mặc định; admin vẫn toàn quyền.
- [x] Tối ưu mobile admin: đổi sidebar trượt trái thành bottom sheet theo nhóm, hiển thị GlobalSearch trên mobile header, và thêm lối tắt ghim xuống đáy màn hình lưu bằng localStorage theo thiết bị.

## Verification Checklist

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm build`
- [ ] Browser smoke admin: sidebar desktop/mobile không tràn và active route đúng.
- [ ] RBAC smoke: admin thấy toàn bộ sidebar.
- [ ] RBAC smoke: staff Thu ngân chỉ thấy/vào được POS, đơn hàng, đặt lịch.
- [ ] RBAC smoke: staff Kho chỉ thấy/vào được sản phẩm, linh kiện, tồn kho, nhập hàng, nhà cung cấp.
- [ ] RBAC smoke: staff thiếu quyền truy cập URL trực tiếp bị middleware/client guard chặn.
- [ ] Staff page smoke: chọn preset, chỉnh quyền lẻ, lưu và reload vẫn giữ đúng permissions.

## Notes

- 2026-06-08: Added lightweight PWA shell for admin mobile: manifest, app icons, iOS/Android standalone metadata, safe-area header, and per-device install prompt in mobile menu.
- Batch này chưa đổi sang permission action-level như `orders.create` hoặc `inventory.archive`.
- Không migrate dữ liệu user hiện có.
- Nếu cần phân quyền sâu hơn, mở batch 2 sau khi layout và route guard mới ổn định.
