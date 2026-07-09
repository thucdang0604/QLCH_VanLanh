# Tasks: System Bug and Performance Audit - 2026-07-03

## Phase 1 - POS checkout latency root cause

- [ ] Capture real `debugTiming` from slow `/api/pos/checkout` cases.
- [x] Replace checkout active shift query with `system_counters/active_cashier_shift` doc lookup.
- [ ] Pass already-read product metadata into commission calculation to remove duplicate product reads.
- [ ] Cache/preload active commission rules outside hot transaction where safe.
- [ ] Batch independent transaction reads with `tx.getAll` where Firestore Admin SDK supports it.
- [ ] Review FIFO lot query count and add bounded/indexed lot reads.
- [ ] Verify POS sale, repair payment, debt collection, voucher, cashier-shift totals.

## Phase 2 - Commission reliability

- [x] Refactor `calculateAndSaveCommissionsServer` so errors are not swallowed silently.
- [ ] Split pure calculation from transaction write.
- [ ] Add tests for missing product metadata, bad rule data, repair commission, order commission.
- [ ] Verify `commissionCost` aggregate stays consistent with commission docs.

## Phase 3 - POS customer lookup speed

- [x] Add `limit/orderBy` to POS repair lookup by `customer.id` and `customer.phone`.
- [ ] Prefer active/unpaid workflow states for POS lookup, not full repair history.
- [ ] Keep recent payable orders bounded and add load-more/detail path if needed.
- [ ] Browser smoke with an old customer having many repairs/orders.

## Phase 4 - Admin catalog list scale

- [x] Replace Products page full realtime `products` listener with bounded query/API and cursor.
- [x] Replace Parts page full realtime `products` listener with server-side part filter and cursor.
- [ ] Add guard/helper so large admin collections cannot be subscribed without limit.
- [ ] Verify search/filter/category behavior still works.

## Phase 5 - Search and revenue fallback

- [x] Split public catalog search from admin global search before exposing order/repair lookup.
- [x] Remove raw `orders`/`repairs` serialization from public `/api/search`.
- [x] Add staff auth or proof-gated masked endpoint for order/repair exact lookup.
- [x] Refactor `/api/search` away from full products/services cache scan.
- [x] Use bounded keyword/index lookup for products/services, with a small service fallback for legacy docs.
- [x] Change Revenue raw collection scan fallback into explicit diagnostic/backfill path.
- [x] Verify aggregate-first reporting for current month and historical ranges.

## Phase 6 - Finance and supplier payment consistency

- [ ] Move supplier debt payment to an authenticated server API transaction.
- [ ] Add idempotency key for supplier payment so retry/double click cannot duplicate expense.
- [ ] Update `expenses` Firestore rule away from broad `view_revenue` write access.
- [ ] Verify supplier `totalDebt`, `supplier_transactions`, `expenses`, and revenue expense totals stay consistent.

## Phase 7 - Public tracking and repair workflow patch paths

- [x] Add rate-limit, phone normalization, and bounded results to `/api/tracking`.
- [ ] Decide proof model for tracking: OTP/session token/order code, not phone-only history dump.
- [x] Move repair checklist updates from client `updateDoc` to a server API with version/assignment checks.
- [x] Move post-repair media append to server API using `arrayUnion` or versioned operation log.
- [ ] Add tests/smoke for concurrent checklist/media edits and tracking with old customer history.

## Phase 8 - Inventory draft edit concurrency

- [x] Replace import receipt autosave whole-array writes with versioned item patch API.
- [ ] Verify two-tab edits do not overwrite separate item changes.

## Phase 9 - Public API limits and maintenance guards

- [x] Harden `/api/proxy-image`: whitelist VietQR host/protocol, timeout, image content-type, and max response size.
- [x] Require Firebase token and verify room ownership before `/api/ai` pushes bot replies to RTDB.
- [x] Validate RTDB `roomId` as a path-safe key before any Admin SDK room write.
- [x] Align `/api/appointments` and `/api/checkout` customer-name update policy with `/api/customers/sync`: no public overwrite of existing real customer names.
- [x] Add public DTO mapper for `/api/products` so that endpoint no longer returns raw `doc.data()`.
- [x] Add public DTO mapper for `/api/services/homepage-pricing` so pricing API no longer returns raw `doc.data()`.
- [x] Add shared public product/service DTO mapper and remove raw `doc.data()` from remaining customer API/SSR/client props.
- [x] Verify public catalog/search/detail responses do not contain `costPrice`, `oldCostPrice`, `supplier`, `held`, or other admin-only fields.
- [x] Protect `/api/bounty/request-otp` `action=record` with Firebase phone token proof.
- [x] Clamp `/api/products?limit=` to a small maximum.
- [ ] Add cursor semantics to `/api/products` if a caller needs more than the capped first page.
- [x] Convert `/api/admin/fix-held` to dry-run by default with explicit admin apply guard.
- [ ] Batch fix-held by cursor if product/repair collections grow beyond safe one-shot maintenance size.
- [x] Write fix-held audit log for changed product count and scan counts on apply.

## Phase 10 - Commission manual adjustment consistency

- [x] Move manual commission creation to a server API transaction.
- [x] Increment revenue aggregates for manual commission cost in the same transaction.
- [x] Decide whether direct client `commissions` writes should stay allowed for admin or become server-only.
- [x] Add idempotency to `/api/admin/customers/collect-debt` cash movement.
- [x] Merge collect-debt order lookup by `customer_info.customerId` and legacy phone candidates, then dedupe.
- [x] Reject collect-debt if payment amount cannot be fully distributed to order debts.
- [x] Require `idempotencyKey` for `/api/checkout`; reject direct public checkout requests without it.
- [ ] Verify double-click/retry does not duplicate debt payment or revenue aggregate.
- [x] Split `Completed -> Cancelled` order transition into a refund-aware flow.
- [x] Persist refund paymentHistory/cash movement server-side instead of UI-only local state.
- [x] Fix `/api/repairs/handover` to accept and validate handover payment payload server-side.
- [x] Align repair handover idempotency key name with client (`idempotencyKey` or `operationKey`) and cache result.
- [x] Verify repair handover with additional fees, labor override, and retry/double-click.

## Phase 11 - Inventory import contract cleanup

- [x] Make inventory import UI send only `cash`, `bank`, or `debt` for `paymentMethod`.
- [x] Validate `paymentMethod` enum server-side and reject unknown values such as `paid`.
- [ ] Backfill or normalize existing `import_receipts`/`expenses` with `paymentMethod='paid'`.
- [x] Align order/complete guards so `receipt.supplierId` is accepted as item supplier fallback.
- [ ] Add focused tests for import paid cash, paid bank, debt by receipt-level supplier, and missing supplier rejection.

## Phase 12 - Repair editor atomic save

- [x] Replace repair edit client transaction with a server API transaction.
- [x] Merge payment, customer/device/checklist/media/staff/timing updates in one operation.
- [x] Require `ticketVersion` and `idempotencyKey` for the full edit save.
- [x] Return the updated ticket/payment from the API and refresh UI from server result.
- [ ] Add regression test for payment edit succeeding while profile update would fail; the full operation must roll back.

## Phase 13 - Supplier payment aggregate consistency

- [x] Replace client-side supplier payment writes with a server API transaction.
- [x] Require idempotency key and validate payment amount against current supplier debt.
- [x] Increment `supplierPaymentCost` plus cash/bank expense channel aggregate in the same transaction.
- [x] Normalize supplier payment method to `cash|bank|other`.
- [ ] Add regression test comparing aggregate report with raw expense docs after supplier payment.

## Phase 14 - Remaining admin catalog scale

- [x] Replace `admin/services` full realtime listener with bounded query/cursor.
- [x] Replace `ProductSeriesManager` full products stream with searchable/paged series APIs.
- [x] Replace inventory `refreshProducts()` full products load with search/category/exact-ID product picker.
- [ ] Add guard in `useFirestoreCollection` or lint/test to flag large collections without `limit`.

## Phase 15 - Voucher uniqueness and idempotency contract

- [x] Move voucher create/update/delete to an authenticated server API transaction.
- [x] Normalize voucher code uppercase and enforce uniqueness via `vouchers/{code}` or a unique lock document.
- [ ] Add migration/diagnostic for existing duplicate voucher codes before enforcing the invariant.
- [x] Update `/api/vouchers/validate`, web checkout, and POS checkout to reject duplicate active voucher codes instead of using `limit(1)`.
- [ ] Browser/API verify duplicate voucher create/update is rejected and checkout increments `usedCount` on the intended document.
- [ ] Create a shared idempotency helper for mutation APIs.
- [x] Require completed operation cache hits to match `type`, `referenceId`, `actorId` where available, and action/target/payload hash where needed.
- [x] Update POS checkout, inventory import, order transition, repair handover, and repair payment-edit to enforce matching cache-hit contracts.
- [x] Verify reused keys for a different operation are rejected instead of returning stale success.

## Phase 16 - Initial-data legacy order/repair import

- [x] Move `order` and `repair` Excel import writes out of client Firestore transactions.
- [ ] Add admin-only server API for legacy order import with validation, duplicate guard, customer merge, debt transaction, and audit.
- [ ] Add admin-only server API for legacy repair import with validation, duplicate guard, customer merge, payment/debt transaction, and audit.
- [x] Keep Firestore `orders` and `repairs` client create rules closed.
- [x] Update `/admin/initial-data` so unsupported client order/repair import modes are no longer exposed.
- [ ] If historical order/repair import is still needed, add dedicated server APIs and verify production rules no longer block supported imports.

## Phase 17 - Admin vouchers customer-read reduction

- [x] Make `DiscountRulesTab` load tier customer preview only when the discount-rules tab is active or the preview section is expanded.
- [x] Replace `customers limit(500)` preview with a bounded per-tier `totalSpent` range query capped at 20 customers.
- [x] Ensure opening `/admin/vouchers` default voucher tab does not call `getDocs(customers)` from `DiscountRulesTab` auto-mount code.
- [x] Browser/debug-log verify that default page open reads only vouchers/config needed for the visible tab.
- [ ] Browser/debug-log verify that clicking a tier `Xem` button reads no more than 20 customer docs for that selected tier.
- [ ] Later Firebase read optimization: add an aggregate count document for customer tier counts if the UI needs exact totals.
- [ ] Later Firebase read optimization: update the tier table to read total customer counts from the aggregate doc, not from preview list queries.

## Deferred separate follow-up queue

Nhung muc nay can thiet ke rieng hoac can proof/backfill/index rieng, nen khong xu ly vo vang trong nhip fix bug nho hien tai. Sau khi dong cac bug ro rang, quay lai xu ly theo tung mini-plan rieng.

- [ ] Public tracking proof model: `/api/tracking` da co rate-limit, normalize phone, bound results va mask response; van can chon OTP/session token/order-code proof truoc khi tra lich su chi tiet hon.
- [ ] Firebase read optimization for customer tier counts: tao aggregate/count document cho tier counts; UI vouchers doc aggregate thay vi query customer list de dem. Preview list van limit nho.
- [x] Search index strategy: thay `/api/search` full products/services cache scan bang `searchKeywords`; service docs moi duoc ghi keyword, legacy service docs con fallback nho.
- [x] Public catalog DTO consolidation: tach mapper product/service public dung chung cho homepage SSR, category/detail, `/api/services/homepage-pricing`, `/api/products`, `/api/search`.
- [ ] Fix-held large-data mode: neu products/repairs tang lon, them cursor/batched scan thay vi one-shot maintenance request.
- [ ] POS checkout latency deep pass: can lay `debugTiming` that tu ca cham, roi moi toi uu transaction reads/commission/FIFO/active shift counter.
- [x] Revenue raw scan fallback: chuyen thanh diagnostic/backfill path rieng, khong chen vao reporting path binh thuong.

## Roadmap follow-up

- [x] Update `source_intelligence.json` after code changes land.
- [x] Change these bug entries from `open` to `fixed` only after focused verification.
- [ ] Add browser/read-count evidence to walkthrough if a later fix phase creates one.
