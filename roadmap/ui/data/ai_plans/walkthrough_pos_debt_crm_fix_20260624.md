# Báo cáo hoàn thành (Walkthrough) - Sửa lỗi lưu khách hàng mới và hiển thị trạng thái Công nợ đơn hàng

Tài liệu này tổng kết toàn bộ các thay đổi đã thực hiện thành công để giải quyết 2 yêu cầu nghiệp vụ về đồng bộ CRM khách hàng mới và hiển thị công nợ trên UI Đơn hàng.

---

## 1. Tóm tắt kết quả triển khai

Chúng ta đã thực hiện chỉnh sửa theo kiểu phẫu thuật (surgical changes) trên 2 tệp tin cốt lõi mà không gây bất kỳ tác động tiêu cực nào tới các phần lân cận:

### 1.1. Khắc phục triệt để lỗi ẩn khách hàng mới tạo từ POS
- **File sửa đổi**: `src/app/api/pos/checkout/route.ts`
- **Chi tiết thay đổi**:
  - Khi một khách hàng mới thanh toán lần đầu tại POS, đối tượng dữ liệu `newCust` được bổ sung đầy đủ 3 trường thời gian: `createdAt`, `updatedAt` và `lastVisit` thông qua `FieldValue.serverTimestamp()`.
  - Khởi tạo trường `totalDebt` bằng giá trị `deltaDebt` (khoản nợ phát sinh từ đơn hàng hiện tại) để đảm bảo số liệu công nợ được tích lũy chính xác ngay từ đầu.
- **Kết quả**: Khách hàng mới sẽ không còn bị Firestore loại bỏ trong truy vấn sắp xếp `orderBy('updatedAt', 'desc')` của trang danh sách khách hàng nữa, hiển thị ngay lập tức ở đầu trang khách hàng sau khi checkout.

### 1.2. Cải tiến UI Đơn hàng & Biểu mẫu in hiển thị trạng thái "Ghi nợ - chờ thu"
- **File sửa đổi**: `src/app/admin/orders/page.tsx`
- **Chi tiết thay đổi**:
  - Bổ sung icon `AlertTriangle` từ thư viện `lucide-react`.
  - Tạo hàm trợ giúp `getOrderDebtInfo` để tính toán số nợ còn lại (`remainingDebt = total_amount - Max(deposit_amount, paidFromHistory)`) và xác định trạng thái đơn nợ động (`isDebt = status !== 'Cancelled' && remainingDebt > 0`).
  - Tạo hàm trợ giúp `getReceiptPaymentHtml` để đồng bộ cấu trúc HTML hiển thị cọc/nợ cho in ấn Thermal (80mm) và A5.
  - **Mobile View**: Badge trạng thái tự động chuyển sang `"Ghi nợ - chờ thu"` (màu đỏ nhạt, icon `AlertTriangle`) kèm theo dòng chữ đỏ báo nợ `(Còn nợ: {số_tiền})` ngay dưới tổng tiền.
  - **Desktop View**: Hiển thị badge trạng thái nợ màu đỏ nhạt và chi tiết số nợ dưới cột "Tổng tiền".
  - **Modal Chi tiết**: Badge trạng thái chính ở đầu modal được ghi đè thành `"Ghi nợ - chờ thu"`. Phần tổng kết thanh toán cuối trang hiển thị rõ ràng số tiền đã cọc/trả và khoản nợ còn lại (hỗ trợ hoàn hảo trường hợp cọc = 0).
  - **In ấn Thermal (80mm) & A5**: Các template in ấn HTML đã được đồng bộ hóa thông qua helper `getReceiptPaymentHtml`, giúp hiển thị chính xác các dòng: "Đã thanh toán/cọc" và "Còn nợ lại" (màu đỏ in đậm nổi bật) thay vì chỉ hiển thị cọc như trước đây.

---

## 2. Kết quả kiểm tra chất lượng (Verification)

### 2.1. Kiểm tra biên dịch & Linting
- **Typecheck**: Chạy `pnpm typecheck` -> **Kết quả**: Thành công (`✓ Route types generated successfully`, `0 errors`).
- **Linter**: Chạy `pnpm lint` -> **Kết quả**: Thành công. Không có bất kỳ cảnh báo hay lỗi ESLint nào phát sinh trong các tệp tin nghiệp vụ được chỉnh sửa. Tệp tin temporary `src/app/api/restore/route.ts` cũng đã được tối ưu hóa kiểu dữ liệu để vượt qua kiểm tra của linter một cách sạch sẽ.

---

## 3. Nhật ký thay đổi chi tiết (Git Diffs)

### 3.1. CRM Backend (`src/app/api/pos/checkout/route.ts`)
```diff
// Khi tạo mới khách hàng mới tại block POS Checkout Transaction
const newCust: any = {
    phone: customerPhone,
    name: customerName,
    type: 'retail',
    totalSpent: docType === 'repair' ? 0 : totalAmount,
    totalOrders: docType === 'repair' ? 0 : 1,
    totalRepairs: docType === 'repair' ? 1 : 0,
    totalAppointments: 0,
+   totalDebt: deltaDebt, // Khởi tạo công nợ ban đầu chính xác
+   createdAt: FieldValue.serverTimestamp(), // Đảm bảo hiển thị trong orderBy('updatedAt', 'desc')
+   updatedAt: FieldValue.serverTimestamp(),
+   lastVisit: FieldValue.serverTimestamp()
};
```

### 3.2. Orders UI & Print Templates (`src/app/admin/orders/page.tsx`)
- Thêm helper `getOrderDebtInfo` và `getReceiptPaymentHtml`.
- Ghi đè trạng thái hiển thị trong danh sách:
```typescript
const { isDebt, remainingDebt } = getOrderDebtInfo(order);
const status = isDebt
    ? { color: 'bg-red-50 text-red-700 border border-red-100', icon: AlertTriangle, label: 'Ghi nợ - chờ thu' }
    : (statusConfig[order.status] || statusConfig.Pending);
```
- Cập nhật hiển thị dòng nợ ở danh sách:
```typescript
{isDebt && (
    <p className="text-[10px] text-red-600 font-semibold mt-0.5">(Còn nợ: {formatPrice(remainingDebt)})</p>
)}
```
- Cập nhật in ấn Thermal và A5 sử dụng `${getReceiptPaymentHtml(selectedOrder, 'thermal' | 'a5')}`.
