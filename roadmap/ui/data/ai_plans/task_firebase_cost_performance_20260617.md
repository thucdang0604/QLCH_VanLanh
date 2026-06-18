# Tasks: Firebase Cost & Performance Optimization

## Phase 8.1 - POS Product Lookup

- [x] Thay load all `products` khi mo POS bang bounded cache `orderBy(createdAt desc) + limit(120)`.
- [x] Them debounce server search qua `searchKeywords array-contains`, gioi han 60 docs moi query.
- [x] Chuyen barcode/QR scan sang async lookup:
  - cache hien co truoc,
  - `product_code_registry/{code}` + `products/{id}` tiep theo,
  - legacy exact fields `sku`, `barcode`, `productCode`, `qrCodes`,
  - fallback gioi han 500 docs chi khi can compact barcode cu.
- [x] Sau khi tao san pham moi, reload bounded cache thay vi full collection.
- [x] Focused ESLint `src/app/admin/pos/page.tsx` pass.
- [x] `pnpm typecheck` pass.
- [x] `pnpm lint` pass; con 31 warnings baseline ngoai Phase 8.1.
- [x] `git diff --check` pass.

## Phase 8.2 - Admin Realtime Listener Audit

- [x] Them query limit cho `articles` va `reviews` realtime listeners: moi man chi nghe 200 ban ghi moi nhat.
- [x] Chuyen `vouchers` tu realtime listener sang `getDocs` gioi han 200 + refresh sau create/update/toggle/delete.
- [x] Chuyen `suppliers` tu realtime listener sang `getDocs` gioi han 200 + refresh sau add/edit/payment.
- [x] Gioi han `supplier_transactions` khi mo rong NCC: 100 giao dich moi nhat.
- [x] Chuyen `discount rules/customers` sang `getDocs`: accessory rules gioi han 100, tier customer preview gioi han 500 khach theo `totalSpent`.
- [x] Giu realtime cho doc nho `system_config/tier_settings` vi chi doc 1 document.
- [x] Focused ESLint cho 5 file Phase 8.2 pass.
- [x] `pnpm typecheck` pass.

## Phase 8.3 - Badge Counters

- [x] Thay realtime listeners cho badge `orders`, `appointments`, `reviews`, `repairs` bang `getCountFromServer`.
- [x] Gop refresh Firestore badges vao mot ham `refreshFirestoreBadges`, chay luc mount va khi tab/window focus.
- [x] Giu `repairDocs` chi de tinh badge technician, query gioi han 200 phieu status `INTAKE/PARTS_ORDERED`.
- [x] Giu RTDB chat listener vi nguon doc la Realtime Database chat unread state.
- [x] Gioi han `activities` listener xuong 20 unread docs thay vi nghe toan bo unread activities.
- [x] Focused ESLint `src/lib/useAdminBadges.ts` pass.
- [x] `pnpm typecheck` pass.

## Phase 8.4 - Revenue Aggregates

- [x] Tao schema aggregate ngay/thang `revenue_daily_aggregates` va `revenue_monthly_aggregates`.
- [x] Them helper server transaction de increment aggregate theo bucket revenue/expense/count.
- [x] Cap nhat write-path chinh: order transition/cancel, POS checkout, repair create/handover, import complete, commission/reversal, collect debt.
- [x] Chuyen tao phieu chi thu cong sang server API de ghi expense va aggregate cung transaction.
- [x] Revenue page doc aggregate cho range sau rollout; range cu van fallback legacy de khong mat du lieu chua backfill.
- [x] Them Firestore rule read-only cho aggregate collections.
- [x] Focused ESLint Phase 8.4 pass.
- [x] `pnpm typecheck` pass.

## Phase 8.5 - Write Throttling

- [x] Throttle article view increment bang `localStorage` 24h theo tung bai viet.
- [x] Chuyen public article view write tu client Firestore SDK sang server API `/api/articles/view`.
- [x] API dat httpOnly cookie 24h theo article slug de chan write lap lai neu localStorage khong kha dung.
- [x] API dung Admin SDK increment `articles.views`, tranh loi public client bi Firestore rules deny.
- [x] Them rate limit server cho article view endpoint.
