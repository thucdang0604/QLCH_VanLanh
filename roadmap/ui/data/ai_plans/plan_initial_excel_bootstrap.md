# Initial Excel Bootstrap: Khởi tạo sản phẩm, phụ kiện, linh kiện và dịch vụ

## Mục tiêu

Tách công cụ import dữ liệu ban đầu khỏi các màn quản trị thường ngày, gom vào một route riêng để admin dùng trong giai đoạn setup.

## Phạm vi

- Tạo trang `/admin/initial-data` chỉ cho admin, không thêm vào sidebar.
- Mở rộng `ExcelImportModal` từ import sản phẩm/dịch vụ thành 4 mode: sản phẩm, phụ kiện, linh kiện, dịch vụ.
- Template Excel có đủ trường vận hành chính: danh mục taxonomy, mã hàng, giá, giá vốn, tồn kho, ảnh URL hoặc đường dẫn local, specs, bảo hành, SEO/tags dịch vụ.
- Sau khi chọn file, hệ thống hiển thị bảng kiểm duyệt tổng hợp theo từng trường trước khi ghi Firestore.
- Trang bootstrap có ô kiểm tra ảnh để admin paste URL hoặc chọn file local xem trước trước khi đưa link vào Excel.
- Import sản phẩm/phụ kiện/linh kiện bằng transaction riêng để ghi `products`, `product_code_registry` và `inventory_logs` cùng lúc.
- Preview kiểm trước ID chuẩn hóa, tên, taxonomy, mã QR/barcode tự sinh hoặc mã nhập tay, ảnh URL/local, giá, tồn kho và các trường đặc thù từng loại.
- Đường dẫn ảnh local trong Excel bị chặn cho đến khi admin chọn file hoặc thư mục ảnh; hệ thống khớp theo tên file, upload WebP lên Storage và thay bằng URL public trước khi import.
- Sản phẩm bán lẻ, phụ kiện, linh kiện và dịch vụ dùng chung quy tắc gallery: `images[]` là toàn bộ ảnh theo thứ tự, `imageUrl = images[0]` là ảnh chính để tương thích list/SEO cũ.
- Admin chỉnh ảnh qua field gallery dùng lại quanh MediaManager hiện có; xóa ảnh khỏi item chỉ xóa URL reference, không xóa file gốc trong thư viện để ảnh có thể tái sử dụng.
- Khi mở MediaManager từ từng ngữ cảnh, upload mặc định vào đúng thư mục Storage/media: sản phẩm-phụ kiện `products`, linh kiện `parts`, dịch vụ `services`.
- Đồng nhất các luồng tạo/nhập mới: sản phẩm, phụ kiện, linh kiện và dịch vụ active phải có `categoryIds` từ taxonomy thật; không dùng fallback giả `san-pham` hoặc `component`.
- Tồn kho ban đầu lớn hơn 0 ghi `inventory_logs` type `IMPORT`.
- Gỡ entry point import cũ ở `/admin/products`; bootstrap chỉ dùng tại `/admin/initial-data`.

## Quyết định

- Ảnh trong Excel nhập bằng URL public, URL đã upload trong media, hoặc đường dẫn file local để resolve ở bước preview; không trích binary image nhúng trong workbook.
- Ảnh local trong Excel phải được admin chọn bằng file picker/thư mục vì trình duyệt không được quyền tự đọc `M:\...`; sau khi chọn, importer upload ảnh qua pipeline resize + convert WebP trước khi ghi dữ liệu.
- Ảnh upload qua MediaManager được resize và convert WebP trước khi lưu Storage; ô kiểm tra ảnh trên trang bootstrap chỉ preview link/file, không upload.
- Không tạo hệ thống media mới; dùng lại `MediaManager` và chuẩn hóa phần gallery ở các modal sản phẩm/linh kiện/dịch vụ.
- MediaManager vẫn cho đổi thư mục thủ công, nhưng gallery field truyền thư mục mặc định theo loại item để ảnh dễ tìm và tái sử dụng sau này.
- Route bootstrap không nằm trong menu admin vì chỉ dùng thời gian đầu.
- Staff bị chặn ngay trong page dù layout admin vẫn bao route.
- Nút import bị khóa nếu còn bất kỳ dòng lỗi nào; warning chỉ nhắc rà soát và không chặn import.
- Query kiểm trùng tên/mã được chia chunk nhỏ để tránh vượt giới hạn Firestore khi file Excel lớn.
- Product, product_code_registry và inventory_logs được ghi trong cùng transaction để tránh tạo hàng mà thiếu log tồn kho.
- Dịch vụ được tạo bằng transaction check tồn tại trước, không dùng setDoc overwrite.
- Entry point import cũ trong trang sản phẩm đã được gỡ để tránh admin dùng nhầm luồng bootstrap trong vận hành hằng ngày.
- Item đề xuất tạm từ KTV/phiếu nhập không được gắn category giả; khi hoàn tất nhập kho phải chọn taxonomy thật trong preview.
- Template workbook update 2026-06-07: mau Excel nay giu sheet du lieu import o tab dau tien, dong thoi bo sung cac sheet Huong_dan, Quy_uoc_cot, Gia_tri_hop_le, Anh_va_Media, Taxonomy_mau va Vi_du_day_du de admin dung du cac tinh nang da lam.
