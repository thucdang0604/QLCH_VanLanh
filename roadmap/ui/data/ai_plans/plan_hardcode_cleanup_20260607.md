# Hardcode Cleanup 2026-06-07

## Mục tiêu

Loại bỏ các hardcode còn ảnh hưởng runtime/production sau đợt rà soát codebase ngày 2026-06-07. Trọng tâm là đưa thông tin nhạy cảm, thông tin nhận diện doanh nghiệp, dữ liệu storefront, workflow status và dữ liệu demo về đúng nguồn cấu hình thay vì nằm rải rác trong source.

## Phạm vi ưu tiên

### P0 - Secret/API key

- Xử lý Google Maps Embed API key đang nằm trực tiếp trong `src/app/(customer)/info/gioi-thieu/page.tsx`.
- Đưa key qua env/server route hoặc cấu hình được kiểm soát; xác nhận domain restriction/rotation trước khi coi là xong.

### P1 - Storefront không hiển thị dữ liệu giả

- Gỡ hoặc thay thế `fallbackSlides` hardcode trong `src/components/home/HeroSection.tsx`.
- Gỡ `demoServices` runtime fallback trong `src/components/home/ServiceBlock.tsx`; khi thiếu dữ liệu thật thì ẩn section hoặc hiện CTA cấu hình, không hiện giá/dịch vụ giả.
- Chuẩn hóa Google Reviews fallback: Place ID/query lấy từ config/env; khi API lỗi chỉ mở CTA Google Maps chính thức, không tự tạo review giả.

### P1 - Business identity tập trung

- Gom brand, hotline, email, domain, địa chỉ, social links, Google Maps link và LocalBusiness schema về helper/config trung tâm.
- Ưu tiên các file customer-facing và SEO/schema: `layout.tsx`, `layout.shell.tsx`, các trang `info/*`, `category/[...slug]`, `product/[id]`, `service/[id]`, `ChatWidget`, `Header`, `Footer`, `MobileBottomNav`.
- Sau thay đổi, đổi `system_config` hoặc env phải cập nhật đồng bộ UI, SEO metadata, JSON-LD và AI prompt.

### P1 - Workflow/status constants

- Thay các so sánh status string rải rác bằng constants/helper có type rõ hoặc mapping từ workflow config.
- Ưu tiên repair/inventory/POS: `src/app/admin/repairs/page.tsx`, `src/app/admin/technician/page.tsx`, `src/app/api/repairs/transition/route.ts`, `src/app/api/inventory/import/route.ts`, `src/lib/workflowFeatures.ts`.
- Xóa bypass quyền dựa trên `email?.includes('admin')`; chỉ dùng role/permission rõ ràng.

### P2 - Demo/template tách khỏi runtime

- Tách ví dụ Excel import (`example.com`, `M:\...`, mẫu iPhone/Samsung) ra fixture/template rõ ràng, không trộn vào logic import.
- Tách dữ liệu preview phiếu bảo hành (`HD-123456`, `15/10/2026`, pass `123456`, giá mẫu) thành preview fixture, bảo đảm không bị dùng cho dữ liệu thật.

## Guardrails

- Không dùng `eslint-disable @typescript-eslint/no-explicit-any`.
- Không thay đổi schema sản phẩm/POS/repair nếu không cần.
- Với Firestore transaction, luôn đọc trước ghi.
- Sau mỗi batch phải chạy tối thiểu `pnpm lint` và `pnpm typecheck`; batch có ảnh hưởng storefront/SEO phải chạy `pnpm build`.
- Mọi fix đáng kể phải cập nhật `roadmap/ai/modules/other_bugs.md`, `roadmap/ai/dashboard.md`, `roadmap/ui/data/manifest.json` và nếu có thay đổi kiến trúc lớn thì cập nhật `roadmap/ui/data/source_intelligence.json`.

## Thứ tự xử lý đề xuất

1. P0 Maps key và domain/config source of truth.
2. P1 storefront fake fallback.
3. P1 business identity helper cho customer-facing/SEO.
4. P1 workflow/status constants và permission bypass.
5. P2 fixture hóa demo/template.

