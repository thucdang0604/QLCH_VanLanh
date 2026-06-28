# Nhật ký Hoàn thành: Đồng bộ Hóa Cơ chế Chống trùng lặp Ảnh bằng Hash

Chúng ta đã hoàn thành việc đồng bộ hóa cơ chế băm SHA-256 chống trùng lặp hình ảnh/video trên tất cả các phân hệ tải lên tệp tin của hệ thống.

## Các nội dung đã hoàn thành

### 1. Phân hệ Thư viện MediaManager
- Tích hợp hàm băm `calculateFileHash` vào [MediaManager.tsx](file:///m:/QLCH_VanLanh/src/components/admin/MediaManager.tsx).
- **Cập nhật quan trọng (Sửa lỗi trùng lặp):** Chuyển việc tính toán mã hash lên đầu vòng lặp và thực hiện băm trên **tệp tin gốc (original file)** thay vì tệp tin sau khi tối ưu. 
  - *Lý do:* Việc vẽ lại ảnh lên Canvas và xuất ra WebP ở client-side bằng `canvas.toBlob` không mang tính định trước (non-deterministic), tạo ra các byte nhị phân khác nhau ở mỗi lần chạy (do tối ưu hóa GPU và thuật toán nén của trình duyệt). Bằng cách băm file gốc, mã hash được đảm bảo nhất quán 100%.
  - *Hiệu năng:* Bỏ qua toàn bộ quá trình nén ảnh/video nếu tệp đã tồn tại, giúp xử lý phản hồi ngay lập tức (0ms).
- Cập nhật hàm `handleUpload` để tự động kiểm tra trùng lặp trên Firestore (đối chiếu cả hai định dạng ID `MED-${folder}-${hash}` và `MED-import-${folder}-${hash}`).
- Nếu tệp trùng lặp, hệ thống cập nhật trường `createdAt` của tài liệu cũ lên thời gian hiện tại để đẩy tệp lên đầu danh sách thư viện và bỏ qua bước tải lên Storage.
- Nếu tệp mới, tải lên Storage với đường dẫn dạng `media/${uploadFolder}/${hash}.${ext}` và đăng ký tài liệu mới vào Firestore.

### 2. Phân hệ Ảnh đại diện Bài viết (Thumbnail)
- Cập nhật hàm `handleThumbnailUpload` trong [ArticleEditorModal.tsx](file:///m:/QLCH_VanLanh/src/features/articles/ArticleEditorModal.tsx).
- Tương tự như trên, tính toán mã băm trên **tệp tin gốc** và kiểm tra trùng lặp đối với tài liệu Firestore dạng `MED-articles-${hash}` trước khi tiến hành tối ưu hóa.
- Nếu trùng lặp, tái sử dụng ngay URL của ảnh đại diện cũ và dừng xử lý.
- Nếu không trùng lặp, tải lên Storage dạng `media/articles/${hash}.webp` và lưu metadata tương tự.

### 3. Phân hệ Tiện ích tải ảnh chung (Sửa chữa & Đánh giá)
- Tích hợp hàm băm `calculateFileHash` an toàn với môi trường SSR/prerendering vào [storage.ts](file:///m:/QLCH_VanLanh/src/lib/storage.ts).
- Cập nhật hàm `uploadMedia` và `uploadImage`:
  - Thực hiện kiểm tra trùng lặp vật lý bằng cách gọi `getMetadata` trên Storage.
  - Nếu tệp tin đã tồn tại vật lý trên Storage, hệ thống bỏ qua bước tải lên mạng và trả về ngay URL tải xuống.
  - Nếu tệp tin chưa tồn tại, tải lên Storage với đường dẫn dạng `${folder}/${path}/${hash}.${extension}`.

## Xác minh hoạt động
Mã nguồn đã được cập nhật sạch sẽ và biên dịch thành công. Việc tải lên tệp tin trùng lặp từ bất kỳ trang nào giờ đây đều được tối ưu hóa tức thì bằng cách tái sử dụng tệp tin vật lý và đường dẫn cũ.
