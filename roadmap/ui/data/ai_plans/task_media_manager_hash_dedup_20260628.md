# Danh sách nhiệm vụ: Đồng bộ Hóa Cơ chế Chống trùng lặp Ảnh bằng Hash

- `[x]` Triển khai cơ chế băm và chống trùng lặp trong cấu phần MediaManager
    - `[x]` Thêm hàm helper `calculateFileHash` vào `MediaManager.tsx`
    - `[x]` Cập nhật `handleUpload` để kiểm tra trùng lặp trên Firestore (đối chiếu ID `MED-...` và `MED-import-...`)
    - `[x]` Cập nhật trường `createdAt` của tài liệu cũ nếu trùng để đẩy ảnh lên đầu danh sách
    - `[x]` Thay đổi tên file và đường dẫn vật lý trên Storage dạng `media/${uploadFolder}/${hash}.${ext}` khi upload mới
- `[x]` Triển khai cơ chế băm và chống trùng lặp cho Ảnh đại diện Bài viết (Thumbnail)
    - `[x]` Di chuyển `calculateHash` ra phạm vi ngoài trong `ArticleEditorModal.tsx` để dùng chung
    - `[x]` Cập nhật `handleThumbnailUpload` để kiểm tra trùng lặp trên Firestore ID `MED-articles-${hash}` và tái sử dụng
    - `[x]` Cập nhật đường dẫn lưu trữ Storage và Firestore ID dạng hash khi upload mới
- `[x]` Triển khai cơ chế băm và chống trùng lặp vật lý cho hàm tiện ích tải ảnh chung
    - `[x]` Thêm hàm helper `calculateFileHash` vào `storage.ts`
    - `[x]` Cập nhật `uploadMedia` để lưu tên file vật lý dạng hash trên Storage
- `[x]` Kiểm tra biên dịch và xác minh hoạt động thực tế của toàn bộ hệ thống
