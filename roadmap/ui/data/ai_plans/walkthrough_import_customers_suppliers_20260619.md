# Walkthrough Import Customers & Suppliers: Khởi tạo danh sách khách hàng và nhà cung cấp từ Excel

## Thay đổi đã thực hiện (Changes Made)

### 1. File Template & Hàng mẫu Excel
- Thêm cấu hình mẫu dữ liệu và hướng dẫn cột cho Khách hàng (CRM) và Nhà cung cấp trong [excelImportTemplateFixtures.ts](file:///m:/QLCH_VanLanh/src/components/admin/excelImportTemplateFixtures.ts).
- Khắc phục lỗi cú pháp TypeScript liên quan đến các key có chứa dấu cách.

### 2. Tầng hỗ trợ Import Excel
- Cập nhật [importSupport.ts](file:///m:/QLCH_VanLanh/src/features/excel-import/importSupport.ts) để hỗ trợ hai chế độ mới: `customer` và `supplier`.
- Triển khai hàm `getPreviewCheckKeys` động để trả về các cột xem trước tương ứng cho từng loại dữ liệu.
- Định nghĩa logic chuẩn hóa SĐT của Khách hàng làm Document ID và kiểm tra trùng tên Nhà cung cấp không phân biệt hoa thường.
- Hỗ trợ nhập công nợ âm (Signed Debt) thông qua hàm `parseDebtInput` và `getSignedNumber`.

### 3. Giao diện Modal Preview & Logic Ghi DB
- Cập nhật [ExcelImportModal.tsx](file:///m:/QLCH_VanLanh/src/components/admin/ExcelImportModal.tsx) tích hợp các kiểm tra hợp lệ định dạng số điện thoại, email, và kiểm tra trùng lặp trên Firestore.
- Triển khai chức năng import an toàn sử dụng Firestore transaction:
  - Khách hàng: Tạo document trong collection `customers` với ID là SĐT đã chuẩn hóa.
  - Nhà cung cấp: Tạo document trong collection `suppliers` với ID tự động.
  - Công nợ & Lịch sử: Nếu đối tác có công nợ đầu kỳ phi zero, ghi nhận tương ứng vào root collection `customer_transactions` (với type `DEBT` nếu >0, `PAYMENT` nếu <0) hoặc `supplier_transactions` (với type `IMPORT` nếu >0, `PAYMENT` nếu <0).

### 4. Giao diện danh sách Khách hàng & Nhà cung cấp
- Cập nhật trang danh sách Khách hàng [page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/customers/page.tsx) và drawer chi tiết [CustomerDetailDrawer.tsx](file:///m:/QLCH_VanLanh/src/components/admin/customers/CustomerDetailDrawer.tsx) hiển thị công nợ âm dưới dạng `"Dư: [số tiền]"` màu xanh lá.
- Cập nhật trang danh sách Nhà cung cấp [page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/suppliers/page.tsx) hiển thị công nợ âm tương tự.
- Cập nhật trang khởi tạo dữ liệu [page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/initial-data/page.tsx): thêm 2 lựa chọn mới cho Khách hàng & Nhà cung cấp với giao diện grid 3 cột cân đối.

## Xác minh (Verification Plan)

### Automated Verification
- Đảm bảo toàn bộ mã nguồn Next.js biên dịch thành công không có lỗi typecheck hay lints.

### Manual Verification
1. Truy cập vào trang quản lý: `/admin/initial-data`.
2. Tải template Excel mẫu cho cả Khách hàng và Nhà cung cấp.
3. Nhập một vài hàng dữ liệu thử nghiệm, bao gồm trường hợp công nợ âm (ví dụ `-1,500,000` hoặc `-2,000,000`).
4. Kéo thả file Excel vào UI, kiểm tra tính năng preview, kiểm tra báo lỗi trùng SĐT hoặc trùng tên NCC.
5. Tiến hành Import và kiểm tra dữ liệu hiển thị trên trang `/admin/customers` và `/admin/suppliers`.
