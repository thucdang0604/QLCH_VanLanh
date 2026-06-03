# Task: cấu hình nội dung Homepage từ Admin Appearance

- [x] Thêm type và fallback cho `homepagePricing`, `homepageReviews`.
- [x] Lưu hai field trong `system_config/layout_settings`.
- [x] Thêm cấu hình nhóm bảng giá, từ khóa lọc và giới hạn item tại `/admin/appearance`.
- [x] Thêm cấu hình tiêu đề review và Google Place ID.
- [x] Thêm `/api/services/homepage-pricing` đọc dịch vụ active từ Firestore.
- [x] Chuyển `PricingSection` sang đọc dịch vụ thật từ API server.
- [x] Chuyển `GoogleReviewsSection` sang chỉ đọc Google Places API.
- [x] Bỏ mock hardcode khỏi `/api/reviews/google`.
- [x] Normalize schema config cũ để loại dữ liệu nhập tay thử nghiệm.
- [x] Cho phép bật/tắt, sắp xếp hai section qua `homeSections`.
- [x] Chạy lint, typecheck và production build.
