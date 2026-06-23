# Plan: Khắc phục Treo đơn POS, Ghi nhận Công nợ & Chuẩn hóa Ledger

**ID:** `plan-pos-debt-reconcile-20260623`  
**Ngày lập:** 23.06.2026  
**Trạng thái:** Đang chờ duyệt (Pending Approval)  
**Phạm vi tác động:** `src/app/api/pos/checkout/route.ts`, `src/app/api/orders/transition/route.ts`, `customers/{phone}`, `customer_ledger`  

---

## 1. Giải pháp Thiết kế Chi tiết

### A. POS Checkout API (`src/app/api/pos/checkout/route.ts`)
1.  **Huỷ bỏ treo đơn Pending:** Đơn hàng phát sinh từ POS (`source === 'pos'`) phải luôn luôn có trạng thái `status: 'Completed'` (Hoàn thành) và trừ kho thực tế (`stock` giảm, không giữ `held`), không tự động chuyển thành `Pending` khi thu thiếu tiền.
2.  **Công thức tính toán dòng tiền & nợ mới:**
    *   Tổng tiền đơn hàng mới: `serverTotal`.
    *   Số tiền thực tế thủ ngân thu tại quầy: `deposit_amount`.
    *   Khoản nợ mới phát sinh: `newDebt = Math.max(0, serverTotal - deposit_amount)`.
    *   Khoản tiền thừa khả dụng: `surplus = Math.max(0, deposit_amount - serverTotal)`.
3.  **Tích hợp cấn trừ nợ cũ bằng tiền thừa:**
    *   Nếu có cấn nợ bằng tiền thừa (`use_surplus_to_pay_debt === true`) và khách hàng có nợ cũ (`totalDebt > 0`):
        *   Số tiền cấn nợ thực tế: `debtPaymentAmount = Math.min(surplus, totalDebt)`.
    *   Biến động công nợ ròng của khách hàng: `deltaDebt = newDebt - debtPaymentAmount`.
4.  **Cập nhật công nợ trên database (`customers/{phone}`):**
    *   Tăng/giảm nợ ròng của khách hàng bằng transaction: `totalDebt: FieldValue.increment(deltaDebt)`.
5.  **Chuẩn hóa Sổ nợ (`customer_ledger`):**
    *   Ghi nhận dòng mua hàng mới: `type: 'purchase_order'`, `amount: serverTotal`.
    *   Ghi nhận dòng khách trả tiền tại quầy (đối ứng): `type: 'purchase_payment'`, `amount: deposit_amount` (chỉ ghi khi `deposit_amount > 0`).
    *   Nếu có cấn nợ cũ bằng tiền thừa (`debtPaymentAmount > 0`): Ghi nhận dòng thu nợ cũ: `type: 'debt_payment'`, `amount: debtPaymentAmount`.
6.  **Đồng bộ doanh thu tổng hợp:**
    *   Nếu có cấn nợ cũ (`debtPaymentAmount > 0`), cộng thêm khoản này vào doanh thu thực thu: `incrementRevenueAggregates(tx, db, { orderRevenue: debtPaymentAmount })`.

### B. Order Transition API (`src/app/api/orders/transition/route.ts`)
1.  **Cập nhật công nợ khi duyệt đơn:**
    *   Khi đơn hàng chuyển sang trạng thái `'Completed'`:
        *   Nếu đơn hàng là đơn ghi nợ (`paymentStatus === 'debt'` hoặc `payment_method === 'Debt'`):
            *   Khoản nợ thực tế: `debtAmount = Math.max(0, grandTotal - (freshOrder.deposit_amount || 0))`.
            *   Cộng nợ vào tài khoản khách hàng: `totalDebt: FieldValue.increment(debtAmount)`.
            *   Nếu khách đã trả trước một phần (`deposit_amount > 0`), ghi nhận dòng ledger đối ứng: `type: 'purchase_payment'`, `amount: deposit_amount` để cấn trừ vào dòng `purchase_order`.
2.  **Hoàn nợ khi huỷ đơn hàng:**
    *   Khi đơn hàng chuyển sang trạng thái `'Cancelled'` từ trạng thái `'Completed'`:
        *   Trừ công nợ tương ứng đã cộng trước đó: `totalDebt: FieldValue.increment(-debtAmount)`.

---

## 2. Kế hoạch Kiểm thử (Verification Plan)
1.  **Kiểm thử POS Checkout:**
    *   **Kịch bản 1 (Thanh toán đủ):** Đơn hàng 500k, khách trả 500k. Kết quả: Đơn `Completed`, công nợ khách không đổi, ledger ghi nhận 1 dòng mua 500k, 1 dòng trả 500k.
    *   **Kịch bản 2 (Trả thiếu/Ghi nợ):** Đơn hàng 1M, khách trả 800k. Kết quả: Đơn `Completed`, công nợ khách hàng tăng 200k, ledger ghi nhận dòng mua 1M, dòng trả 800k.
    *   **Kịch bản 3 (Trả dư + Cấn nợ cũ):** Khách đang nợ 150k. Mua đơn hàng mới 300k, khách đưa 500k. Chọn cấn nợ. Kết quả: Đơn `Completed` trả đủ, nợ cũ của khách giảm 150k (còn nợ 0đ), thối lại khách 50k thực tế. Doanh thu ghi nhận thực thu tăng thêm 150k.
2.  **Kiểm thử Duyệt đơn hàng Web:**
    *   Duyệt một đơn hàng ghi nợ sang `Completed`. Xác nhận `totalDebt` của khách hàng tăng chính xác bằng số tiền nợ còn lại của đơn hàng.
