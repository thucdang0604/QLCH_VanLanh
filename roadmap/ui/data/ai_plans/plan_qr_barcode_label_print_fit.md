# Plan: QR/Barcode Label Print Fit Optimization

**ID**: `plan-qr-barcode-label-print-fit`
**Date**: 07.06.2026
**Status**: implemented-local

## Goal

Tối ưu lại luồng in tem QR và barcode cho sản phẩm/phụ kiện/linh kiện vì bản hiện tại có QR + barcode + tên + giá cố định, khi in trên giấy tem nhỏ thực tế dễ bị tràn mép hoặc không nằm gọn trong nhãn.

## Scope

- `src/components/admin/ProductQrLabelModal.tsx`
- `roadmap/ui/data/ai_plans/plan_qr_barcode_label_print_fit.md`
- `roadmap/ui/data/ai_plans/task_qr_barcode_label_print_fit.md`
- `roadmap/ui/data/ai_plans/walkthrough_qr_barcode_label_print_fit.md`
- `roadmap/ui/data/manifest.json`
- `roadmap/ai/dashboard.md`
- `roadmap/ai/modules/pos-orders.md`
- `roadmap/ui/data/source_intelligence.json`

## Current Problem

- Preset nhỏ nhất trước đây bắt đầu từ `40x30 mm`; nhiều giấy tem đang dùng thực tế có thể thấp hơn hoặc cần vùng an toàn.
- Tem luôn in tên và giá, làm layout QR + `CODE128` không còn đủ chiều cao trên giấy nhỏ.
- Không có custom size để nhập đúng khổ tem đang có.
- Không có nút co nội dung hoặc lề an toàn để bù sai số driver/printer/hardware margin.
- Giấy thực tế có dạng 2 tem nằm ngang trên cùng một hàng, nhưng print CSS cũ xử lý như 1 tem đơn mỗi dòng.
- Barcode `CODE128` dùng mã đầy đủ dạng `SP-XXXXXXXX` quá dài so với tem nhỏ, làm vạch bị nén và máy quét khó đọc.

## Design

### 1. Preset giấy nhỏ hơn

- Thêm `30x20 mm`, `40x20 mm`, và `40x25 mm`.
- Đổi default từ `50x30 mm` sang `40x25 mm` để ưu tiên fit hơn cho tem nhỏ.

### 2. Custom paper size

- Cho phép nhập rộng/cao tem bằng mm.
- Clamp kích thước vào ngưỡng vận hành hợp lý: rộng `20-100 mm`, cao `12-80 mm`.
- QR và barcode tự tính kích thước theo chiều thấp hơn của tem custom.

### 3. Text density

- Luôn in tên cửa hàng ở dòng đầu tem để nhận diện thương hiệu, lấy từ `ConfigContext.siteName` và fallback `Văn Lành Service`.
- `Tên ngắn`: chỉ giữ tên, bỏ giá để fit tem nhỏ.
- `Chỉ mã`: bỏ tên/giá; với QR-only thì in thêm mã text nhỏ, với barcode thì barcode đã hiển thị mã.
- `Tên + giá`: giữ nội dung đầy đủ cho giấy đủ lớn.

### 4. Print fit controls

- `Co nội dung` từ `70-100%` để giảm kích thước QR/barcode/text khi giấy thực tế hụt.
- `Lề an toàn` từ `0-3 mm` để thu vùng in vào trong nhãn, tránh tràn mép do driver hoặc máy in không borderless.
- CSS print tính lại width/height nhãn từ khổ giấy trừ lề an toàn.

### 5. Two-up label stock

- Thêm `Bố cục giấy`: `1 tem/dòng` hoặc `2 tem/dòng`.
- Mặc định dùng `2 tem/dòng` vì giấy thực tế trong ảnh có hai tem nằm ngang trên cùng một hàng.
- Khi chọn `2 tem/dòng`, ô số lượng được hiểu là `Số hàng tem`; nhập `1` sẽ in đủ 2 tem giống nhau trên cùng một hàng.
- Thêm `Khe giữa tem` theo mm để khớp khoảng cách vật lý giữa hai tem.
- Khi in 2 tem/dòng, mỗi nhãn vẫn dùng kích thước từng ô tem; page width được tính bằng `rộng mỗi tem * 2 + khe giữa tem`.

### 6. Compact barcode payload

- QR vẫn dùng mã đầy đủ `SP-XXXXXXXX` để giữ định danh rõ ràng.
- Barcode mặc định dùng mã ngắn không prefix/gạch ngang, ví dụ `SP-1KGMMMI0` -> `1KGMMMI0`, giúp `CODE128` ít vạch hơn và dễ scan trên tem nhỏ.
- POS scan candidates bổ sung compact barcode alias qua `getCompactProductBarcode`, nên máy quét đọc mã ngắn vẫn tìm được sản phẩm.
- Admin vẫn có thể chọn barcode đầy đủ nếu giấy lớn hoặc scanner yêu cầu mã đầy đủ.

## Guardrails

- QR vẫn dùng mã sản phẩm chính từ `getPrimaryProductCode`.
- Barcode nhỏ có thể dùng alias rút gọn từ mã chính; alias này chỉ dùng để in/scan, không thay schema hoặc registry.
- Không thay đổi schema sản phẩm, `product_code_registry`, POS scan, hoặc logic checkout.
- Không đưa PII vào tem.
- Tên cửa hàng là brand text tĩnh từ cấu hình site, không phải dữ liệu khách hàng.
- Chỉ tối ưu rendering/printing trong browser; không thêm dependency mới.

## Verification

### Automated

- `.\node_modules\.bin\eslint.CMD src/components/admin/ProductQrLabelModal.tsx`
- `.\node_modules\.bin\tsc.CMD --noEmit`
- JSON parse cho `roadmap/ui/data/manifest.json` và `roadmap/ui/data/source_intelligence.json`
- `git diff --check`

### Manual

- Mở `/admin/products` hoặc `/admin/parts`, bấm in tem.
- Test preset `30x20`, `40x20`, `40x25`, `40x30`, và `Tự nhập khổ tem`.
- Với giấy nhỏ, ưu tiên `Barcode ngắn`, `QR + Barcode` + `Chỉ mã` hoặc `Tên ngắn`, giảm scale về `80-88%`, tăng lề an toàn nếu bị cắt mép.
- Với giấy 2 tem ngang, chọn `2 tem/dòng` và chỉnh `Khe giữa tem` đến khi hai tem khớp đúng cột giấy.
- In thử đúng máy/giấy đang có, sau đó scan bằng máy quét bàn phím và camera POS.
