# Kế hoạch Đồng bộ Hóa Cơ chế Chống trùng lặp Ảnh bằng Hash cho Toàn bộ Hệ thống

## Giới thiệu & Bối cảnh
Sau khi kiểm tra toàn bộ mã nguồn, chúng tôi phát hiện ra các khu vực thực hiện tải lên hình ảnh/video bao gồm:
1. **Excel Importer** (`importSupport.ts`): Đã sử dụng cơ chế băm SHA-256 chống trùng lặp.
2. **Trình soạn thảo bài viết (Nhúng ảnh Base64)** (`ArticleEditorModal.tsx`): Đã sử dụng cơ chế băm SHA-256 chống trùng lặp.
3. **Thư viện MediaManager** (`MediaManager.tsx`): Chưa sử dụng cơ chế băm (vẫn dùng tên file kèm `Date.now()`).
4. **Tải lên Ảnh đại diện Bài viết (Thumbnail)** (`ArticleEditorModal.tsx` - `handleThumbnailUpload`): Chưa sử dụng cơ chế băm.
5. **Hàm tiện ích chung `uploadMedia`** (`storage.ts`): Chưa sử dụng cơ chế băm (dùng cho ảnh bàn giao sửa chữa `RepairTicketBoard.tsx` và đánh giá của khách hàng `rate/page.tsx`, `tracking/page.tsx`).

Mục tiêu của kế hoạch này là **đồng bộ hóa cơ chế chống trùng lặp hình ảnh bằng mã hash SHA-256 trên tất cả các phân hệ chưa được áp dụng** để tối ưu hóa triệt để dung lượng lưu trữ Storage và Firestore.

---

## Các thay đổi đề xuất

### Phân hệ 1: Thư viện MediaManager
#### [MODIFY] [MediaManager.tsx](file:///m:/QLCH_VanLanh/src/components/admin/MediaManager.tsx)
- Bổ sung hàm helper `calculateFileHash(file: File): Promise<string>` sử dụng Web Crypto API.
- Cập nhật hàm `handleUpload`:
  - Tính toán mã hash của file sau khi tối ưu hóa.
  - Kiểm tra trùng lặp trên Firestore đối với cả 2 định dạng ID (`MED-${folder}-${hash}` và `MED-import-${folder}-${hash}`).
  - Nếu trùng, cập nhật `createdAt` bằng `serverTimestamp()` và tiếp tục vòng lặp (skip upload).
  - Nếu không trùng, đặt tên đường dẫn vật lý trên Storage dạng `media/${uploadFolder}/${hash}.${ext}` và lưu tài liệu Firestore mới với ID `MED-${uploadFolder}-${hash}`.

### Phân hệ 2: Ảnh đại diện Bài viết (Thumbnail)
#### [MODIFY] [ArticleEditorModal.tsx](file:///m:/QLCH_VanLanh/src/features/articles/ArticleEditorModal.tsx)
- Di chuyển hàm `calculateHash` ra phạm vi ngoài (file-scope) để dùng chung.
- Cập nhật hàm `handleThumbnailUpload`:
  - Tính toán mã hash của file ảnh sau khi tối ưu.
  - Truy vấn kiểm tra trùng lặp trong Firestore với Document ID dạng `MED-articles-${hash}`.
  - Nếu tồn tại, tái sử dụng URL cũ và bỏ qua bước tải lên Storage.
  - Nếu chưa tồn tại, tải lên Storage với đường dẫn dạng `media/articles/${hash}.webp` và lưu metadata vào Firestore.

### Phân hệ 3: Hàm tiện ích tải ảnh chung (Sửa chữa & Đánh giá)
#### [MODIFY] [storage.ts](file:///m:/QLCH_VanLanh/src/lib/storage.ts)
- Bổ sung hàm helper `calculateFileHash(file: File): Promise<string>` sử dụng Web Crypto API.
- Cập nhật hàm `uploadMedia` và `uploadImage`:
  - Tính toán mã hash của tệp trước khi tải lên.
  - Đặt tên đường dẫn vật lý trên Storage dạng `${folder}/${path}/${hash}.${ext}` để chống trùng lặp vật lý. Như vậy, các ảnh bàn giao sửa chữa hoặc ảnh đánh giá giống hệt nhau sẽ dùng chung 1 file vật lý trên Storage.

---

## Kế hoạch Xác minh & Kiểm thử

### Kiểm thử thủ công
1. **Kiểm tra biên dịch**: Đảm bảo không có lỗi TypeScript hay Next.js.
2. **Kiểm tra Thư viện MediaManager**: Tải lên một ảnh 2 lần, xác nhận lần 2 hoàn thành ngay lập tức và không tạo file mới trên Storage/Firestore.
3. **Kiểm tra Thumbnail Bài viết**: Tải lên ảnh đại diện bài viết trùng với ảnh đã có trong thư viện bài viết, xác nhận hệ thống tự động map URL cũ.
4. **Kiểm tra Ảnh Sửa chữa & Đánh giá**: Tải lên ảnh bàn giao thiết bị trong phiếu sửa chữa và kiểm tra đường dẫn trên Storage dạng hash để xác nhận tính năng băm hoạt động.
