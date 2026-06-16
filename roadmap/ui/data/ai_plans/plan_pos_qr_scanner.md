# Plan: POS QR Scanner & Product Codes

**ID**: `plan-pos-qr-scanner`
**Ngày**: 30.05.2026
**Trạng thái**: implemented-awaiting-device-validation (merged `master`)

## Mục tiêu

Mỗi sản phẩm bán lẻ, phụ kiện và linh kiện có một mã hàng thống nhất để in thành tem QR. Nhân viên có thể bán tại POS bằng máy quét dạng bàn phím trên máy tính hoặc mở camera trên điện thoại để quét QR và tự thêm sản phẩm vào giỏ.

## Quyết định

1. Dùng chung một mã hàng cho `sku`, `barcode`, và `productCode` để tương thích cả QR lẫn máy quét barcode dạng bàn phím.
2. QR chỉ chứa mã hàng, không chứa PII hay dữ liệu đơn hàng.
3. POS match theo `sku`, `barcode`, `productCode`, hoặc Firestore document id để dữ liệu cũ vẫn quét được.
4. Camera scanner dùng Web API `BarcodeDetector`; nếu trình duyệt không hỗ trợ, POS có fallback nhập mã tay và máy quét bàn phím vẫn hoạt động.
5. Tem QR trong admin dùng URL ảnh QR công khai chỉ với payload là mã hàng. Nếu cần chạy offline hoàn toàn, thay bằng thư viện QR nội bộ sau khi package manager ổn định.

## Phạm vi file

- `src/lib/productCodes.ts`
- `src/lib/types.ts`
- `src/components/admin/UniversalProductModal.tsx`
- `src/components/admin/ProductQrLabelModal.tsx`
- `src/app/admin/products/page.tsx`
- `src/app/admin/parts/page.tsx`
- `src/app/admin/pos/page.tsx`
- `src/components/admin/ExcelImportModal.tsx`
- `firebase.json`

## Ràng buộc

- POS checkout vẫn đi qua `/api/pos/checkout`; scanner chỉ thay đổi cách thêm item vào cart, không bỏ qua kiểm tra stock/held server-side.
- Không nới Firestore rules. Việc lưu mã hàng đi theo các quyền quản trị sản phẩm/linh kiện hiện có.
- CSP chỉ mở thêm `img-src https://api.qrserver.com` để render tem QR; QR payload chỉ là mã hàng.
- Không đưa tên hoặc số điện thoại khách hàng vào QR.
