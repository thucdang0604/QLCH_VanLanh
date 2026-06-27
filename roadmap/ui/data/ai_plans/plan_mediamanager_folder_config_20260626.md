# Kế hoạch Đồng bộ Cấu hình Thư mục MediaManager

Kế hoạch này nhằm chuẩn hóa và cấu hình chính xác thuộc tính `defaultFolder` của component `MediaManager` ở tất cả các tính năng trong hệ thống quản trị Admin, đảm bảo hình ảnh/video khi upload được tự động phân loại thông minh và lưu trữ đồng bộ vào đúng thư mục nghiệp vụ trên Firebase Storage và Firestore.

## 📁 Thư mục lưu trữ chuẩn hóa
Hệ thống sử dụng các thư mục đích sau để lưu trữ media:
* `media/general/` ➔ Ảnh/tài nguyên hệ thống chung.
* `media/products/` ➔ Ảnh sản phẩm bán lẻ.
* `media/parts/` ➔ Hình ảnh linh kiện kỹ thuật.
* `media/services/` ➔ Ảnh dịch vụ sửa chữa.
* `media/articles/` ➔ Ảnh bài viết tin tức, khuyến mãi (thumbnail & ảnh nội dung).
* `media/repairs/` ➔ Ảnh và video quá trình sửa chữa (trước nhận máy & sau khi sửa xong).
* `media/logo-brand/` ➔ Logo thương hiệu, logo in biên nhận, logo website.
* `media/banners/` ➔ Banner trang chủ.
* `media/frames/` ➔ Khung viền trang chủ.

---

## 🛠️ Danh sách các file cần chỉnh sửa và cấu hình cụ thể

### 1. [RepairMediaManagers.tsx](file:///m:/QLCH_VanLanh/src/features/repairs/RepairMediaManagers.tsx) (Ảnh/Video Sửa chữa)
* **Chức năng:** Quản lý hình ảnh lúc nhận máy, ảnh sau sửa xong và video quá trình sửa máy.
* **Thay đổi:** Cấu hình `defaultFolder="repairs"` cho cả 2 modal `MediaManager` (lúc nhận máy và sau sửa).
* **Mục tiêu:** Lưu trữ đồng bộ toàn bộ ảnh/video sửa chữa vào thư mục `media/repairs/`.

### 2. [ArticleEditorModal.tsx](file:///m:/QLCH_VanLanh/src/features/articles/ArticleEditorModal.tsx) (Ảnh Bài viết Tin tức)
* **Chức năng:** Soạn thảo bài viết và chọn ảnh đại diện (thumbnail).
* **Thay đổi:** Cấu hình `defaultFolder="articles"` cho modal `MediaManager` chọn ảnh thumbnail bài viết.
* **Mục tiêu:** Lưu ảnh thumbnail bài viết vào thư mục `media/articles/`.

### 3. [ReceiptSettingsPanel.tsx](file:///m:/QLCH_VanLanh/src/app/admin/settings/ReceiptSettingsPanel.tsx) (Logo biên nhận in hóa đơn)
* **Chức năng:** Thiết lập mẫu biên nhận và chọn logo in hóa đơn.
* **Thay đổi:** Cấu hình `defaultFolder="logo-brand"` cho modal `MediaManager` chọn logo biên nhận.
* **Mục tiêu:** Lưu logo biên nhận vào thư mục `media/logo-brand/`.

### 4. [CategoriesTab.tsx](file:///m:/QLCH_VanLanh/src/app/admin/settings/CategoriesTab.tsx) (Thương hiệu & Danh mục)
* **Chức năng:** Quản lý Logo Thương hiệu và Icon Danh mục.
* **Thay đổi:**
  * Cấu hình `defaultFolder="logo-brand"` cho modal `MediaManager` chọn Logo Thương hiệu (dòng 630).
  * Cấu hình `defaultFolder="general"` cho modal `MediaManager` chọn Icon Danh mục (dòng 329).
* **Mục tiêu:** Lưu logo thương hiệu vào thư mục `media/logo-brand/` và icon danh mục vào thư mục `media/general/`.

### 5. [appearance/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/appearance/page.tsx) (Giao diện hệ thống)
* **Chức năng:** Quản lý giao diện, bao gồm logo web, banners trang chủ, background và khung viền.
* **Thay đổi:** Cấu hình `defaultFolder` **động** dựa trên state của `mediaTarget` (mục tiêu đang chọn ảnh):
  * `mediaTarget === 'logo'` ➔ `defaultFolder="logo-brand"`
  * `mediaTarget === 'banner'` ➔ `defaultFolder="banners"`
  * `mediaTarget?.startsWith('section_frame_')` ➔ `defaultFolder="frames"`
  * `mediaTarget?.startsWith('section_bg_')` hoặc `'background'` ➔ `defaultFolder="banners"` hoặc `general`.
* **Mục tiêu:** Tự động gom đúng ảnh vào thư mục tương ứng khi người dùng click chọn logo, banner, khung viền, hoặc background.

### 6. [initial-data/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/initial-data/page.tsx) (Excel Importer)
* **Chức năng:** Công cụ kiểm tra link ảnh trước khi nhập dữ liệu Excel.
* **Thay đổi:**
  * Bổ sung một **Select Box chọn Thư mục lưu ảnh** (Sản phẩm, Linh kiện, Dịch vụ, Chung) ngay cạnh nút "Mở MediaManager".
  * Sử dụng state `testFolder` để lưu lựa chọn thư mục của người dùng.
  * Truyền `defaultFolder={testFolder}` vào component `MediaManager`.
* **Mục tiêu:** Cho phép người dùng chủ động chọn thư mục đích khi upload ảnh chuẩn bị dữ liệu Excel cho các loại thực thể khác nhau (Sản phẩm, Linh kiện, Dịch vụ, v.v.).

---

## 📊 Kế hoạch kiểm thử & nghiệm thu
1. **Tự động hóa:** Chạy `pnpm typecheck`, `pnpm lint` và `pnpm build` để đảm bảo code compile 100% thành công không có lỗi.
2. **Kiểm thử thủ công:**
   * Mở giao diện soạn bài viết ➔ Click chọn thumbnail bài viết ➔ Chuyển sang tab Upload mới ➔ Xác nhận thư mục mặc định là "Tin tức".
   * Mở giao diện Excel Importer ➔ Chọn "Dịch vụ" ở Select Box ➔ Click "Mở MediaManager" ➔ Chuyển sang tab Upload mới ➔ Xác nhận thư mục mặc định là "Dịch vụ".
   * Mở giao diện Sửa chữa ➔ Chọn ảnh nhận máy ➔ Xác nhận tab Upload mới tự chọn "Sửa chữa".
