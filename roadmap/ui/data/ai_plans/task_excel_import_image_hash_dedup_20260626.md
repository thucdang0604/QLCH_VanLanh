# Checklist: Chống trùng lặp Ảnh Excel Importer bằng SHA-256 Hash

- `[/]` 1. Thiết kế và Alignment Kế hoạch
  - `[x]` Tạo Implementation Plan (`plan_excel_import_image_hash_dedup_20260626.md`)
  - `[x]` Đăng ký kế hoạch vào `manifest.json`
  - `[ ]` Chờ người dùng phê duyệt kế hoạch để bắt đầu thực thi

- `[ ]` 2. Cải tiến Core Helpers (`importSupport.ts`)
  - `[ ]` Nâng cấp kiểu dữ liệu và tham số cho `uploadInitialImportImage` nhận thêm `hash`
  - `[ ]` Cập nhật đường dẫn lưu trữ vật lý trên Storage dạng `media/${folder}/${hash}.webp`
  - `[ ]` Đăng ký tài liệu Firestore với ID chứa mã hash `MED-import-${folder}-${hash}`
  - `[ ]` Đảm bảo lưu đầy đủ trường `originalName` và `normalizedBaseName` để phục vụ tìm kiếm theo tên thô

- `[ ]` 3. Nâng cấp Giao diện và Logic Upload (`ExcelImportModal.tsx`)
  - `[ ]` Tích hợp hàm `calculateHash` sử dụng Web Crypto API để tính SHA-256 ở client-side
  - `[ ]` Nâng cấp hàm `handleLocalImages` để băm file song song trước khi xử lý
  - `[ ]` Thay thế logic kiểm tra trùng lặp trong cache và DB bằng mã hash với độ phức tạp $O(1)$
  - `[ ]` Cải tiến hàm kiểm tra ảnh ở bước Preview (Hybrid Resolution):
    - `[ ]` Tự động nhận diện ảnh thô nếu là duy nhất trong DB
    - `[ ]` Hiển thị cảnh báo màu vàng yêu cầu can thiệp bằng chọn file nếu phát hiện xung đột trùng tên khác hash trong DB

- `[ ]` 4. Phát triển Công cụ hỗ trợ soạn Excel (`initial-data/page.tsx`)
  - `[ ]` Viết hàm `calculateHash` client-side cho `ImageLinkTester`
  - `[ ]` Thiết kế và bổ sung nút bấm **Chọn thư mục ảnh** (hỗ trợ kéo thả/chọn cả folder bằng `webkitdirectory`)
  - `[ ]` Triển khai logic xử lý ảnh hàng loạt (băm, check trùng Firestore, upload WebP và tối ưu ảnh mới)
  - `[ ]` Render bảng danh sách ảnh đã xử lý trực quan gồm: Thumbnail, Tên file, Trạng thái (Upload mới / Dùng lại), URL thật
  - `[ ]` Xây dựng chức năng **Copy tên file** một chạm và **Copy URL** một chạm cho từng ảnh trong danh sách

- `[ ]` 5. Kiểm tra chất lượng và nghiệm thu
  - `[ ]` Chạy kiểm tra kiểu dữ liệu `pnpm typecheck` để đảm bảo 0 lỗi biên dịch
  - `[ ]` Thực hiện test thủ công luồng upload ảnh trùng tên/khác hình và tự động map
  - `[ ]` Test thủ công tính năng chọn thư mục ảnh hàng loạt và copy tên file dán vào Excel
  - `[ ]` Tạo báo cáo nghiệm thu (`walkthrough_excel_import_image_hash_dedup_20260626.md`) và chuyển trạng thái kế hoạch thành `completed` trong `manifest.json`
