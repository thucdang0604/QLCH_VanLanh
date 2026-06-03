# Walkthrough: cấu hình nội dung Homepage từ Admin Appearance

## Kết quả

Admin mở `/admin/appearance` và dùng hai card mới:

1. `Bảng giá sửa chữa trang chủ`
   - Chỉnh tiêu đề, mô tả, CTA.
   - Thêm/xóa nhóm thiết bị.
   - Chỉnh từ khóa lọc Firestore và giới hạn số dịch vụ mỗi nhóm.

2. `Đánh giá khách hàng trang chủ`
   - Chỉnh tiêu đề.
   - Nhập Google Place ID của cửa hàng.

## Luồng dữ liệu

`/admin/appearance` -> `ConfigContext.updateConfig()` -> Firestore `system_config/layout_settings` -> customer layout fetch server-side -> homepage sections.

`PricingSection` -> `/api/services/homepage-pricing` -> Firestore collection `services` -> lọc dịch vụ active theo từ khóa cấu hình.

`GoogleReviewsSection` -> `/api/reviews/google` -> đọc Place ID trong `system_config/layout_settings` -> Google Places API. Nếu thiếu API key hoặc Place ID thì API trả danh sách rỗng; nếu Google trả lỗi thì section review cũng không hiển thị dữ liệu giả.

## Google Places API (New)

`/api/reviews/google` calls Place Details (New) at `places.googleapis.com/v1/places/{PLACE_ID}` with a response field mask. The storefront receives a normalized review shape, while `GOOGLE_MAPS_API_KEY` remains server-side only.

Nếu API key chưa sẵn sàng hoặc Google từ chối request, homepage hiển thị CTA mở địa điểm Văn Lành Service bằng Google Maps URL chính thức. CTA không cần API key và không hiển thị review giả.
