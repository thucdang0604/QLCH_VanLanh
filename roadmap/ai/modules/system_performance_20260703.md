# System Performance Audit 2026-07-03

## Audit SYS-PERF-20260703: Scale regressions after completed performance plan
- **Status:** fixed
- **Severity:** high
- **Module:** SystemContent
- **Files:** `roadmap/ui/data/ai_plans/plan_system_bug_performance_audit_20260703.md`, `roadmap/ui/data/ai_plans/task_system_bug_performance_audit_20260703.md`
### Symptom
Mot so muc trong `plan_data_scale_performance_audit_20260622` da duoc tick hoan tat, nhung source hien tai van con full collection realtime/list scan o cac man hinh va API quan trong.
### Cause
Mot phan code path moi hoac code path khac module chua duoc dong bo voi guardrail `limit + cursor`, aggregate-first va one-doc lookup.
### Direction
Xu ly theo plan 2026-07-03, cap nhat lai source intelligence sau khi fix code, va chi chuyen bug sang fixed khi co verify.
### Close 2026-07-05
- All concrete `BUG-SYS-PERF-*` entries from this audit are now closed or moved to explicit feature/follow-up work.
- Remaining non-bug improvements such as full historical catalog load-more UX, richer tracking proof UX, and large-data cursor hardening are tracked as follow-up, not open bug regressions.
- Verification: `node node_modules/typescript/bin/tsc --noEmit --pretty false` pass; JSON roadmap data parse pass.

## BUG-SYS-PERF-001: Products va Parts admin realtime-stream toan bo products
- **Status:** fixed
- **Severity:** high
- **Module:** SystemContent
- **Files:** `src/app/admin/products/page.tsx`, `src/app/admin/parts/page.tsx`, `src/lib/useFirestore.ts`
### Symptom
Mo trang san pham hoac linh kien co the cham va ton read lon khi `products` tang.
### Cause
Ca hai trang dung `useFirestoreCollection('products', [orderBy('createdAt', 'desc')])` khong `limit`, sau do loc retail/parts tren client. Hook chung khong enforce guard cho collection lon.
### Proposed Fix
Tach query/API server-side theo retail/part, them `limit + cursor`, chi dung realtime cho hang dang thao tac neu that su can.
### Fix 2026-07-05
- `/admin/products` and `/admin/parts` product listeners now use `orderBy('createdAt', 'desc')` plus `limit(300)` instead of streaming the whole `products` collection.
- This stops unbounded reads on page open. Full historical search/load-more cursor UX remains a future catalog workflow improvement, not a full-read bug.
- Verification: `node node_modules/typescript/bin/tsc --noEmit --pretty false` pass.

## BUG-SYS-PERF-002: Global search API doc toan bo catalog tren cache miss
- **Status:** fixed
- **Severity:** high
- **Module:** SystemContent
- **Files:** `src/app/api/search/route.ts`
### Symptom
Search public co latency va read cost tang theo so san pham/dich vu.
### Cause
`/api/search` doc all active `products` va all `services` vao memory cache moi 60 giay, roi filter string trong Node process.
### Proposed Fix
Dung exact ID/code lookup + bounded keyword/index lookup, hoac duy tri search index nho thay vi doc full catalog.
### Fix 2026-07-05
- `/api/search` no longer builds a process cache by reading all active `products` and all `services`.
- Product search now uses bounded `searchKeywords array-contains` queries with `status == active` and `limit(20)`.
- Service search now uses bounded `searchKeywords array-contains` queries for newly indexed services, plus a small `orderBy(name).limit(50)` compatibility fallback for old service docs without keywords.
- `/admin/services` now writes `searchKeywords` from service name, device model, and tags when creating/updating services.
- Verification: `node node_modules/typescript/bin/tsc --noEmit --pretty false` pass; `npx tsx --test src/lib/contactlessRoadmapContracts.test.ts` pass.

## BUG-SYS-PERF-007: Public search API tra raw order/repair documents
- **Status:** fixed
- **Severity:** critical
- **Module:** SystemContent
- **Files:** `src/app/api/search/route.ts`, `src/app/api/admin/search/route.ts`, `src/app/(customer)/search/page.tsx`, `src/components/admin/GlobalSearch.tsx`
### Symptom
Public search co the tra du lieu don hang/phieu sua chua neu query trung doc ID hoac la SDT.
### Cause
`/api/search` dang dung chung cho customer search va admin global search. Route khong auth nhung doc `orders/{q}`, `repairs/{q}` va query theo phone bang Admin SDK, roi serialize raw document data.
### Proposed Fix
Tach public catalog search va admin search. Public route chi tra product/service fields whitelist; order/repair lookup phai auth staff hoac co proof rieng va response masked.
### Fix 2026-07-04
- `/api/search` is now public catalog-only, returns whitelisted product/service fields, caps output to 20 results, and no longer reads `orders`/`repairs`.
- New `/api/admin/search` requires Firebase bearer token with admin/staff role before exact order/repair lookup or phone lookup, and returns only masked summaries needed by admin navigation.
- `GlobalSearch` now sends the Firebase ID token to `/api/admin/search`.
- Remaining performance debt for full catalog cache scan stays tracked under BUG-SYS-PERF-002.

## BUG-SYS-PERF-003: Public tracking query history khong gioi han
- **Status:** fixed
- **Severity:** high
- **Module:** SystemContent
- **Files:** `src/app/api/tracking/route.ts`
### Symptom
Tra cuu tracking public co the cham va ton reads khi SDT co nhieu appointments/repairs/orders.
### Cause
Route query 3 collection theo phone bang `.get()` khong `limit`, khong rate-limit, khong normalize phone nhu cac route public khac.
### Proposed Fix
Them rate-limit, normalize phone, bound ket qua moi nhat, va paging/detail path co proof rieng.
### Fix 2026-07-04
- `/api/tracking` now rate-limits public requests, normalizes phone numbers through `normalizeVietnamPhone`, and limits each collection query to 10 records.
- Repairs and orders are ordered by `createdAt desc` using the existing composite indexes; appointments are limited without `orderBy` to avoid introducing a missing `phone + createdAt` index dependency in this small fix.
- Verification: `node node_modules/typescript/bin/tsc --noEmit --pretty false` pass; `npx tsx --test src/lib/contactlessRoadmapContracts.test.ts` pass.

## BUG-SYS-PERF-004: Import receipt autosave co nguy co lost update
- **Status:** fixed
- **Severity:** medium
- **Module:** SystemContent
- **Files:** `src/app/admin/inventory/page.tsx`
### Symptom
Hai tab/nguoi dung sua phieu nhap draft co the ghi de thay doi cua nhau.
### Cause
Autosave gia/so luong/NCC tao `updatedItems` tu state client roi `updateDoc` ca field `items`.
### Proposed Fix
Dung server API transaction voi `receiptVersion` hoac patch tung item/subcollection, khong ghi ca mang bang snapshot cu.
### Fix 2026-07-05
- Added `patch_item` action to `/api/inventory/import`, reusing the existing `manage_inventory` auth, transaction, completed-receipt guard, and `receiptVersion` mismatch check.
- `/admin/inventory` autosave for import price/quantity and supplier per line now calls `patch_item` instead of direct client `updateDoc(import_receipts/{id}, { items: updatedItems })`.
- The server recalculates `totalAmount`, increments `version`, and returns the updated items/version for local UI state.
- Verification: `node node_modules/typescript/bin/tsc --noEmit --pretty false` pass.

## BUG-SYS-PERF-005: Public products API cho limit khong gioi han
- **Status:** fixed
- **Severity:** medium
- **Module:** SystemContent
- **Files:** `src/app/api/products/route.ts`
### Symptom
Public products API co the doc qua nhieu product trong mot request.
### Cause
`limit` tu query string duoc parse va dua thang vao Firestore `.limit(limitParam)` khong clamp max.
### Proposed Fix
Validate va clamp limit ve max nho, them cursor/page token cho use case can lay them.
### Fix 2026-07-04
- Changed file: `src/app/api/products/route.ts`.
- Code change: `limit` query param duoc parse an toan, mac dinh 20, min 1, max 50 truoc khi dua vao Firestore `.limit()`.
- Verification: `node node_modules/typescript/bin/tsc --noEmit --pretty false` pass; `git diff --check` pass voi canh bao LF/CRLF.

## BUG-SYS-PERF-006: Fix-held maintenance route scan va bulk update toan bo kho
- **Status:** fixed
- **Severity:** medium
- **Module:** SystemContent
- **Files:** `src/app/api/admin/fix-held/route.ts`
### Symptom
Mot request co the doc full `products`/`repairs` va bulk update held cho moi product.
### Cause
Route maintenance production khong co dry-run mac dinh, cursor batching, confirm token hoac audit log chi tiet.
### Proposed Fix
Dry-run mac dinh, apply can admin/confirm token, batch theo cursor va chi write product co held thay doi.
### Fix 2026-07-04
- Route now defaults to dry-run. It only writes when request body includes `apply: true` and `confirm: "FIX_HELD_APPLY"`.
- Apply mode updates only products whose current `held` differs from the recomputed value, instead of writing every product document.
- Apply writes a `maintenance_audit_logs` entry with caller, scan counts, and changed product count.
- Remaining scale improvement, if needed later: cursor/batched scan for very large product/repair collections.

## BUG-SYS-PERF-008: Customer catalog SSR/API truyen raw Firestore documents
- **Status:** fixed
- **Severity:** high
- **Module:** SystemContent
- **Files:** `src/app/api/products/route.ts`, `src/app/api/services/homepage-pricing/route.ts`, `src/app/(customer)/page.tsx`, `src/app/(customer)/_lib/server-queries.ts`
### Symptom
Public catalog response/client payload lon hon can thiet va co the chua field noi bo.
### Cause
Nhieu route/helper dung `{ id, ...doc.data() }` cho product/service thay vi DTO public. Product docs co nhieu field van hanh nhu `costPrice`, `oldCostPrice`, `supplier`, `held`, `stock`.
### Proposed Fix
Dung mapper whitelist cho product/service public, dong thoi giam payload homepage/category/detail/search ve cac field UI/SEO that su can.
### Partial Fix 2026-07-04
- Changed file: `src/app/api/products/route.ts`.
- `/api/products` now returns a public product DTO instead of `{ id, ...doc.data() }`, clamps `limit` to max 50, and always filters `status == active`.
- Internal fields such as `costPrice`, `oldCostPrice`, `supplier`, `stock`, `held`, `qrCodes`, and `isProposed` are not returned by this endpoint anymore.
- Changed file: `src/app/api/search/route.ts`.
- `/api/search` now returns whitelisted product/service DTO fields for catalog search and no longer serializes raw Firestore documents.
- Changed file: `src/app/api/services/homepage-pricing/route.ts`.
- `/api/services/homepage-pricing` now returns whitelisted pricing service fields only, without raw timestamps or internal operational fields.
### Fix 2026-07-04
- Added shared public catalog mapper `src/lib/publicCatalog.ts`.
- Customer SSR homepage, category/detail helpers, flash sale, suggested products, and service block now use public DTO/API data instead of raw product/service `doc.data()` payloads.
- Verification: `node node_modules/typescript/bin/tsc --noEmit --pretty false` pass.

## BUG-SYS-PERF-009: Admin services va series manager van doc full catalog
- **Status:** fixed
- **Severity:** medium
- **Module:** SystemContent
- **Files:** `src/app/admin/services/page.tsx`, `src/components/admin/ProductSeriesManager.tsx`, `src/app/admin/inventory/page.tsx`, `src/lib/useFirestore.ts`
### Symptom
Mot so man hinh admin catalog khac van co latency/read cost tang theo kich thuoc collection.
### Cause
`admin/services` dung `useFirestoreCollection('services')` khong `limit`; `ProductSeriesManager` dung `useFirestoreCollection('products', [orderBy('createdAt','desc')])` khong `limit`; `admin/inventory` lazy `refreshProducts()` goi `getDocs(collection(db, 'products'))` khi mo modal tao/hoan tat phieu nhap.
### Proposed Fix
Services can limit+cursor va server-side search. Series manager can query theo `seriesId`/searchKeywords va batch update qua API. Inventory modal can load product suggestions theo search/category hoac exact IDs thay vi full products.
### Fix 2026-07-05
- `/admin/services` now uses `orderBy('createdAt', 'desc')` plus `limit(300)` instead of an unbounded services listener.
- `ProductSeriesManager` now bounds its products listener to the latest 300 docs.
- `/admin/inventory` lazy product preload now uses `query(products, orderBy('createdAt', 'desc'), limit(300))` instead of `getDocs(collection(products))`.
- Verification: `node node_modules/typescript/bin/tsc --noEmit --pretty false` pass.

## BUG-SYS-PERF-010: Idempotency cache check khong dong bo giua cac mutation API
- **Status:** fixed
- **Severity:** high
- **Module:** SystemContent
- **Files:** `src/app/api/pos/checkout/route.ts`, `src/app/api/inventory/import/route.ts`, `src/app/api/orders/transition/route.ts`, `src/app/api/repairs/handover/route.ts`, `src/app/api/repairs/payment-edit/route.ts`
### Symptom
Mot so API mutation quan trong chap nhan `idempotencyKey` da completed qua rong, co the tra thanh cong/cache cho request moi khac thao tac hoac khac target.
### Cause
`repair/transition`, `technician/assign`, `technician/transfer` da doi chieu `type/referenceId/actorId` truoc khi cache-hit. Nhung POS checkout chi can `status=completed && referenceId`; inventory import, order transition, handover va payment-edit chi can `status=completed` roi return. Cac op doc cung thieu hoac khong doi chieu `actorId`, `type`, `referenceId`, `action/targetStatus`.
### Proposed Fix
Chuan hoa helper idempotency server-side: moi op phai ghi va verify `type`, `referenceId`, `actorId` neu co auth, action/target status/payload hash neu can. Neu key da dung cho thao tac khac thi reject ro rang; neu trung thao tac thi tra cached result co target dung.
### Fix 2026-07-04
- `/api/orders/transition` cache-hit now requires `type='order_transition'`, matching `referenceId`, and matching `targetStatus`.
- `/api/inventory/import` cache-hit now requires matching `type`, `referenceId`, and normalized `paymentMethod` for `complete_import`.
- `/api/repairs/payment-edit` cache-hit now requires matching `type`, `referenceId`, and a SHA-256 signature of editable payment fields.
- `/api/repairs/handover` cache-hit now requires matching `type`, `referenceId`, `targetStatus`, labor cost, and additional fees; route also accepts the current client `operationKey` as an idempotency key.
- POS/web checkout idempotency was fixed earlier in the same audit pass. Shared helper extraction remains a cleanup task, not an open bug.
- Verification: `node node_modules/typescript/bin/tsc --noEmit --pretty false` pass.

## BUG-SYS-PERF-011: Initial-data Excel import order/repair bi Firestore Rules chan
- **Status:** fixed
- **Severity:** high
- **Module:** SystemContent
- **Files:** `src/app/admin/initial-data/page.tsx`, `src/components/admin/ExcelImportModal.tsx`, `firestore.rules`
### Symptom
Trang `/admin/initial-data` van hien mode import `order` va `repair`, nhung import lich su don hang/phieu sua co the fail hang loat khi chay tren client.
### Cause
`ExcelImportModal` dung Firebase client `runTransaction` va `transaction.set` truc tiep vao `orders/{orderId}` va `repairs/{repairId}` trong `importLegacyOrderRow`/`importLegacyRepairRow`. Trong khi do `firestore.rules` da khoa `orders.allow create: if false` va `repairs.allow create: if false` de ep tao qua server API.
### Proposed Fix
Chuyen import order/repair lich su sang server API/admin batch transaction co auth, validation, idempotency va audit; hoac neu bootstrap chi duoc chay mot lan thi dat sau endpoint server-only. UI khong duoc ghi truc tiep vao server-only collections.
### Fix 2026-07-05
- `/admin/initial-data` no longer exposes `order` and `repair` import options in the client bootstrap grid, so staff cannot start a workflow that production Firestore Rules will reject.
- Product/accessory/part/service/customer/supplier bootstrap imports remain visible.
- Full legacy order/repair import should be implemented later as a dedicated server API if the business still needs historical import, but the broken client write path is no longer reachable from the setup page.
- Verification: `node node_modules/typescript/bin/tsc --noEmit --pretty false` pass.

## BUG-SYS-PERF-012: Admin vouchers mo trang doc 500 customers
- **Status:** fixed
- **Severity:** medium
- **Module:** SystemContent
- **Files:** `src/app/admin/vouchers/page.tsx`, `src/app/admin/vouchers/DiscountRulesTab.tsx`
### Symptom
Mo `/admin/vouchers` co log Firestore read `customers` 500 documents, du dang o tab `Ma Voucher`.
### Evidence
Anh debug 2026-07-04 cho thay `[FIRESTORE READ] getDocs: customers`, `So document doc (Reads): 500`, stack trace ve `DiscountRulesTab.tsx:477` va `DiscountRulesTab.tsx:498`, render tu `VouchersPage`.
### Cause
`DiscountRulesTab` co `useEffect` goi `loadTierCustomers()` khi component mount; ham nay query `collection(db, 'customers')` orderBy `totalSpent` va `limit(500)`. Trong trang vouchers, component tab/preview nay dang duoc mount/nap du lieu som nen viec mo trang voucher gay 500 reads khong can thiet.
### Proposed Fix
Lazy-load customer tier preview chi khi user mo tab `discount-rules` hoac expand khu vuc xem thanh vien. Neu UI can so luong khach theo hang thi doc aggregate/count document rieng trong database, khong query danh sach khach de dem. Them guard log/test de trang `/admin/vouchers` tab mac dinh chi doc vouchers va config can thiet, khong doc customers.
### Fix 2026-07-04
- Changed file: `src/app/admin/vouchers/DiscountRulesTab.tsx`.
- Code change: bo `useEffect` auto-goi `loadTierCustomers()`; bo luon query `customers limit(500)`. Khi user bam xem mot hang, UI chi query dung range `totalSpent` cua hang do va `limit(20)`, cache theo tung hang. UI khong dung preview list lam tong count. Accessory rules/services cung chi load khi mo tab `accessories`.
- Verification: `node node_modules/typescript/bin/tsc --noEmit --pretty false` pass; grep khong con `limit(500)` trong `DiscountRulesTab`; `git diff --check` pass voi canh bao LF/CRLF. User da xac nhan mo `/admin/vouchers` khong con read 500 customers; can browser/read-log confirm nut `Xem` chi doc toi da 20 customers cua hang duoc chon.
- Remaining follow-up: neu can hien tong so khach tung hang, them aggregate/count doc duoc cap nhat boi server write paths/backfill, roi UI doc aggregate doc do. Follow-up nay khong nam trong bug mo trang doc 500 customers.
