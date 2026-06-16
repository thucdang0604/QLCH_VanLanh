# Kế hoạch cấu hình nội dung Homepage từ Admin Appearance

**Status:** completed (merged `master`)

## Mục tiêu

Loại bỏ dữ liệu hiển thị hardcode của hai section `Bảng giá sửa chữa` và `Đánh giá khách hàng` trên homepage. Admin chỉnh cách hiển thị tại `/admin/appearance`; dữ liệu nghiệp vụ vẫn lấy từ nguồn gốc.

## Thay đổi

### 1. Schema cấu hình

- Thêm `homepagePricing`: tiêu đề, mô tả, CTA, nhóm thiết bị, từ khóa lọc và giới hạn dịch vụ hiển thị.
- Thêm `homepageReviews`: tiêu đề và `googlePlaceId`.
- Không lưu bản sao giá dịch vụ hoặc nội dung review trong `layout_settings`.

### 2. Admin Appearance

- Thêm trình chỉnh sửa bảng giá: thêm/xóa nhóm, chọn icon, chỉnh từ khóa lọc Firestore và giới hạn item.
- Thêm trình chỉnh sửa đánh giá: chỉnh tiêu đề và Google Place ID.

### 3. Homepage

- `PricingSection` đọc metadata từ `homepagePricing`, gọi `/api/services/homepage-pricing` để lấy dịch vụ active từ collection `services`.
- `GoogleReviewsSection` gọi `/api/reviews/google`; API server đọc Google Place ID từ `system_config/layout_settings` và gọi Google Places API.
- Bỏ mock review và dữ liệu giá mẫu phân tán trong storefront.
- Đưa hai section vào `homeSections` mặc định để admin bật/tắt và sắp xếp thật sự.

## Guardrails

- Dùng `system_config/layout_settings` cho metadata hiển thị, không tạo collection mới.
- Giá và thông tin dịch vụ tiếp tục quản lý tại collection `services`.
- Review luôn lấy từ Google Places API; API key chỉ nằm server-side trong `GOOGLE_MAPS_API_KEY`.
- Customer layout tiếp tục fetch config server-side qua Admin SDK.
- Không mở listener Firestore client mới cho storefront.

## Verification

- Chạy lint các file liên quan.
- Chạy `pnpm run typecheck`.
- Chạy `pnpm run build`.
- Kiểm tra local homepage và `/admin/appearance` compile thành công.
