# Plan Import Customers & Suppliers: Khởi tạo danh sách khách hàng và nhà cung cấp

## User Review Required

> [!IMPORTANT]
> 1. **Dữ liệu trùng lặp (Duplicate Detection)**:
>    - Đối với **Khách hàng**: SĐT (phone) sẽ được chuẩn hóa thành chuỗi số và dùng làm Document ID. Nếu SĐT đã tồn tại trên Firestore hoặc trùng lặp trong file Excel, hệ thống sẽ báo lỗi chặn (error).
>    - Đối với **Nhà cung cấp**: Kiểm tra trùng tên nhà cung cấp (Name - case-insensitive) vì đây là trường duy nhất dùng để đối chiếu trong dropdown. Nếu trùng tên trong database hoặc file Excel, hệ thống sẽ báo lỗi chặn (error).
> 2. **Xử lý công nợ hai chiều (Signed/Mutual Debt)**:
>    - Hệ thống cho phép **Công nợ đầu kỳ âm (Negative Debt)**:
>      - Cửa hàng nợ đối tác: số dương (`totalDebt > 0`).
>      - Đối tác nợ cửa hàng (trả trước, hoàn tiền, cọc dư): số âm (`totalDebt < 0`).
>    - Ở tầng Excel Importer: Dùng hàm `getSignedNumber` và `parseDebtInput` để giữ nguyên dấu của công nợ (dương hoặc âm) thay vì ép về `>= 0`.
>    - Ở tầng UI quản trị:
>      - Khách hàng: Cập nhật `customers/page.tsx` hiển thị SĐT có công nợ âm là `"Dư: [số tiền]"` (màu xanh lá) thay vì chỉ hiển thị `"Không có nợ"`.
>      - Nhà cung cấp: Cập nhật `suppliers/page.tsx` hiển thị công nợ âm là `"Dư: [số tiền]"` (màu xanh lá) thay vì `"Hết nợ"`.
> 3. **Giao dịch đầu kỳ (Initial Transaction Logs)**:
>    - Nếu `totalDebt > 0`, hệ thống tự động ghi log nợ `DEBT` (Khách hàng) hoặc `IMPORT` (Nhà cung cấp).
>    - Nếu `totalDebt < 0`, hệ thống tự động ghi log trả trước/hoàn tiền `PAYMENT` (Khách hàng) hoặc `PAYMENT` (Nhà cung cấp) với giá trị tuyệt đối tương ứng để đảm bảo lịch sử giao dịch khớp với số dư.

## Proposed Changes

### [Excel Import Support Layer]

#### [MODIFY] [importSupport.ts](file:///m:/QLCH_VanLanh/src/features/excel-import/importSupport.ts)
- Bổ sung `customer` và `supplier` vào `ExcelImportMode` type.
- Mở rộng `MODE_CONFIG` để bổ sung cấu hình cho `customer` và `supplier`.
  - Cấu hình template headers, required headers, sheet name và collection name (`customers` và `suppliers`).
- Cập nhật hàm `getPreviewCheckKeys` (hoặc sửa đổi `PREVIEW_CHECK_KEYS`) để trả về danh sách các trường kiểm tra phù hợp theo từng mode:
  - Khách hàng: `['name', 'phone', 'type', 'email', 'stats', 'debt', 'details']`
  - Nhà cung cấp: `['name', 'phone', 'contact', 'email', 'bank', 'terms', 'debt', 'details']`
- Cập nhật hàm `resolveTargetDocId` để trả về SĐT đã chuẩn hóa cho mode `customer`, và tên chuẩn hóa (hoặc để trống vì dùng auto-ID) cho mode `supplier`.
- Thêm các hàm phụ để tạo template XLSX hướng dẫn nhập dữ liệu chi tiết cho Khách hàng (`sheetName: 'Khach_hang'`) và Nhà cung cấp (`sheetName: 'Nha_cung_cap'`).

#### [MODIFY] [excelImportTemplateFixtures.ts](file:///m:/QLCH_VanLanh/src/components/admin/excelImportTemplateFixtures.ts)
- Bổ sung các mẫu hàng mẫu (mock data rows) cho `customer` và `supplier` trong `EXCEL_IMPORT_PRIMARY_EXAMPLE_ROWS` và `EXCEL_IMPORT_ADDITIONAL_EXAMPLE_ROWS`.

### [Excel Import UI Components]

#### [MODIFY] [ExcelImportModal.tsx](file:///m:/QLCH_VanLanh/src/components/admin/ExcelImportModal.tsx)
- Cập nhật phần import kiểu dữ liệu, các modal hiển thị.
- Định nghĩa hàm xử lý validate dữ liệu cho `customer` và `supplier` trong bước Preview:
  - Kiểm tra tính hợp lệ của số điện thoại, định dạng email, giá trị số của chi tiêu/công nợ.
  - Kiểm tra trùng SĐT (Khách hàng) và trùng Tên NCC (Nhà cung cấp) trong file Excel và trên Firestore database.
- Viết logic thực hiện import hàng loạt (`importCustomerRow` và `importSupplierRow`) sử dụng transactions:
  - `importCustomerRow`: ghi doc `customers/{phone}` và nếu `totalDebt > 0`, ghi thêm doc `customer_transactions`.
  - `importSupplierRow`: ghi doc `suppliers/{autoId}` và nếu `totalDebt > 0`, ghi thêm doc `supplier_transactions`.
- Thay đổi `PREVIEW_CHECK_KEYS` thành gọi dynamic `getPreviewCheckKeys(mode)` để chỉ hiển thị các cột kiểm tra tương ứng với từng kiểu dữ liệu.

#### [MODIFY] [page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/initial-data/page.tsx)
- Bổ sung 2 lựa chọn mới vào danh sách `IMPORT_OPTIONS` cho:
  - Khách hàng (CRM)
  - Nhà cung cấp (Suppliers)
- Bổ sung mô tả cột, class Tailwind CSS styling (accent colors) phù hợp với phong cách của UI cũ.

## Verification Plan

### Automated Tests
- Chạy lệnh linting và build để đảm bảo code Next.js sạch sẽ và không có lỗi kiểu dữ liệu:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`

### Manual Verification
- Truy cập vào trang `/admin/initial-data`.
- Tải file template Excel của Khách hàng và Nhà cung cấp, điền thử dữ liệu.
- Kéo thả file Excel vào Importer, xác minh các lỗi/cảnh báo hiển thị đúng tại bảng Preview (ví dụ: SĐT không hợp lệ, trùng tên NCC, v.v.).
- Nhấp nút "Import" để đẩy dữ liệu lên Firestore.
- Vào trang `/admin/customers` và `/admin/suppliers` để kiểm tra dữ liệu đã hiển thị đầy đủ cùng với lịch sử công nợ đầu kỳ nếu có.
