# Nhật ký Hoàn thành: Xem trước Ảnh Kích thước lớn trong Excel Importer

Chúng ta đã khắc phục hoàn toàn lỗi cú pháp JSX compile error trong `src/app/admin/initial-data/page.tsx` và đồng thời triển khai một bảng điều khiển xem trước hình ảnh lớn cao cấp, nằm trực quan ở phía cột bên phải trống.

## Các hạng mục đã hoàn thành

### 1. Sửa lỗi cú pháp & Hoàn thiện bảng danh sách ảnh cục bộ
- Khép kín chuẩn xác thẻ `<td>` của cột **Tên file thô** và thẻ `<tr>` của hàng.
- Bổ sung cột **Trạng thái**: Hiển thị badge sinh động kèm màu sắc tương ứng:
  - `loading`: Badge xanh dương có biểu tượng Spinner quay đều ("Đang upload").
  - `success`: Badge cam ("Đã upload") hoặc badge xanh lá ("Dùng lại") tùy vào ảnh được upload mới hay dùng lại.
  - `error`: Badge đỏ báo lỗi ("Lỗi upload") có tooltip chi tiết.
  - `idle`: Badge xám chỉ trạng thái chưa đồng bộ ("Chưa upload").
- Bổ sung cột **Đường dẫn URL thật**:
  - Nếu đã upload: Hiển thị URL rút gọn cùng nút sao chép nhanh.
  - Nếu chưa upload: Hiển thị nút bấm nổi bật "Upload & Lấy URL" hỗ trợ upload một chạm và tự động copy vào clipboard.
- Khép kín các thẻ đóng bảng (`</tbody>`, `</table>`, `div`) chính xác 100%.

### 2. Thiết kế cột xem trước hình ảnh lớn bên phải (Large Preview Card)
- Sử dụng layout chia cột thông minh (`lg:col-span-1` trong grid 3 cột) để tận dụng khoảng trống bên phải.
- Khung hiển thị ảnh lớn chất lượng cao:
  - Nền caro (grid pattern) chống trôi màu cho các tệp ảnh PNG trong suốt.
  - Hiệu ứng đổ bóng nâng cao (shadow) và bo góc tròn hài hòa.
  - Chế độ căn chỉnh tỷ lệ bảo toàn ảnh (`object-contain`) tránh méo mó hình ảnh, có hiệu ứng phóng to nhẹ khi hover chuột.
- Hiển thị thông số chi tiết của tệp cục bộ:
  - Tên tệp đầy đủ (Mono font, break-all, có tooltip).
  - Dung lượng tệp tinh tế (tự động quy đổi sang KB từ file object gốc, ví dụ: `154.2 KB`).
  - Định dạng tệp tin (ví dụ: `image/png`).
  - Diễn giải trạng thái đồng bộ chi tiết bằng Tiếng Việt thân thiện.
- Các nút hành động nhanh:
  - **Copy tên file**: Copy tên thô để dán nhanh vào cột tương ứng trong Excel.
  - **Copy URL thật / Upload ảnh**: Phím tắt chính tùy theo trạng thái đồng bộ của ảnh.
  - **Xem ảnh gốc**: Mở đường dẫn ảnh public trong một tab mới để nhân viên kiểm tra độ sắc nét.
- Thiết kế giao diện trạng thái trống (Empty Placeholder) tinh tế với icon ImageIcon lớn khi chưa có dòng nào được chọn.

## Đăng ký trạng thái
Kế hoạch đã được đăng ký và hoàn thành trong sổ đăng ký `manifest.json`. Giao diện hot-reload biên dịch thành công và sẵn sàng để người dùng trải nghiệm thực tế.
