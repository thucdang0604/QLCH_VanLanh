# Retail Ops Walkthrough - 2026-06-28

## Admin Commissions

1. Admin opens `/admin/commissions`.
2. Admin creates a repair intake rule: type repair, percentage mode, 2%.
3. Admin creates a retail machine rule: type order, fixed-by-range mode, ranges by sale price.
4. POS/order completion calculates the matching rule server-side and writes `commissions`.

## Customer Bounty Flow

1. Customer enters name/phone, receives OTP, completes missions, receives voucher.
2. Success state shows voucher and a button to enter a new phone number.
3. Clicking the button clears local bounty state and returns to phone/OTP step.

## Admin Revenue

1. Admin opens `/admin/revenue`.
2. Real collected revenue is shown separately by payment channel.
3. Customer debt is shown as debt, not real collected cash.
4. Import receipts paid by debt increase supplier debt but do not increase store cash-out.

## POS Cashier Shift

1. Cashier opens `/admin/pos`.
2. Cashier tab captures opening cash denominations and bank opening amount.
3. Shift close/reconciliation is a follow-up after the opening data contract is landed.
