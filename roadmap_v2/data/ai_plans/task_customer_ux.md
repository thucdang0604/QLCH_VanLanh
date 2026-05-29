# Danh sách công việc: Customer UX Optimization

- [x] **1. Popup Tra Cứu Đơn Hàng (Tracking Modal)**
  - [x] Tạo file `src/components/TrackingModal.tsx` (Bottom Sheet style trên Mobile).
  - [x] Sửa `src/components/layout/Header.tsx` để tích hợp Modal.
  - [x] Sửa `src/components/layout/MobileBottomNav.tsx` để mở Modal từ thanh điều hướng dưới.
- [x] **2. Gộp Chat Widget (Speed Dial)**
  - [x] Cập nhật `src/components/ChatWidget.tsx` gom 3 bong bóng chat vào 1 nút Floating Action Button.
- [x] **3. Bảng Giá Sửa Chữa (Pricing Table Section)**
  - [x] Tạo file `src/components/home/PricingSection.tsx` (Tab thiết bị, vuốt ngang).
  - [x] Chèn vào `src/app/(customer)/page.client.tsx`.
- [x] **4. Đánh giá từ Google Maps (Google Reviews)**
  - [x] Tạo API Backend `src/app/api/reviews/google/route.ts` để giấu API Key và Cache.
  - [x] Tạo component hiển thị `src/components/home/GoogleReviewsSection.tsx` (Mobile Slider).
  - [x] Chèn vào `src/app/(customer)/page.client.tsx`.
- [x] **5. Mobile Search Header**
  - [x] Cập nhật `src/components/layout/Header.tsx` đưa thanh tìm kiếm ra khỏi Hamburger menu và ghim cố định bên dưới Logo trên giao diện điện thoại.
