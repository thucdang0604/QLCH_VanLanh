# Task: CRM KhĂ¡ch hĂ ng Má»Ÿ rá»™ng â€” v12

## Phase 1 â€” Infrastructure & Types
- [x] `types.ts` â€” + `partLineId` (Fix 28), + `partsLockedAt`, `costPriceAtUse`, `priceConfirmedAt`. + `assignedSellerId/Name/At/By`. + POS discount fields. + Commission type `reversal`.
- [x] `permissions.ts` â€” Äá»•i quyá»n `/admin/parts` -> `manage_inventory`. ThĂªm `manage_customers`, `manage_discounts`.
- [x] `customerTiers.ts` â€” **NEW** (logic tĂ­nh tier)
- [x] `discountCalc.ts` â€” **NEW** (tĂ¡ch pure logic tĂ­nh discount)
- [x] `discountRuleUtils.ts` â€” Re-export tá»« `discountCalc.ts`
- [x] `firestore.rules` â€” (Whitelist orders, block parts/payment/status/timeline in repairs)
- [x] `firestore.indexes.json` â€” 7 indexes
- [x] `firebase deploy --only firestore:indexes`

## Phase 2 â€” Server APIs (9 routes)
- [x] `api/orders/transition/route.ts` â€” **ALL transitions** (Decision 3), operationKey, aggregate, commission (BUG-COM-001) + **reversal (Ă¢m)**
- [x] `api/orders/assign-seller/route.ts` â€” **NEW** (Fix 4: permission + audit + **late check + fetch staff name**)
- [x] `api/repairs/confirm-parts/route.ts` â€” Bearer auth, **command API chá»‰ cho KTV** (`add_selected`, `request_part`, `remove_line`, `change_quantity`, `reject_request`), báº¯t buá»™c `operationKey`, server cáº¥p `partLineId`, split-row pricing, selected-only held + **dynamic terminal guard (Fix 21/29/32-34/37)**
- [x] `api/repairs/payment-edit/route.ts` â€” **NEW** (Fix 9: laborCost/deposit/quote updates with version check + **dynamic terminal guard Fix 21/29**)
- [x] `api/repairs/transition/route.ts` â€” **NEW** (Fix 17/20/26/31: Non-terminal dynamic workflow validate, tech note gate, duration audit, save note)
- [x] `api/inventory/import/route.ts` â€” **NEW** (Fix 24/35/38: owner duy nháº¥t cá»§a tráº¡ng thĂ¡i kho; atomic `order_receipt`/`mark_availability`/`complete_import`, version + idempotency)
- [x] `api/repairs/handover/route.ts` â€” operationKey, `targetStatus` terminal dynamic/warranty, allowedNext + legacy fallback, priceConfirmedAt, stock/held, commission + **server-compute payment.amount (Fix 3/36)**
- [x] `api/pos/checkout/route.ts` â€” idempotencyKey, auto discount server, totalCost guard, commission
## Phase 2 — Server APIs (9 routes)
- [x] `api/orders/transition/route.ts` — **ALL transitions** (Decision 3), operationKey, aggregate, commission (BUG-COM-001) + **reversal (âm)**
- [x] `api/orders/assign-seller/route.ts` — **NEW** (Fix 4: permission + audit + **late check + fetch staff name**)
- [x] `api/repairs/confirm-parts/route.ts` — Bearer auth, **command API chỉ cho KTV** (`add_selected`, `request_part`, `remove_line`, `change_quantity`, `reject_request`), bắt buộc `operationKey`, server cấp `partLineId`, split-row pricing, selected-only held + **dynamic terminal guard (Fix 21/29/32-34/37)**
- [x] `api/repairs/payment-edit/route.ts` — **NEW** (Fix 9: laborCost/deposit/quote updates with version check + **dynamic terminal guard Fix 21/29**)
- [x] `api/repairs/transition/route.ts` — **NEW** (Fix 17/20/26/31: Non-terminal dynamic workflow validate, tech note gate, duration audit, save note)
- [x] `api/inventory/import/route.ts` — **NEW** (Fix 24/35/38: owner duy nhất của trạng thái kho; atomic `order_receipt`/`mark_availability`/`complete_import`, version + idempotency)
- [x] `api/repairs/handover/route.ts` — operationKey, `targetStatus` terminal dynamic/warranty, allowedNext + legacy fallback, priceConfirmedAt, stock/held, commission + **server-compute payment.amount (Fix 3/36)**
- [x] `api/pos/checkout/route.ts` — idempotencyKey, auto discount server, totalCost guard, commission

## Phase 3 — Refactor Clients
- [x] `checkout/route.ts` — bỏ aggregate cho Pending (F1)
- [x] `customerSync.ts` — `ensureCustomerProfile` (create-only)
- [x] `pos/page.tsx` — checkout qua API, **bỏ commission call**
- [x] `orders/page.tsx` — **ALL transitions → API** (Decision 3), bỏ client runTransaction, **+assign seller → API (Fix 4)**
- [x] `repairs/page.tsx` — API (transition, handover, confirm-parts, payment-edit), xóa dead code, **bỏ commission calls**
- [x] `technician/page.tsx` — xóa toàn bộ `runTransaction` liên quan tới parts, dùng REST API `confirm-parts` (Fix 2 + Fix 11)
- [x] `technician/page.tsx` — dùng REST API `transition` cho final status (Fix 12 + Fix 16 + Fix 18)
- [x] `parts/page.tsx` — chuyển `runTransaction` sang `/api/inventory/import` cho thao tác cập nhật (Fix 14 + Fix 19)
- [x] Gắn cứng `manage_inventory` cho route `/admin/parts` thay vì `manage_products` (Fix 20)
- [x] Verify: CustomerDetailDrawer, ChatCustomerActivityPanel, useCustomerActivity, PrintableRepairInvoice, ChatCustomerProfileModal

## Phase 3B — Rollout Preconditions (bắt buộc trước khi khóa rules)
- [x] `backfill-crm-aggregates.ts --dry-run` — report repair parts thiếu `partLineId`, selected parts thiếu snapshot giá, held orphan và staff đang dùng `/admin/parts` chưa có `manage_inventory`
- [x] `backfill-crm-aggregates.ts --repair-prerequisites` — gắn `partLineId` cho dòng cũ và migrate quyền kho đã xác nhận; re-run dry-run phải về 0 blocker

## Phase 4 — Lock Rules
- [x] `firestore.rules`:
  - orders: **status + assignedSeller removed from whitelist** (Decision 3 + Fix 4), create:false
  - repairs: **parts ALWAYS blocked** (Fix 1), **payment ALWAYS blocked** (Fix 2), **status/statusTimeline ALWAYS blocked (Fix 16)**, partsLockedAt
  - customers: manage_customers only, phone==docId
  - operation_requests + customer_ledger: if false (F6)
  - commissions + commission_rules: isAdmin() only
- [x] `firebase deploy --only firestore:rules`

## Phase 5 â€” CRM UI + Migration
- [x] `discount-rules/page.tsx` â€” tier config
- [x] `appointments/route.ts` â€” Admin SDK
- [x] `customers/page.tsx` â€” REWRITE
- [x] `commissions/page.tsx` â€” VERIFY (áº©n route non-admin)
- [x] `backfill-crm-aggregates.ts` â€” aggregate rebuild + legacy pending/held report; pháº§n prerequisites Ä‘Ă£ pháº£i hoĂ n táº¥t trÆ°á»›c Phase 4

## Phase 6 â€” Verify
- [x] `.\\node_modules\\.bin\\next.CMD build`
- [x] `.\\node_modules\\.bin\\eslint.CMD .`
- [x] A1-A18: Auth & Rules (18) â€” +A12 status bypass, **+A13-18 parts/payment/seller/status block**
- [x] B1-B10: Orders Transition (10) â€” +B7 intermediate, +B8 assignedSeller, **+B9-10 cancel reverse (Ă¢m) + retry**
- [x] C1-C8: POS Checkout (8)
- [x] D1-D37: Repairs + Parts/Handover (37) â€” command API, partLineId, legacy ticket guard, technician note, warranty/custom terminal, command retry
- [x] E1-E10: Inventory Import API (10) â€” `order_receipt`, `mark_availability`, `complete_import`, unavailable, held state machine, rollback/idempotency
- [x] F1-F4: Tier + Timezone (4)
- [x] G1-G7: Atomicity + Retry (7)
- [x] H1-H8: Migration + Build (8) â€” +`partLineId`/permission preflight
- [x] I1: Chat direct-write (1)
- [x] J1-J9: Commission server-side (9) â€” +J3 no-assign, +J4 assigned, **+J5 assign audit, +J6 retry reversal, +J7-J9 total=0 + invalid/late assign**

## Scope tá»•ng: 36 files, 112 tests

## 3 Decisions (chá»‘t 27.05.2026)
1. **Parts server-only**: KTV mutation qua `confirm-parts` command API; nghiá»‡p vá»¥ kho qua `inventory/import`; `partsLockedAt` top-level. `technician`/`parts` refactor.
2. **assignedSeller**: Web order chÆ°a assign â†’ Complete OK, khĂ´ng commission. POS â†’ createdBy.
3. **All-transitions API**: Má»i order status transition qua API. Rules cáº¥m client update status.
