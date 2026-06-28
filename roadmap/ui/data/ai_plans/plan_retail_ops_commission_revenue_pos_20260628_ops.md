# Retail Ops, Commission, Revenue, POS Cashier Plan - 2026-06-28

## Context

User requested a combined product update touching storefront banners, admin commission rules, bounty mission repeat flow, revenue cash/debt reporting, admin menu labels, tablet upload behavior, shipping/old-device fees, and POS cashier opening cash count.

This is Level 4 work because it touches business rules, money reporting, Firestore/API contracts, and multiple admin/customer flows.

## Scope

- Enforce homepage/admin banner aspect ratio expectation at 16:9.
- Refine `/admin/commissions` rules so admin can configure:
  - Repair intake commission: 2% of repair sale amount after repair gift/promo deduction.
  - Retail device sale commission: fixed amount by machine sale price range.
  - Retail accessory/product sale commission can remain percentage-based when configured.
- Allow a customer to start a new phone-number bounty flow after completing all missions or receiving a voucher.
- Update `/admin/revenue` to separate real cash/bank collected from debt, and separate paid import cost from supplier debt.
- Rename admin inventory menu display to "San pham ban le" where it still says accessory/device wording.
- Investigate tablet upload bug before changing shared upload code.
- Model shipping fees and old-device store buyback as explicit money-flow fields before commission/profit changes.
- Add POS cashier shift opening count: cash and bank starting amount, denomination quantity rows.

## Implementation Phases

1. Safe UI and existing-flow fixes:
   - Banner 16:9 helper text / preview constraints.
   - Bounty widget "Nhap so moi" reset button after success.
   - Menu label audit.

2. Money calculation fixes:
   - Commission type/rule support for fixed price ranges.
   - Server commission calculation update.
   - Revenue paid/debt split for imports and payment channels.

3. New money-flow schema:
   - Shipping fee as store expense when store pays, excluded from staff commission base.
   - Old-device buyback as expense/inventory intake, not sales discount unless admin marks it so.

4. POS cashier shift:
   - Add `cashier_shifts` or equivalent aggregate collection.
   - Capture opening cash denominations and bank opening amount.
   - Later close shift and reconcile sales/debt collections.

## Verification

- Targeted lint/typecheck for changed files.
- Manual smoke for `/admin/commissions`, `/admin/revenue`, `/admin/pos`, homepage appearance, and bounty widget.
- `pnpm verify` when the working tree is ready for broader validation.

## Notes

Tablet upload needs reproduction with the real upload component and viewport/user agent because the symptom is "no visible error but no upload". Do not hide it with generic fallback text.
