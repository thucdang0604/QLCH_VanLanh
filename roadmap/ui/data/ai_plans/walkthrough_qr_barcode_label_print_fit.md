# Walkthrough: QR/Barcode Label Print Fit

**Status**: implemented-local

## Operator Flow

1. Open `/admin/products` or `/admin/parts`.
2. Click the QR action on a product/component row.
3. Confirm the top brand line shows the configured shop name.
4. Choose the closest paper preset:
   - `30 x 20 mm`, `40 x 20 mm`, or `40 x 25 mm` for small labels.
   - `Tự nhập khổ tem` if the real paper does not match any preset.
5. Choose paper layout:
   - `2 tem/dòng` for the two-labels-per-row stock shown in the user's photo.
   - `1 tem/dòng` for single-column label rolls.
   - Adjust `Khe giữa tem` if the second printed label drifts left/right.
   - With `2 tem/dòng`, `Số hàng tem = 1` prints two identical labels on one row.
6. Choose label content:
   - `QR + Barcode` for dual scanner support.
   - `Chỉ QR` for very narrow labels.
   - `Chỉ Barcode` when the target scanner reads `CODE128` reliably.
7. Choose barcode payload:
   - `Ngắn` for small labels; this removes the prefix and dash from the printed barcode.
   - `Đầy đủ` only for larger labels or scanner setups that require the full product code.
8. Choose text density:
   - `Chỉ mã` for the tightest fit.
   - `Tên ngắn` for daily inventory labels.
   - `Tên + giá` only when the paper is tall enough.
9. If the preview or print is clipped, reduce `Co nội dung` and/or increase `Lề an toàn`.
10. Print one test row before printing many copies.

## Recommended Starting Points

- Very small stock: `30 x 20 mm`, barcode `Ngắn`, `QR + Barcode`, `Chỉ mã`, scale `80-88%`, safe margin `0.8-1.2 mm`.
- Two-up small stock: `40 x 25 mm`, `2 tem/dòng`, barcode `Ngắn`, `QR + Barcode`, `Tên ngắn`, scale `88%`, safe margin `0.8 mm`, adjust `Khe giữa tem` from `1.4 mm`.
- Larger stock: `50 x 30 mm`, `QR + Barcode`, `Tên + giá`, scale `90-100%`, safe margin `0-0.8 mm`.

## Verification Record

- Focused ESLint on `src/components/admin/ProductQrLabelModal.tsx`: passed.

## Manual Checks Still Required

- Print against the actual paper stock and printer driver used in the shop.
- Scan the printed QR and `CODE128` barcode with the target POS scanner.
- If alignment still drifts, record the paper width/height, driver paper size, safe margin, and scale that worked.
