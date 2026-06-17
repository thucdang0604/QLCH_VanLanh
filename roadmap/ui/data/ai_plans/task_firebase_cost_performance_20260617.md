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

- [ ] Thay nhieu listener trong `useAdminBadges` bang count query hoac aggregate doc.

## Phase 8.4 - Revenue Aggregates

- [ ] Tao huong aggregate ngay/thang cho orders, repairs, import receipts, commissions, expenses.

## Phase 8.5 - Write Throttling

- [ ] Throttle article view increment theo session/localStorage hoac batch aggregate.
