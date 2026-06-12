# Task List - Hardcode Cleanup 2026-06-07

## P0 - API Key

- [x] Kiểm tra `src/app/(customer)/info/gioi-thieu/page.tsx` đang nhúng Google Maps key trực tiếp.
- [x] Chuyển Maps embed sang CTA Google Maps không dùng key, đọc `store_branches[0].mapLink` hoặc query từ địa chỉ cấu hình.
- [x] Không còn API key trong page source; key cũ cần được restrict/rotate ngoài repo nếu chưa cấu hình domain restriction.

## P1 - Storefront Runtime Fallback

- [x] Xử lý `src/components/home/HeroSection.tsx`: không dùng banner/giá hardcode khi thiếu `hero_banners`.
- [x] Xử lý `src/components/home/ServiceBlock.tsx`: không hiển thị `demoServices` khi Firestore rỗng/lỗi.
- [x] Xử lý Google Reviews: Place ID/query lấy từ config/env; API lỗi chỉ hiện CTA Google Maps chính thức.

## P1 - Business Identity

- [x] Tạo hoặc chuẩn hóa helper business identity dùng `system_config` + env fallback rõ ràng.
- [x] Refactor header/footer/chat/mobile bottom nav dùng helper thay vì hotline/link rải rác.
- [x] Refactor các trang `info/*` dùng config cho hotline/domain/address/social.
- [x] Refactor SEO metadata/JSON-LD ở `layout`, `layout.shell`, `category`, `product`, `service`.
- [x] Refactor AI prompt/handoff text dùng business identity thay vì brand/hotline hardcode.

## P1 - Workflow/Permission Constants

- [x] Gom repair part statuses (`requested`, `ordered`, `selected`, `in_stock`, `rejected`, `cancelled`) vào constants/helper typed.
- [x] Gom repair ticket statuses (`dang_kiem_tra`, `cho_ban_giao_khach`, `done`, `refund`, `out`) vào helper hoặc workflow config resolver.
- [x] Thay `email?.includes('admin')` bằng permission/role explicit.
- [ ] Verify các luồng KTV, bàn giao, nhập linh kiện, POS checkout không đổi hành vi. _(2026-06-07: source refactor pass `pnpm lint`, `pnpm typecheck`, `pnpm build`; chưa chạy smoke có dữ liệu admin thực tế.)_

## P2 - Demo/Template Fixtures

- [x] Tách Excel import example rows khỏi runtime logic hoặc đổi tên rõ là template fixture.
- [x] Tách warranty receipt preview data khỏi component logic.
- [x] Đảm bảo dữ liệu demo không thể được ghi thẳng vào production collection ngoài thao tác import có preview/confirm.

## Verification

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm build`
- [x] Browser QA các màn hình storefront bị ảnh hưởng.
- [ ] Smoke test admin settings/appearance sau khi đổi config.
