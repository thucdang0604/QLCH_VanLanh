# Plan: Cấu hình Mẫu Biên Nhận Bảo Hành

**Status:** completed

Dựa trên yêu cầu và các hình ảnh được cung cấp, bổ sung 3 mẫu biên nhận bảo hành vào trang cài đặt:
1. Phiếu Bảo Hành Thiết Bị
2. Phiếu Bảo Hành Sửa Chữa
3. Phiếu Bảo Hành Phụ Kiện

## 1. Cập nhật cấu trúc dữ liệu (`ReceiptConfig`)

Bổ sung thêm 3 object cấu hình vào interface `ReceiptConfig` trong `src/app/admin/settings/receipt/page.tsx`.
Tạo cấu trúc `WarrantyTemplateConfig` cho phép tùy biến thông tin, và một mảng linh hoạt `tableRows` để thiết lập các dòng quyền lợi bảo hành dựa theo thời gian và dịch vụ.

## 2. Giao diện Cài đặt (Bên trái)

Phân trang form dựa trên tab được chọn:
- `Biên nhận`
- `Hóa đơn`
- `BH Thiết Bị`
- `BH Sửa Chữa`
- `BH Phụ Kiện`

## 3. Giao diện Preview (Bên phải)

Viết thêm 3 template HTML/CSS cho phần xem trước:
- **Header**: Tái sử dụng logo và thông tin công ty từ cấu hình chung. Có phần QR Code tĩnh.
- **Customer Info Block**: Dàn trang theo dạng lưới 2 cột, nét đứt, giống hình ảnh tham khảo.
- **Notes Block**: Hiển thị text theo danh sách `notes`.
- **Table Block**: Hiển thị bảng quyền lợi.
- **Footer Block**: Hiển thị `footerNote`.
