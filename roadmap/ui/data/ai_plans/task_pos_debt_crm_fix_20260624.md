# Danh sách tác vụ sửa lỗi lưu khách hàng mới và hiển thị trạng thái Công nợ đơn hàng

Tài liệu này theo dõi tiến độ thực hiện các bước trong kế hoạch triển khai tính năng hiển thị trạng thái Công nợ đơn hàng và sửa lỗi đồng bộ khách hàng mới tạo từ POS.

---

## Tiến độ chung
- `[x]` **Bước 1: Phân tích & Chuẩn bị kế hoạch**
- `[x]` **Bước 2: Cập nhật Backend POS Checkout (CRM)**
- `[x]` **Bước 3: Cập nhật UI Quản lý Đơn hàng (Mobile, Desktop & Modal Chi tiết)**
- `[x]` **Bước 4: Cập nhật biểu mẫu in hóa đơn (Thermal 80mm & A5)**
- `[x]` **Bước 5: Xác minh chất lượng mã nguồn (Typecheck & Lint)**
- `[x]` **Bước 6: Dọn dẹp tài liệu & Đăng ký registry**

---

## Chi tiết các tác vụ

### 1. Backend POS Checkout (`src/app/api/pos/checkout/route.ts`)
- `[x]` Xác định vị trí ghi khách hàng mới (`newCust`).
- `[x]` Bổ sung các trường thời gian `createdAt`, `updatedAt`, `lastVisit` sử dụng `FieldValue.serverTimestamp()`.
- `[x]` Đồng bộ trường công nợ `totalDebt: deltaDebt` của khách hàng mới khi vừa phát sinh giao dịch nợ.
- `[x]` Kiểm tra code không có lỗi cú pháp.

### 2. UI Đơn hàng (`src/app/admin/orders/page.tsx`)
- `[x]` Import icon `AlertTriangle` từ thư viện `lucide-react`.
- `[x]` Viết hàm trợ giúp `getOrderDebtInfo(order)` để tính toán công nợ thực tế và xác định trạng thái nợ động.
- `[x]` Viết hàm trợ giúp `getReceiptPaymentHtml(order, type)` phục vụ in ấn hóa đơn.
- `[x]` Cập nhật Mobile View:
  - Ghi đè hiển thị badge trạng thái thành `"Ghi nợ - chờ thu"` (màu đỏ nhạt kèm icon `AlertTriangle`) nếu có nợ.
  - Hiển thị dòng chữ đỏ chỉ rõ số tiền còn nợ `(Còn nợ: {số_tiền})` ngay dưới tổng tiền.
- `[x]` Cập nhật Desktop View:
  - Ghi đè hiển thị badge trạng thái tương tự Mobile View.
  - Hiển thị thông tin nợ chi tiết dưới tổng tiền.
- `[x]` Cập nhật Modal Chi tiết đơn hàng:
  - Hiển thị badge trạng thái `"Ghi nợ - chờ thu"` ở phần đầu modal.
  - Thêm dòng tổng kết số tiền đã trả/cọc và số tiền nợ còn lại ở phần tổng tiền cuối trang (hỗ trợ trường hợp cọc = 0).
- `[x]` Cập nhật in ấn Thermal (80mm): Thay thế khối cọc/nợ cũ bằng helper `getReceiptPaymentHtml(selectedOrder, 'thermal')`.
- `[x]` Cập nhật in ấn A5: Thay thế khối cọc/nợ cũ bằng helper `getReceiptPaymentHtml(selectedOrder, 'a5')`.

### 3. Xác minh & Hoàn tất
- `[x]` Chạy kiểm tra TypeScript (`pnpm typecheck`) -> Kết quả: Thành công (0 lỗi).
- `[x]` Chạy kiểm tra ESLint (`pnpm lint`) -> Kết quả: Thành công (không có lỗi trong code nghiệp vụ).
- `[x]` Revert và tối ưu tệp temporary `src/app/api/restore/route.ts` để đảm bảo sạch sẽ và tuân thủ chuẩn kiểu dữ liệu.
- `[x]` Đăng ký các tệp kế hoạch vào `roadmap/ui/data/manifest.json`.
- `[x]` Tạo tệp Walkthrough tổng kết.
- `[ ]` Tiến hành Git commit với tiền tố `antigravity:`.
