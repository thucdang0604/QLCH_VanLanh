# Task: POS QR Scanner & Product Codes

## Phase 1 — Product Code Schema

- [x] Thêm helper chuẩn hóa mã hàng tại `src/lib/productCodes.ts`.
- [x] Thêm optional fields `sku`, `barcode`, `productCode` vào `Product`.
- [x] Form tạo/sửa sản phẩm và linh kiện lưu mã hàng, tự sinh từ product id nếu để trống.
- [x] Excel import sản phẩm tạo mã hàng cho dòng import.

## Phase 2 — QR Label UI

- [x] Thêm modal xem/in tem QR dùng chung.
- [x] Trang `/admin/products` hiển thị mã QR và nút in tem.
- [x] Trang `/admin/parts` hiển thị mã QR và nút in tem cho linh kiện.

## Phase 3 — POS Scanner

- [x] POS search thêm khả năng tìm theo mã hàng.
- [x] Máy quét dạng bàn phím match theo `sku`, `barcode`, `productCode`, hoặc id.
- [x] Thêm nút Quét QR mở camera trên POS.
- [x] Camera scanner dùng `BarcodeDetector` và tự thêm sản phẩm vào giỏ.
- [x] Thêm fallback nhập mã tay trong scanner modal.
- [x] POS cho phép hiển thị/quét cả linh kiện còn hàng, không chỉ sản phẩm bán lẻ.

## Phase 4 — Verification

- [x] Chạy ESLint cho các file đã sửa.
- [x] Vá `next.config.mjs`: CSP `img-src` thêm `api.qrserver.com` + `Permissions-Policy` đổi `camera=(self)`.
- [ ] Chạy Next build.
- [ ] Typecheck toàn repo đang bị chặn bởi lỗi hiện hữu ngoài phạm vi POS: `page.client.tsx`, product/service detail, reviews page, `PricingSection`.
- [ ] Kiểm thử thật trên Chrome/Edge HTTPS với camera điện thoại hoặc máy quét QR dạng keyboard.
