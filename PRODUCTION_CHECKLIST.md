# Production & Custom Domain Checklist

Tài liệu này ghi chú lại những việc **bắt buộc phải làm** khi dự án `QLCH_VanLanh` được chuyển sang chạy tên miền chính thức (Custom Domain: `vanlanh.com` hoặc tương tự) thay vì chạy trên tên miền mặc định `qlch-vanlanh.web.app`.

## 1. Môi trường (Environment Variables)
- [ ] Khai báo biến môi trường `NEXT_PUBLIC_SITE_URL=https://[YOUR_CUSTOM_DOMAIN]` trên nền tảng deploy (Firebase Hosting / Cloud Run / Vercel).
  - Điều này đảm bảo Sitemap, Robots, URL hình ảnh và thẻ Canonical/OpenGraph sẽ tự động đổi sang tên miền mới mà không cần can thiệp vào Source Code.

## 2. Firebase Authentication (Auth)
- [ ] Vào **Firebase Console -> Authentication -> Settings -> Authorized Domains**.
- [ ] Bấm nút **Add domain** và nhập tên miền mới của bạn.
  - **Lý do rủi ro**: Chức năng đăng nhập (như Sign in with Google) sẽ bị chặn ngay lập tức (`unauthorized-domain`) nếu tên miền gọi API không nằm trong danh sách an toàn này.

## 3. Chống Duplicate Content (Firebase Hosting)
- [ ] Mở file `firebase.json` ở root.
- [ ] Cấu hình mục `"redirects"` để **chuyển hướng 301 (Permanent Redirect)** tự động toàn bộ truy cập từ `https://qlch-vanlanh.web.app/*` sang `https://[YOUR_CUSTOM_DOMAIN]/*`.
  - **Lý do rủi ro**: Nhằm tránh việc Google Search Console phạt SEO do đánh dấu "Duplicate Content" (nội dung trùng lặp) giữa 2 tên miền khác nhau tải chung 1 phiên bản website.
  - *Ví dụ Redirect Rules:*
    ```json
    "redirects": [
      {
        "source": "**",
        "destination": "https://[YOUR_CUSTOM_DOMAIN]/:1",
        "type": 301
      }
    ]
    ```

## 4. Google Search Console & Analytics
- [ ] Thêm tên miền chính thức dưới dạng Property mới vào Google Search Console.
- [ ] Nộp sơ đồ trang web theo đường dẫn: `https://[YOUR_CUSTOM_DOMAIN]/sitemap.xml`.
- [ ] Trong Google Analytics, kiểm tra cấu hình data stream Web để xác nhận rằng domain mới đã được khai báo và ghi nhận đúng sự kiện Tracking.

## 5. Third-Party APIs (Ngoại Vi)
- [ ] Nếu tích hợp Payment Gateway (VNPAY, MoMo...), nhớ cập nhật lại `returnUrl` hoặc `callbackUrl` sang cấu trúc của Custom Domain.
- [ ] Nếu sử dụng API Facebook Login/Zalo Login, thêm Domain mới vào App Settings của các nền tảng đó.
