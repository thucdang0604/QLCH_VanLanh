# Kế hoạch Chống trùng lặp Ảnh Excel Importer bằng SHA-256 Hash (Hybrid Deduplication)

Kế hoạch này nâng cấp luồng xử lý và upload hình ảnh cục bộ hàng loạt khi nhập dữ liệu từ Excel (`Excel Importer`). Bằng cách tích hợp cơ chế băm SHA-256 tại client-side và cơ chế truy vấn Lai (Hybrid Resolution), hệ thống sẽ đảm bảo tính chính xác tuyệt đối (không bao giờ lấy sai hình khi trùng tên file) đồng thời tối ưu hiệu năng và dung lượng lưu trữ Cloud Storage.

Đồng thời, kế hoạch bổ sung công cụ **Quét và upload thư mục ảnh thô** ngay trong component `ImageLinkTester` tại trang `initial-data/page.tsx` để giúp nhân viên dễ dàng upload hàng loạt ảnh trước, hiển thị danh sách tên file thô và URL tương ứng để tiện copy-paste vào file Excel.

## User Review Required

> [!IMPORTANT]
> **Đồng bộ hóa kiến trúc:** Giải pháp này tái sử dụng cơ chế băm SHA-256 của Web Crypto API hiện đang hoạt động tốt ở trang biên tập bài viết ([ArticleEditorModal.tsx](file:///m:/QLCH_VanLanh/src/features/articles/ArticleEditorModal.tsx)), đảm bảo tính nhất quán của toàn bộ dự án.
> **Cơ chế Lai (Hybrid) thông minh:** Bạn chỉ cần chọn tệp ảnh từ máy tính khi có cảnh báo xung đột thực tế (nhiều hình ảnh khác nhau có cùng tên file). Trong trường hợp tên ảnh là duy nhất trên hệ thống, bạn chỉ cần nhập tên vào Excel và import, hệ thống tự động map cực nhanh mà không cần thao tác chọn tệp bổ sung.
> **Công cụ hỗ trợ soạn thảo Excel cực mạnh:** Nhân viên chỉ cần kéo thả cả thư mục ảnh vào web, hệ thống tự động upload tối ưu lên Firebase và xuất ra danh sách tên file thô kèm nút **Copy tên file** một chạm để dán thẳng vào Excel.

## Proposed Changes

### Excel Import & Bootstrap Module

---

#### [MODIFY] [importSupport.ts](file:///m:/QLCH_VanLanh/src/features/excel-import/importSupport.ts)
* Nâng cấp hàm `uploadInitialImportImage` để nhận thêm tham số mã hash `hash: string`.
* Cập nhật logic upload ảnh lên Firebase Storage: lưu tệp vật lý dưới đường dẫn chứa mã hash: `media/${folder}/${hash}.webp` (thay vì dùng timestamp). Điều này đảm bảo chống trùng lặp vật lý hoàn hảo trên Storage.
* Đăng ký tài liệu Firestore trong collection `media_library` với ID cố định dựa trên mã hash: `MED-import-${folder}-${hash}` để phục vụ việc kiểm tra O(1) sau này. Lưu thêm trường `originalName` và `normalizedBaseName` phục vụ kịch bản tìm kiếm theo tên thô.

#### [MODIFY] [ExcelImportModal.tsx](file:///m:/QLCH_VanLanh/src/components/admin/ExcelImportModal.tsx)
* Thêm hàm helper `calculateHash(file: File): Promise<string>` sử dụng Web Crypto API (`window.crypto.subtle.digest`) để tính toán mã băm SHA-256 của file cục bộ trực tiếp trên RAM trình duyệt.
* Cập nhật hàm `handleLocalImages`:
  1. Khi người dùng chọn các file ảnh cục bộ từ máy tính, chạy băm SHA-256 song song cho toàn bộ các file đó.
  2. Dùng mã hash để kiểm tra tồn tại trực tiếp trong Firestore bằng `getDoc` với Document ID tương ứng (`MED-import-${folder}-${hash}`).
  3. Nếu tài liệu tồn tại ➔ Lấy luôn URL cũ mà không cần upload (tiết kiệm băng thông, bảo mật tuyệt đối).
  4. Nếu chưa tồn tại ➔ Gọi `uploadInitialImportImage` truyền kèm mã hash để upload và đăng ký mới.
* Cải tiến cơ chế kiểm tra ảnh ở bước Preview (Hybrid Check):
  - Khi phân tích dữ liệu Excel mà không có tệp ảnh được tải lên (người dùng muốn tự động map ảnh có sẵn):
    - Hệ thống truy vấn DB tìm các ảnh trùng tên gốc.
    - Nếu tìm thấy **chỉ có duy nhất 1 ảnh** trùng tên ➔ Gán URL ảnh đó (Trạng thái: Hợp lệ).
    - Nếu tìm thấy **từ 2 ảnh trở lên** cùng tên gốc nhưng khác mã hash (Xung đột thực tế) ➔ Hiển thị dòng cảnh báo màu vàng yêu cầu: *"Xung đột hình ảnh: Có nhiều ảnh khác nhau cùng tên trên hệ thống. Vui lòng nhấn nút Chọn ảnh để tải file thực tế lên để phân giải bằng hash."*
    - Nếu không tìm thấy ảnh nào ➔ Báo lỗi chưa có ảnh thông thường.

#### [MODIFY] [initial-data/page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/initial-data/page.tsx)
* Nâng cấp component `ImageLinkTester`:
  * Tích hợp hàm băm SHA-256 client-side tương tự `ArticleEditorModal.tsx`.
  * Thêm nút bấm **"Chọn thư mục ảnh hàng loạt"** (hỗ trợ chọn cả thư mục hoặc chọn nhiều file).
  * Thêm state quản lý danh sách ảnh đã xử lý: `TestedImage[]`.
  * Khi người dùng chọn thư mục ảnh:
    1. Quét toàn bộ danh sách file ảnh cục bộ được chọn.
    2. Băm SHA-256 từng file, kiểm tra trùng lặp trong DB theo ID mã hash.
    3. Nếu chưa có ➔ Gọi `uploadInitialImportImage` để nén WebP, upload lên Firebase Storage và đăng ký metadata.
    4. Cập nhật tiến trình xử lý thời gian thực trên giao diện.
  * Thiết kế giao diện **Bảng danh sách ảnh đã xử lý** (Processed Images List) nằm phía dưới:
    * Cột 1: Thumbnail xem trước của ảnh.
    * Cột 2: Tên file cục bộ thô (ví dụ: `iphone-15.png`) kèm nút **"Copy tên file"** (nhân viên click phát copy luôn để dán vào Excel).
    * Cột 3: Trạng thái (Upload mới / Dùng lại ảnh cũ) và thông tin thư mục lưu.
    * Cột 4: URL Firebase Storage thật kèm nút **"Copy URL"**.

## Verification Plan

### Automated Tests
- Khởi chạy chương trình kiểm tra kiểu dữ liệu của dự án để đảm bảo không phát sinh lỗi biên dịch TypeScript:
  ```powershell
  pnpm typecheck
  ```

### Manual Verification
1. **Kiểm tra an toàn (Chống trùng tên khác hình):**
   - Upload một sản phẩm có ảnh đặt tên là `test-sp.png` (hình màu đen).
   - Chuẩn bị file Excel import sản phẩm mới có ảnh ghi là `test-sp.png`. Chọn file ảnh thực tế `test-sp.png` (hình màu đỏ) từ máy tính lên.
   - Xác minh: Hệ thống nhận dạng mã hash khác nhau, tự động upload mới hình màu đỏ lên Storage dưới tên file hash mới mà không dùng lại hình màu đen cũ.
2. **Kiểm tra tối ưu (Tránh upload trùng):**
   - Import một file Excel có 3 dòng sản phẩm cùng sử dụng ảnh `share-image.png`.
   - Chọn tệp ảnh `share-image.png` từ máy tính.
   - Xác minh: Hệ thống chỉ upload ảnh lên Storage đúng 1 lần duy nhất, 3 sản phẩm đều được trỏ chung về 1 URL Firebase duy nhất.
3. **Kiểm tra kịch bản Lai (Tự động map tên thô):**
   - Nhập sản phẩm mới trong Excel ghi ảnh là `unique-image.png` (đã được upload lên hệ thống từ trước và là duy nhất). Không chọn tệp ảnh từ máy.
   - Xác minh: Hệ thống tự động map đúng URL của ảnh đó và báo trạng thái Hợp lệ (xanh) mà không cần yêu cầu chọn tệp.
4. **Kiểm tra công cụ hỗ trợ soạn thảo Excel (Image Link Tester):**
   - Click nút **Chọn thư mục ảnh hàng loạt** trên trang initial-data và chọn một folder chứa 5 ảnh.
   - Xác minh: Hệ thống xử lý mượt mà, hiển thị danh sách 5 ảnh bên dưới kèm thông tin tên file, trạng thái và URL thật. Click nút Copy tên file hoạt động chính xác (clipboard nhận được tên file thô để dán vào Excel).
