# Kế hoạch Đọc & Phân tích Mã nguồn (Codebase Reading Journal - Đợt 3)

Kế hoạch này tiếp nối các phiên làm việc trước, thực hiện đọc dòng đối dòng thủ công các tệp tin nghiệp vụ giao diện (storefront components) của dự án `QLCH_VanLanh` để ghi nhận chi tiết chức năng, logic nghiệp vụ, cơ chế hoạt động và đánh giá kỹ thuật vào tệp nhật ký `roadmap/ai/codebase_reading_journal.md`.

## 📌 Mục tiêu
- Phân tích thủ công 100% dòng đối dòng, tuyệt đối không dùng công cụ tự động hay script quét mã nguồn.
- Đọc và tài liệu hóa chi tiết **16 tệp tin** thuộc các thư mục components còn lại:
  - `src/components/layout/` (2 tệp còn lại: `Header.tsx`, `MobileBottomNav.tsx`)
  - `src/components/common/` (1 tệp: `Container.tsx`)
  - `src/components/ui/` (2 tệp: `LazyImage.tsx`, `Skeleton.tsx`)
  - `src/components/home/` (11 tệp: Các khối giao diện trang chủ storefront)
- Cập nhật kết quả phân tích khoa học vào cuối tệp nhật ký `roadmap/ai/codebase_reading_journal.md` theo cấu trúc gom nhóm tăng dần (Nhóm 37 và Nhóm 38), bảo toàn nguyên vẹn 36 nhóm đã phân tích trước đó.

## 📂 Phạm vi Phân tích (Scope)

### 1. Nhóm 37: Các Layouts, Common và UI Components của Storefront
- **`src/components/layout/Header.tsx`** (13.0KB) - Thanh đầu trang storefront chứa thanh tìm kiếm, menu danh mục động và giỏ hàng.
- **`src/components/layout/MobileBottomNav.tsx`** (13.3KB) - Thanh điều hướng dưới cùng chuyên biệt cho thiết bị di động.
- **`src/components/common/Container.tsx`** (479 Bytes) - Component wrapper căn giữa nội dung.
- **`src/components/ui/LazyImage.tsx`** (3.3KB) - Component tải ảnh lười biếng có skeleton/error fallback.
- **`src/components/ui/Skeleton.tsx`** (3.7KB) - Component hiển thị khung xương tải dữ liệu.

### 2. Nhóm 38: Các Khối Giao diện Trưng bày Trang chủ (Storefront Homepage Sections)
- **`src/components/home/ArticleBlock.tsx`** (7.9KB) - Khối hiển thị danh sách bài viết/tin tức công nghệ.
- **`src/components/home/BookingSection.tsx`** (26.2KB) - Phân hệ đặt lịch sửa chữa thiết bị trực tuyến của khách hàng.
- **`src/components/home/CategoriesSection.tsx`** (3.6KB) - Khối hiển thị danh mục sản phẩm/phụ kiện nổi bật.
- **`src/components/home/FlashSale.tsx`** (7.6KB) - Khối trưng bày các sản phẩm đang khuyến mãi giờ vàng.
- **`src/components/home/FloatingReviews.tsx`** (8.1KB) - Khối bong bóng đánh giá nổi từ khách hàng.
- **`src/components/home/GoogleReviewsSection.tsx`** (11.4KB) - Khối tích hợp hiển thị đánh giá từ Google Maps API.
- **`src/components/home/HeroSection.tsx`** (19.4KB) - Khu vực banner chính trang chủ thu hút khách hàng.
- **`src/components/home/PricingSection.tsx`** (8.1KB) - Bảng giá sửa chữa thiết bị theo tab vuốt ngang.
- **`src/components/home/ServiceBlock.tsx`** (8.3KB) - Khối hiển thị các dịch vụ sửa chữa nổi bật.
- **`src/components/home/ServiceCard.tsx`** (7.7KB) - Thẻ hiển thị thông tin chi tiết một dịch vụ sửa chữa.
- **`src/components/home/SuggestedSection.tsx`** (5.5KB) - Khối gợi ý sản phẩm/phụ kiện dựa trên hành vi người dùng.

## 🛠️ Quy trình Thực hiện & Ràng buộc Kỹ thuật
1. **Đọc thủ công 100%:** Sử dụng `view_file` đọc từng dòng code của từng tệp tin để hiểu sâu sắc logic nghiệp vụ, cấu trúc dữ liệu, các hooks và tương tác Firestore/API.
2. **Surgical Changes:** Chỉ sửa duy nhất tệp nhật ký `roadmap/ai/codebase_reading_journal.md`, không thay đổi hay chỉnh sửa bất kỳ tệp nguồn nào của dự án.
3. **Ngôn ngữ ghi nhận:** Toàn bộ phân tích, mô tả cơ chế hoạt động và đánh giá kỹ thuật được viết bằng **Tiếng Việt** chuẩn mực, thực tế.
4. **Cú pháp Markdown:** Tuân thủ nghiêm ngặt rào cản kỹ thuật của dự án (cú pháp Mermaid khép kín nếu có vẽ đồ thị, không dùng dấu chấm đầu tên file nháp/kế hoạch, không bọc backticks thô quanh template literals trong tài liệu).

## 🏁 Tiêu chí Hoàn thành
- Tài liệu hóa thành công 16 tệp tin giao diện nêu trên vào tệp nhật ký `roadmap/ai/codebase_reading_journal.md`.
- Đảm bảo tệp nhật ký không bị lỗi định dạng, được lưu trữ đúng cấu trúc tăng dần từ nhóm 1 đến nhóm 38.
- Cập nhật nhật ký tiến trình (Walkthrough) và cập nhật trạng thái trong `manifest.json` thành `completed` when hoàn thành.
