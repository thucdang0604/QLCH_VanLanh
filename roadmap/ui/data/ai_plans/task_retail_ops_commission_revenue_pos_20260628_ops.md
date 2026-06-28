# Retail Ops Implementation Tasks - 2026-06-28

## Phase 1 - Safe Existing Flow Fixes

- [x] Add or enforce 16:9 banner guidance/preview in admin appearance.
- [x] Add "Nhap so moi" action after bounty mission success and used-voucher state.
- [x] Audit admin menu labels and keep "San pham ban le" for retail products.

## Phase 2 - Commission Rules

- [x] Extend CommissionRule type with calculation mode and optional price ranges.
- [x] Update `/admin/commissions` rule editor to support percentage and fixed-by-range rules.
- [x] Update server commission calculation to use fixed machine sale ranges for order/device rules.
- [x] Keep repair commission base as paid repair amount minus gift/promo deduction.

## Phase 3 - Revenue

- [x] Split order/repair payment history into cash, bank, momo/other, and debt.
- [x] Count import cost only when paid immediately; keep debt imports as supplier debt, not store cash-out.
- [x] Update aggregate fields or keep legacy aggregate fallback transparent until backfill exists.

## Phase 4 - Shipping, Buyback, Cashier Shift

- [x] Design shipping fee fields for orders/repairs and expense treatment.
- [ ] Design old-device buyback fields and inventory/expense treatment.
- [x] Add cashier shift opening form with denominations and bank opening amount.
- [ ] Add API/transaction and reporting hooks after schema is confirmed.

## Phase 5 - Tablet Upload

- [ ] Reproduce on tablet viewport/user agent with the relevant MediaManager/upload component.
- [ ] Surface upload errors instead of silent failure.
- [ ] Verify Storage rules, file input behavior, image compression, and browser APIs.
