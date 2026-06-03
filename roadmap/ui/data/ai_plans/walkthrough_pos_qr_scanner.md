# Walkthrough: POS QR Scanner

## Tạo và in tem

1. Vào `/admin/products` hoặc `/admin/parts`.
2. Khi tạo/sửa sản phẩm, điền `Mã SP / QR` hoặc để trống để hệ thống tự sinh.
3. Tại danh sách, bấm nút QR trên dòng sản phẩm.
4. Kiểm tra tem gồm QR, mã hàng, tên và giá; bấm **In tem** để dán lên hàng.

## Bán hàng bằng máy tính

1. Vào `/admin/pos`.
2. Dùng máy quét QR/barcode dạng bàn phím quét tem.
3. POS tự tìm sản phẩm theo `sku`, `barcode`, `productCode`, hoặc id và thêm vào giỏ.
4. Thanh toán vẫn qua `/api/pos/checkout`, server tiếp tục kiểm tra tồn kho khả dụng.

## Bán hàng bằng điện thoại

1. Mở `/admin/pos` trên điện thoại bằng Chrome/Edge.
2. Bấm **Quét QR**.
3. Cho phép quyền camera và đưa tem QR vào khung.
4. POS tự thêm sản phẩm vào giỏ; nhân viên tiếp tục tính tiền cho khách.

## Fallback

Nếu camera không hỗ trợ `BarcodeDetector` hoặc trang không chạy trên HTTPS, nhập mã hàng vào ô mã tay trong modal scanner. Máy quét dạng bàn phím vẫn hoạt động trên desktop.
