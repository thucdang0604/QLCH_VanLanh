# Kế hoạch Nâng cấp Xem trước Ảnh Kích thước lớn trong Excel Importer

## Giới thiệu & Bối cảnh
Trong quá trình phát triển tính năng **Kiểm tra hình ảnh trước khi đưa vào Excel**, phần giao diện hiển thị danh sách tệp cục bộ (khi người dùng chọn thư mục ảnh) đã bị khuyết một phần mã nguồn ở cuối bảng (lỗi cú pháp làm mất các thẻ đóng `<td>`, `<tr>`, `</tbody>`, `</table>`, `div`). Đồng thời, khu vực cột bên phải (chiếm 1/3 chiều rộng grid trên màn hình lớn) đang được để trống.

Mục tiêu của kế hoạch này là:
1. **Sửa lỗi cú pháp & khôi phục trạng thái bảng**: Hoàn thiện các cột còn thiếu trong bảng danh sách tệp cục bộ bao gồm:
   - Cột **Trạng thái**: Hiển thị badge trực quan sinh động (Đang upload với Spinner, Đã upload mới, Dùng lại ảnh cũ, Lỗi upload, Chưa upload).
   - Cột **Đường dẫn URL thật**: Hiển thị nút bấm `Upload & Lấy URL` hoặc đường dẫn đã upload kèm nút copy tiện lợi.
2. **Thiết kế & Tích hợp cột xem trước ảnh kích thước lớn ở bên phải**:
   - Khi chọn một ảnh từ bảng bên trái (sử dụng dòng active hàng `selectedImageIndex`), hiển thị một card xem trước ảnh kích thước lớn ở cột bên phải.
   - Thêm thông tin chi tiết cao cấp: Tên tệp tin, Dung lượng tệp (tính bằng KB/MB trực tiếp từ file object), Định dạng tệp, Trạng thái đồng bộ chi tiết.
   - Bổ sung các phím tắt hành động nhanh: Copy tên file, Copy URL thật (nếu đã upload), Mở ảnh trong tab mới, và Upload ảnh.
   - Nếu chưa chọn ảnh hoặc danh sách rỗng, hiển thị một placeholder với hình minh họa hướng dẫn người dùng trực quan.

---

## Các thay đổi đề xuất

### 1. Phục hồi và hoàn thiện Table Rows trong `ImageLinkTester`
Chúng ta sẽ hoàn chỉnh phần logic render của bảng danh sách ảnh cục bộ trong file [page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/initial-data/page.tsx).

Cụ thể, phần code bị cắt cụt từ line 576 sẽ được viết lại để bổ sung đầy đủ:
* Cột trạng thái đồng bộ hóa (Chưa upload, Đang upload, Dùng lại ảnh cũ, Đã upload mới).
* Cột hiển thị URL thật và nút Upload & Lấy URL.
* Đóng các thẻ `<td>`, `<tr>`, `</tbody>`, `</table>`, `div` một cách chuẩn xác.

### 2. Thiết kế cột xem trước hình ảnh lớn (Right Column Preview)
Trong grid layout 3 cột (`grid-cols-1 lg:grid-cols-3`):
* Cột trái (`lg:col-span-2`): Bảng danh sách ảnh cục bộ.
* Cột phải (`lg:col-span-1`): Card xem trước ảnh lớn (`Large Preview Card`).

#### Giao diện Large Preview Card:
* **Khi có ảnh được chọn (`activeImg` khác null)**:
  - Khung ảnh lớn với hiệu ứng shadow, viền bo góc tròn, và nền caro (grid pattern) chống trôi màu ảnh trong suốt (transparent png).
  - Chiều cao khung ảnh lớn được tối ưu (`h-64` đến `h-72` hoặc `aspect-video/aspect-square` có `object-contain` để không bị méo).
  - Các thông số chi tiết của tệp:
    - **Tên tệp**: Tên gốc hiển thị đầy đủ (chữ nhỏ, font mono, có thể bọc trong tooltip/title).
    - **Dung lượng**: Định dạng thân thiện từ `activeImg.file?.size` (ví dụ: `154.2 KB` hoặc `1.2 MB`).
    - **Định dạng**: `image/png`, `image/jpeg`, `image/webp`...
    - **Trạng thái**: Diễn giải chi tiết bằng Tiếng Việt (ví dụ: "Ảnh này chưa được tải lên hệ thống. Hãy copy tên file này dán vào Excel hoặc bấm Upload để lấy link thật.").
  - Các nút hành động nhanh:
    - **Copy Tên File**: Sao chép tên thô.
    - **Upload & Copy URL / Copy URL**: Nút bấm chính tùy thuộc vào trạng thái upload của ảnh.
    - **Xem ảnh gốc**: Mở URL ảnh thật trong tab mới (chỉ hiện khi đã upload thành công).
* **Khi chưa chọn ảnh hoặc danh sách trống**:
  - Hiển thị khung placeholder tinh tế với icon `ImageIcon` lớn màu xám nhạt, kèm hướng dẫn: *"Chọn một ảnh trong danh sách bên trái để xem trước kích thước lớn và kiểm tra chi tiết tệp."*

---

## File cần chỉnh sửa

### [MODIFY] [page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/initial-data/page.tsx)
* Sửa đổi cấu trúc render bên trong phần `processedImages.length > 0` từ dòng 526 trở đi để đóng bảng, hoàn thành các cột bị khuyết và render thêm cột bên phải.
* Đảm bảo tính toàn vẹn của mã nguồn, giữ nguyên các logic hooks, hàm upload và tìm kiếm đã được tối ưu hóa trước đó.

---

## Kế hoạch Xác minh & Kiểm thử

### Kiểm thử thủ công
1. **Kiểm tra biên dịch**: Chạy dự án ở chế độ phát triển để xác nhận không còn lỗi cú pháp Next.js/React.
2. **Kiểm tra tính năng chọn thư mục**: Bấm vào nút "Chọn thư mục ảnh", chọn một thư mục có nhiều ảnh.
3. **Kiểm tra danh sách**: Xem danh sách ảnh hiển thị có đầy đủ thumbnail, tên file thô, trạng thái "Chưa upload", và nút "Upload & Lấy URL".
4. **Kiểm tra xem trước ảnh lớn**:
   - Bấm vào một dòng bất kỳ trong danh sách. Xác nhận ảnh lớn hiển thị rõ ràng ở cột bên phải.
   - Kiểm tra xem các thông số (dung lượng file, định dạng, tên tệp) hiển thị chính xác.
   - Bấm chọn các dòng khác nhau để đảm bảo ảnh preview lớn thay đổi tương ứng.
5. **Kiểm tra nút bấm & upload**:
   - Bấm nút "Copy tên file" ở cột xem trước lớn hoặc trên dòng bảng. Kiểm tra clipboard.
   - Bấm nút "Upload & Lấy URL" ở cột xem trước lớn hoặc trên dòng bảng. Xác nhận trạng thái chuyển sang "Đang upload...", sau đó thành "Đã upload mới" hoặc "Dùng lại".
   - Xác nhận URL thật được hiển thị và tự động copy vào clipboard.
   - Bấm nút "Xem ảnh gốc" để mở tab mới kiểm tra URL thật.
