# Tasks: Khắc phục Treo đơn POS, Ghi nhận Công nợ & Chuẩn hóa Ledger

**Plan tương ứng:** `plan_pos_debt_reconcile_20260623.md`  
**Trạng thái:** Đang chờ duyệt (Pending Approval)  

---

## 1. Danh sách công việc triển khai

### Phase 1 - Sửa đổi POS Checkout API
- [ ] Bóc tách biến `use_surplus_to_pay_debt` từ request body trong `src/app/api/pos/checkout/route.ts`.
- [ ] Gỡ bỏ logic tự động gán `isPending = true` khi `deposit_amount < serverTotal` đối với luồng POS bán lẻ (gán cứng `isPending = false`).
- [ ] Viết logic tính toán nợ mới phát sinh (`newDebt`), tiền thừa (`surplus`) và tiền cấn nợ cũ thực tế (`debtPaymentAmount`).
- [ ] Cập nhật transaction ghi nhận biến động nợ ròng `deltaDebt` trực tiếp vào trường `totalDebt` của khách hàng (`customers/{phone}`).
- [ ] Cập nhật transaction ghi nhận đối ứng vào `customer_ledger`:
    - Dòng mua hàng: `type: 'purchase_order'`, `amount: serverTotal`.
    - Dòng thanh toán tại quầy: `type: 'purchase_payment'`, `amount: deposit_amount` (nếu có).
    - Dòng cấn nợ cũ: `type: 'debt_payment'`, `amount: debtPaymentAmount` (nếu có).
- [ ] Cộng dồn `debtPaymentAmount` (nếu có) vào doanh thu thực thu trong Daily & Monthly aggregates.

### Phase 2 - Sửa đổi Order Transition API
- [ ] Cập nhật logic duyệt đơn hàng sang `'Completed'` trong `src/app/api/orders/transition/route.ts`:
    - Nếu là đơn ghi nợ, tính toán số nợ còn lại `debtAmount = grandTotal - deposit_amount` và cộng vào `totalDebt` của khách hàng.
    - Ghi nhận dòng ledger đối ứng thanh toán cọc/trả trước `purchase_payment` nếu `deposit_amount > 0`.
- [ ] Cập nhật logic huỷ đơn hàng `'Cancelled'` khi đơn cũ là `'Completed'`:
    - Trừ bớt công nợ tương ứng đã cộng trước đó khỏi `totalDebt` của khách hàng.

### Phase 3 - Kiểm thử & Đóng gói
- [ ] Kiểm tra lỗi cú pháp bằng `pnpm lint`.
- [ ] Kiểm tra kiểu dữ liệu bằng `pnpm typecheck`.
- [ ] Thực hiện smoke test các kịch bản thanh toán tại POS (trả đủ, trả thiếu/ghi nợ, trả dư + cấn nợ cũ).
- [ ] Thực hiện smoke test duyệt đơn hàng ghi nợ trên trang quản trị orders.
- [ ] Viết walkthrough tổng kết và đóng plan.
