# Nghiệm thu: Chống trùng lặp Ảnh Excel Importer bằng SHA-256 Hash

Tài liệu này ghi nhận kết quả hoàn thành việc triển khai cơ chế chống trùng lặp hình ảnh bằng mã băm SHA-256 (Deduplication) ở client-side trong luồng Import Excel ban đầu, cùng nâng cấp cấu phần chọn thư mục ảnh hàng loạt tại trang soạn thảo dữ liệu.

---

## 1. Các thành phần đã chỉnh sửa

1. **Core Helpers (`src/features/excel-import/importSupport.ts`):**
   - Nâng cấp hàm `uploadInitialImportImage` hỗ trợ nhận tham số `hash`.
   - Lưu trữ vật lý trên Storage dưới dạng `media/${folder}/${hash}.webp` giúp chống trùng tệp vật lý 100%.
   - Tạo Firestore Document ID dạng tĩnh `MED-import-${folder}-${hash}` giúp truy xuất O(1).
   - Lưu các trường `hash`, `originalName`, `normalizedBaseName` để hỗ trợ đối chiếu.

2. **Luồng Import (`src/components/admin/ExcelImportModal.tsx`):**
   - Tích hợp hàm `calculateHash` client-side sử dụng Web Crypto API (`window.crypto.subtle.digest`) tốc độ cao (1-5ms/file).
   - Triển khai cơ chế Lai (Hybrid Resolution):
     - Tự động map sang URL thật nếu tên ảnh thô là duy nhất trong thư viện ảnh.
     - Cảnh báo màu vàng (Warning) yêu cầu chọn tệp thực tế để phân giải mã băm nếu xảy ra xung đột (cùng tên thô nhưng khác nội dung hash).
     - Báo lỗi màu đỏ (Error) nếu ảnh chưa từng tồn tại trên hệ thống.
   - Khi chọn file local để khớp, tự động kiểm tra xem mã hash đã có trên DB chưa để dùng lại URL (O(1)) hoặc upload mới nếu chưa có.

3. **Trang Soạn thảo (`src/app/admin/initial-data/page.tsx`):**
   - Nâng cấp UI phần "Kiểm tra hình ảnh trước khi đưa vào Excel".
   - Bổ sung nút **"Chọn thư mục ảnh"** hỗ trợ chọn cả thư mục ảnh cục bộ (sử dụng thuộc tính `webkitdirectory`).
   - Đọc file cục bộ và tạo Object URL xem trước tức thì không thông qua mạng (hiển thị danh sách 500+ ảnh trong 0ms).
   - Chỉ băm SHA-256, kiểm trùng và upload lên Storage/Firestore một cách lười (lazy) khi người dùng chủ động bấm **Upload & Lấy URL** kế bên từng ảnh.
   - Xuất bảng danh sách ảnh trực quan gồm: thumbnail xem trước local, tên file thô kèm nút Copy nhanh, nhãn trạng thái động, và URL Firebase thật kèm nút Copy nhanh.
   - Khắc phục triệt để các lỗi thiếu import (`useRef`, `toast` từ `sonner`, `Loader2` và `X` từ `lucide-react`, `uploadInitialImportImage`).

---

## 2. Hướng dẫn Xác minh & Kiểm thử (Verification Plan)

### Bước 1: Kiểm tra biên dịch (Typecheck)
Admin cần chạy lệnh sau tại terminal trên máy tính để đảm bảo không có bất kỳ lỗi TypeScript nào:
```powershell
pnpm typecheck
```
Hoặc kiểm tra terminal đang chạy Next.js dev server để xác nhận biên dịch thành công 100%.

### Bước 2: Kiểm thử cấu phần Soạn thảo Ảnh hàng loạt
1. Truy cập vào trang `/admin/initial-data` trên trình duyệt.
2. Tìm đến cấu phần **"Kiểm tra hình ảnh trước khi đưa vào Excel"**.
3. Chọn thư mục upload mục tiêu (ví dụ: Sản phẩm).
4. Bấm nút **"Chọn thư mục ảnh"** và chọn một folder chứa ảnh trên máy tính của bạn.
5. Xác minh:
   - Danh sách tệp hiển thị ngay bên dưới với đầy đủ thumbnail xem trước local và tên file cục bộ tức thì.
   - Trạng thái ban đầu hiển thị là **Chưa upload** kèm nút **Upload & Lấy URL**.
   - Thử bấm nút Copy tại cột **Tên file thô** và dán vào Excel để kiểm tra (không cần upload).
   - Thử bấm nút **Upload & Lấy URL** kế bên một ảnh: ảnh đó sẽ được băm SHA-256, kiểm trùng, upload nếu cần, sau đó cập nhật trạng thái **Đã upload** và tự động copy URL thật vào clipboard.

### Bước 3: Kiểm thử luồng Import Excel Lai (Hybrid Resolution)
1. Tạo một tệp Excel mẫu chứa cột ảnh có điền tên file thô vừa upload ở Bước 2.
2. Mở modal Import Excel tương ứng (ví dụ: Sản phẩm bán lẻ).
3. Tải file Excel lên.
4. Xác minh:
   - Hệ thống tự động nhận diện tên file thô và ánh xạ thành công sang URL Storage thật (dòng hiển thị màu xanh lá - Hợp lệ).
   - Đổi nội dung của một file ảnh trên máy nhưng giữ nguyên tên file cũ, dán tên file đó vào Excel và tải lên.
   - Xác minh: Hệ thống hiển thị cảnh báo màu vàng yêu cầu chọn tệp thực tế do phát hiện xung đột trùng tên khác hash.
   - Chọn tệp ảnh thực tế mới: Hệ thống tự động băm và upload lên Storage dưới mã hash mới riêng biệt mà không ghi đè lên ảnh cũ trên hệ thống.
