# Task List - Hardcode Cleanup 2026-06-07

## P0 - API Key

- [ ] Kiểm tra `src/app/(customer)/info/gioi-thieu/page.tsx` đang nhúng Google Maps key trực tiếp.
- [ ] Chuyển Maps embed sang env/config an toàn hoặc server-controlled URL.
- [ ] Xác nhận key đã restrict domain hoặc rotate nếu cần.

## P1 - Storefront Runtime Fallback

- [ ] Xử lý `src/components/home/HeroSection.tsx`: không dùng banner/giá hardcode khi thiếu `hero_banners`.
- [ ] Xử lý `src/components/home/ServiceBlock.tsx`: không hiển thị `demoServices` khi Firestore rỗng/lỗi.
- [ ] Xử lý Google Reviews: Place ID/query lấy từ config/env; API lỗi chỉ hiện CTA Google Maps chính thức.

## P1 - Business Identity

- [ ] Tạo hoặc chuẩn hóa helper business identity dùng `system_config` + env fallback rõ ràng.
- [ ] Refactor header/footer/chat/mobile bottom nav dùng helper thay vì hotline/link rải rác.
- [ ] Refactor các trang `info/*` dùng config cho hotline/domain/address/social.
- [ ] Refactor SEO metadata/JSON-LD ở `layout`, `layout.shell`, `category`, `product`, `service`.
- [ ] Refactor AI prompt/handoff text dùng business identity thay vì brand/hotline hardcode.

## P1 - Workflow/Permission Constants

- [ ] Gom repair part statuses (`requested`, `ordered`, `selected`, `in_stock`, `rejected`, `cancelled`) vào constants/helper typed.
- [ ] Gom repair ticket statuses (`dang_kiem_tra`, `cho_ban_giao_khach`, `done`, `refund`, `out`) vào helper hoặc workflow config resolver.
- [ ] Thay `email?.includes('admin')` bằng permission/role explicit.
- [ ] Verify các luồng KTV, bàn giao, nhập linh kiện, POS checkout không đổi hành vi.

## P2 - Demo/Template Fixtures

- [ ] Tách Excel import example rows khỏi runtime logic hoặc đổi tên rõ là template fixture.
- [ ] Tách warranty receipt preview data khỏi component logic.
- [ ] Đảm bảo dữ liệu demo không thể được ghi thẳng vào production collection ngoài thao tác import có preview/confirm.

## Verification

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm build`
- [ ] Browser QA các màn hình storefront bị ảnh hưởng.
- [ ] Smoke test admin settings/appearance sau khi đổi config.

