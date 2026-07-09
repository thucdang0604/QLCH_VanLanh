# Plan: System Bug and Performance Audit - 2026-07-03

## Goal

Quet lai codebase sau khi branch truoc da sach commit, ghi nhan cac bug logic, xung dot roadmap-code, va diem cham he thong can sua tiep. Phat hien dau vao tu nguoi dung: `/admin/pos` thanh toan mot don dang mat nhieu thoi gian.

Pham vi audit nay la ghi nhan va len backlog, chua sua code. Khi sua phai tach phase nho, verify tung luong POS/revenue/search/admin list va khong che giau loi bang fallback im lang.

## Small-Batch Implementation Cadence

Trien khai theo nhom nho, moi nhom chi gom cac bug co cung blast radius va co verify gate rieng:

1. **Admin read spikes:** cac trang doc nhieu document khi mo UI (`admin/vouchers`, Products/Parts/Services, Series manager, Inventory product selector). Gate: browser/debug Firestore read log truoc/sau.
2. **Public API exposure:** search/order-repair leak, raw catalog DTO, proxy-image SSRF, AI RTDB write, tracking proof/rate-limit. Gate: API response whitelist + unauth smoke.
3. **Money movement consistency:** supplier payment, manual commission, collect-debt, completed-order refund. Gate: transaction/idempotency + revenue aggregate compare.
4. **Repair workflow consistency:** handover payload/idempotency, editor atomic save, checklist/media server patch. Gate: version conflict + retry/double-click smoke.
5. **Inventory/import consistency:** import payment method enum, supplier fallback, autosave lost update, initial-data order/repair server import. Gate: focused import cases + rules compatibility.
6. **POS checkout latency:** cashier lock lookup, duplicate commission reads, FIFO/document-id batching, POS repair lookup. Gate: `debugTiming.transactionSteps` and cashier/revenue/stock smoke.

### Aggregate Count Rule

Bat ky UI nao chi can hien so luong/tong dem thi khong query list document de dem. Phai co aggregate/count document rieng trong database, vi du `admin_stats/customer_tiers` hoac aggregate theo module, duoc cap nhat trong server transaction/backfill. UI chi doc aggregate doc; list query chi dung khi user that su can xem chi tiet va phai co paging/limit nho.

## High Priority Findings

### P0 - POS checkout transaction qua lon va co nhieu read trung lap

- Evidence:
  - `src/app/api/pos/checkout/route.ts` gom auth, product stock, taxonomy, voucher, staff/customer, repair, old-order debt, cashier shift, workflow, FIFO, document ID reservation, commission, revenue aggregate, stock update, ledger, customer aggregate va idempotency vao mot transaction.
  - `src/lib/commissionCalcServer.ts` doc lai `commission_rules` va tung `products/{id}` trong khi POS checkout da doc san product docs truoc do.
  - `src/lib/inventoryFifo.ts` doc lot theo tung product bang nhieu query rieng trong transaction.
  - `src/lib/serverDocumentIds.ts` moi nhom ID doc counter va doc collision refs tuan tu trong transaction.
- Impact: thanh toan POS co do tre cao, nhat la don co nhieu san pham, sua chua, thu no, FIFO lot, voucher hoac hoa hong.
- Direction:
  - Do timing theo `debugTiming.transactionSteps` tren case that.
  - Tach cac read co the cache/preload: commission rules, taxonomy, active cashier lock, product metadata cho commission.
  - Dung `tx.getAll` cho doc refs doc lap khi co the.
  - Giu atomic cho stock/cashier/revenue/ledger, nhung khong doc trung san pham trong commission helper.

### P0 - Commission helper dang che giau loi va co the lam mat hoa hong

- Evidence: `src/lib/commissionCalcServer.ts` bat `catch (error)` va chi `console.error`, khong rethrow.
- Impact: POS/order/repair transaction co the thanh cong nhung commission khong duoc ghi, `commissionCost` aggregate khong tang, roadmap/user khong thay loi. Dieu nay trai voi nguyen tac "khong che giau loi".
- Direction:
  - Tach pure calculation va transactional write.
  - Neu loi do doc rule/product hoac tinh commission thi fail ro rang hoac tra warning co audit record, khong im lang.
  - Them test cho case commission rule loi/missing product metadata.

### P0 - Checkout POS van query cashier shift dang mo thay vi dung lock doc

- Evidence:
  - `src/app/api/pos/cashier-shift/route.ts` da co `system_counters/active_cashier_shift` lock cho open/close.
  - `src/app/api/pos/checkout/route.ts` van doc `cashier_shifts.where(status == open).limit(1)` trong transaction.
- Impact: vua cham hon one-doc lookup, vua co rui ro cong tien vao sai ca neu ton tai legacy duplicate open shift. Bug `BUG-POS-013` da sua open/close lock nhung checkout chua di theo cung contract.
- Direction: checkout doc lock doc truoc, verify locked shift status open; chi fallback query legacy trong route repair/admin rieng co audit warning.

### P1 - POS lookup theo khach hang doc repair khong gioi han

- Evidence: `src/app/admin/pos/page.tsx` query repairs theo `customer.id` va `customer.phone` khong co `limit/orderBy`, trong khi orders query da co `limit(20)`.
- Impact: khach quen co nhieu phieu sua chua se lam thao tac tra SDT/quet QR khach tai POS cham truoc khi thanh toan.
- Direction: query active/unpaid repair theo workflow status + `limit(20)`, them nut xem them/lien ket drawer lich su.

### P1 - Products va Parts admin van realtime-stream toan bo products

- Evidence:
  - `src/app/admin/products/page.tsx` dung `useFirestoreCollection('products', [orderBy('createdAt', 'desc')])`.
  - `src/app/admin/parts/page.tsx` dung cung hook va loc linh kien client-side.
  - `src/lib/useFirestore.ts` khong enforce `limit` mac dinh cho collection lon.
- Impact: mo trang san pham/linh kien se doc va nghe realtime toan bo `products`, mau cham khi du lieu tang. Day la hoi quy voi plan scale 2026-06-22 da danh dau hoan tat cho cac admin read lon.
- Direction: tach API/query theo mode retail/part, filter server-side, `limit + cursor`, va chi realtime cac entity dang thao tac neu can.

### P1 - Global search API doc toan bo products/services vao memory cache

- Evidence: `src/app/api/search/route.ts` moi cache miss doc all active products va all services roi filter string trong memory.
- Impact: search public co chi phi doc lon moi 60s, latency tang theo catalog, cache memory per instance khong chia se giua functions.
- Direction: dung searchKeywords/index collection hoac endpoint bounded prefix/exact code; cache aggregate/index doc nho neu can.

### P0 - Public search API leak order/repair documents

- Evidence:
  - `src/app/(customer)/search/page.tsx` goi public `/api/search?q=...`.
  - `src/app/api/search/route.ts` khong require auth, nhung exact-ID lookup doc `orders/{q}` va `repairs/{q}`, sau do `serializeDoc` tra raw document data.
  - Route cung query theo phone va push raw `orders`/`repairs` results neu `q` la 8-12 chu so.
- Impact: nguoi ngoai co the thu ma don/phieu hoac SDT de doc PII, items, payment/status va noi dung repair qua Admin SDK, bypass Firestore Rules dang khoa `orders`/`repairs`.
- Direction: tach public catalog search khoi admin global search; public route chi tra product/service fields whitelist. Order/repair lookup phai yeu cau auth staff hoac proof rieng va mask response.

### P1 - Public proxy-image SSRF va unbounded fetch

- Evidence: `src/app/api/proxy-image/route.ts` nhan `url` tu query string, goi `fetch(url)`, sau do `arrayBuffer()` va tra content-type tu upstream. Caller hien tai la bank settings QR/logo, nhung route public khong enforce domain.
- Impact: co the proxy request toi host noi bo/metadata endpoint, tai noi dung lon vao memory, hoac tra noi dung khong phai image qua server cua minh.
- Direction: whitelist host VietQR/bank logo, chi `https`, timeout, content-type image, content-length max va private-IP guard.

### P1 - Public AI route duoc phep ghi bot message vao RTDB room

- Evidence:
  - `src/lib/realtimedb.ts` goi `/api/ai` voi `roomId` va `pushToRtdb: true`.
  - `src/app/api/ai/route.ts` khong auth, neu body co `pushToRtdb` thi dung Admin RTDB push message vao `chats/${roomId}/messages`.
  - `database.rules.json` khong cho client user ghi `senderType=admin/bot`, nhung API Admin SDK bypass rules.
- Impact: caller public co the spam/chen bot message vao phong chat neu biet/doan duoc roomId; moi request con goi AI provider lam tang cost. Neu roomId khong duoc validate path-safe, co them rui ro path injection.
- Direction: tach AI generation public khoi RTDB write; RTDB write phai yeu cau Firebase token/App Check va verify `roomId === auth.uid` hoac server-side room ownership.

### P1 - Appointment/checkout public routes van overwrite customer name

- Evidence:
  - `src/app/api/customers/sync/route.ts` da bo `forceUpdateName` va chi update ten khi current name rong/generic.
  - `src/app/api/appointments/route.ts` van update `customers/{phone}.name` khi appointment `fullName` khac `currentData.name`.
  - `src/app/api/checkout/route.ts` cung update `customers/{phone}.name` khi checkout name khac `currentData.name`.
- Impact: nguoi ngoai biet SDT co the dat lich hen/checkout gia de doi ten CRM cua khach hang hien huu, lam sai du lieu tren POS/repair/customer history.
- Direction: public routes chi set name khi tao customer moi hoac current name rong/generic; overwrite ten khach hang phai qua admin API auth/audit.

### P2 - Revenue page van co source-collection fallback

- Evidence: `src/app/admin/revenue/page.tsx` neu aggregate khong dung/permission fail thi doc `orders`, `repairs`, `import_receipts`, `commissions`, `expenses` trong range toi 32 ngay.
- Impact: normal path co the quay lai scan 5 collection, lam trang doanh thu cham va de lech voi aggregate-first contract.
- Direction: aggregate la nguon chinh; thieu aggregate thi hien trang thai can backfill/repair, khong fallback am tham sang scan raw collections tru khi user chon diagnostic.

### P1 - Supplier payment va expenses write khong atomic

- Evidence:
  - `src/app/admin/suppliers/page.tsx` khi tra no NCC ghi tuan tu `supplier_transactions/{txId}`, `expenses/supplier-pay-{txId}` roi update `suppliers/{id}.totalDebt`.
  - `firestore.rules` cho `expenses` `allow read, write: if hasPermission('view_revenue')`, trong khi permission ten la xem doanh thu.
- Impact: neu loi giua chung hoac user bam lap, so no NCC, phieu chi va bao cao doanh thu/chi phi co the lech nhau. Staff chi co quyen xem doanh thu co the ghi expense truc tiep.
- Direction: chuyen tra no NCC sang server API transaction/idempotency; doi rules thanh permission ghi chi phi rieng hoac server-only cho cash movement.

### P1 - Public tracking API thieu rate-limit va query khong gioi han

- Evidence: `src/app/api/tracking/route.ts` la public `POST`, nhan `phone`, query `appointments`, `repairs`, `orders` bang `.where(...).get()` khong `limit`, khong rate-limit, khong normalize phone nhu cac route public khac.
- Impact: co the bi brute-force SDT de xem lich su mua/sua chua da mask mot phan nhung van tra items, tong tien, media, trang thai; khach co nhieu lich su lam route cham va ton reads.
- Direction: them rate-limit + normalize phone + OTP/session proof hoac ma tra cuu; gioi han ket qua moi nhat va paging rieng.

### P1 - Repair workflow con client write bypass quanh checklist/media

- Evidence:
  - `src/app/admin/technician/page.tsx` update truc tiep `repairs/{id}.deviceInfo.checklist.*`.
  - `src/features/repairs/RepairTicketBoard.tsx` update truc tiep `repairs/{id}.postRepairMedia` bang array snapshot cu.
  - `firestore.rules` cho staff `manage_repairs` update repairs mien khong doi cac field cam, nen cac field nay bypass API transition/operation audit.
- Impact: checklist/media co the ghi de nhau khi hai nguoi thao tac; khong co version/idempotency/audit nhu cac API repair workflow, va status terminal/assignment guard khong duoc enforce server-side cho cac field phu nay.
- Direction: dua checklist/media vao API patch rieng co auth, assigned-technician/manager check, version check va `arrayUnion`/operation log.

### P2 - Import receipt autosave ghi ca mang items bang snapshot client

- Evidence: `src/app/admin/inventory/page.tsx` autosave gia/so luong/NCC bang `updateDoc(import_receipts/{id}, { items: updatedItems })` dua tren state hien tai.
- Impact: hai tab hoac hai user sua khac dong trong cung phieu nhap co the lost update; receipt status completed da bi rules chan nhung race tren draft van con.
- Direction: dua autosave item vao server API transaction theo `receiptVersion` hoac tach item subcollection/field patch co guard.

### P1 - Bounty OTP record action tin client

- Evidence: `src/app/api/bounty/request-otp/route.ts` cho public body `{ action: "record" }` goi `recordSuccessfulOtpSend` cho IP va phone ma khong can Firebase proof.
- Impact: request truc tiep co the dat progressive cooldown cho mot SDT hop le, lam chu so khong gui duoc OTP trong mot khoang thoi gian. Day la DoS nho tren luong nhan voucher.
- Direction: action record phai yeu cau Firebase ID token/phone proof, App Check, hoac chuyen ghi rate-limit sang server endpoint nhan webhook/proof sau khi OTP thanh cong; it nhat khong cho public record tuy y.

### P2 - Public products API co limit khong cap

- Evidence: `src/app/api/products/route.ts` doc `limitParam = parseInt(searchParams.get('limit') || '20')` va truyen thang vao `.limit(limitParam)`.
- Impact: client public co the goi `?limit=100000` lam read/latency/cost tang manh, trong khi UI chi can batch nho.
- Direction: clamp limit ve max co dinh (vi du 50/100), validate positive integer, them cursor neu can.

### P2 - Maintenance fix-held route scan va ghi toan bo products/repairs

- Evidence: `src/app/api/admin/fix-held/route.ts` doc full `products` va full `repairs`, tinh lai held va bulk update moi product.
- Impact: route co auth `manage_inventory` nhung chay production co the ton read/write lon va sua hang loat stock-held neu bam nham. Khong co dry-run, scope, confirm token, hoac background job guard.
- Direction: chuyen thanh diagnostic/dry-run mac dinh, yeu cau admin/confirm token cho apply, chia batch theo cursor va log audit.

### P1 - Manual commission khong cap nhat revenue aggregate

- Evidence: `src/app/admin/commissions/page.tsx` them hoa hong thu cong bang client `addDoc(collection(db, 'commissions'), data)`.
- Impact: doc commission co them nhung `revenue_daily_aggregates/monthly_aggregates.commissionCost` khong tang, lam bao cao chi phi/lai sai.
- Direction: dua manual commission vao server API transaction dung `incrementRevenueAggregates`, va khoa client write neu khong can.

### P1 - Admin collect-debt thieu idempotency

- Evidence: `src/app/api/admin/customers/collect-debt/route.ts` khong nhan `idempotencyKey`, khong dung `operation_requests`.
- Impact: retry/double-click co the ghi them payment lan hai, tru no khach, them `customer_transactions`, order paymentHistory va aggregate doanh thu lap neu khach con du no.
- Direction: bat buoc idempotency cho cash movement, cache completed result trong transaction.

### P1 - Admin collect-debt co the phan bo thieu vao order khi khach co legacy phone debt

- Evidence:
  - `src/app/api/admin/customers/collect-debt/route.ts` query debt order theo `customer_info.customerId`, va neu ket qua khong empty thi return ngay, khong query tiep cac phone candidate.
  - Route giam `customers.totalDebt` va cong aggregate theo `numAmount` ma khong verify `remainingAmountToDistribute` da ve 0 sau khi cap nhat orders.
- Impact: khach co no tron giua customerId moi va order legacy theo phone co the duoc thu/tru no day du tren customer aggregate, nhung order legacy van con `paymentStatus: debt` va thieu `paymentHistory`.
- Direction: merge debt orders tu customerId + phone candidates, dedupe, tinh tong debt tu order docs va reject neu payment amount khong phan bo het.

### P1 - Web checkout idempotency van optional o API

- Evidence: `src/app/api/checkout/route.ts` chi doc/ghi `operation_requests` neu body co `idempotencyKey`; request thieu key van di tiep tao order, tang product held va voucher usedCount.
- Impact: BUG-ORD-007 da fix client, nhung direct API/retry khong key van co the duplicate pending orders, giu ton ao va burn voucher usage.
- Direction: public checkout phai require `idempotencyKey` hop le; reject thieu key va verify duplicate returns original order.

### P1 - Order cancel completed chua dong bo payment/refund

- Evidence: `src/app/api/orders/transition/route.ts` cho `Completed -> Cancelled`, tra stock/giam aggregate/ghi `refund_order` ledger, nhung khong ghi paymentHistory refund, khong reset payment state, khong ghi cash/bank refund movement. `src/app/admin/orders/page.tsx` chi cap nhat paymentHistory local khi complete.
- Impact: don da thu tien bi huy co the hien trang thai/lich su thanh toan sai voi ledger doanh thu va tien mat/chuyen khoan.
- Direction: tach refund API/flow, tinh paid amount server-side, ghi refund history va cash/bank movement trong transaction.

### P1 - Repair handover bo qua payment payload va mismatch idempotency key

- Evidence:
  - `src/app/admin/repairs/page.tsx` gui `additionalFees`, `paymentConfirmed`, `discountAmount`, `handoverNote`, `operationKey` toi `/api/repairs/handover`.
  - `src/app/api/repairs/handover/route.ts` chi destructure `idempotencyKey` va `laborCost`; `additionalFees`/`discountAmount` lay tu `currentPayment`, khong lay tu body.
  - Handover API co cache idempotency bang `idempotencyKey`, nhung client gui `operationKey` nen nhanh chong-lap khong duoc kich hoat.
- Impact: thu ngan nhap phu phi/ghi chu tai modal ban giao nhung total/payment/revenue co the khong ghi nhan; retry/double-click khong dung dung operation cache nhu cac repair API khac.
- Direction: dong bo contract `idempotencyKey`/`operationKey`, validate va persist cac field payment/handover payload server-side trong cung transaction, them smoke cho phu phi ban giao.

### P1 - Public catalog tra raw product/service data

- Evidence:
  - `src/app/api/products/route.ts` va `src/app/api/services/homepage-pricing/route.ts` tra `{ id, ...doc.data() }` cho request public.
  - `src/app/(customer)/page.tsx` truyen raw `ssrLatestProducts`/`ssrPricingServices` sang client components.
  - `src/app/(customer)/_lib/server-queries.ts` tra raw category/detail product/service docs cho customer pages.
- Impact: product schema co `costPrice`, `oldCostPrice`, `supplier`, `stock`, `held`; cac field nay co the nam trong API response hoac Next client payload du public UI khong can.
- Direction: tao mapper public DTO cho product/service va dung chung o SSR/API/search/category/detail; audit lai client component props khong nhan raw Firestore doc.

### P1 - Inventory import payment method contract mismatch

- Evidence:
  - `src/app/admin/inventory/page.tsx` goi `executeFinalImport(paymentMethod: 'paid' | 'debt')` va gui thang `paymentMethod`.
  - `src/app/api/inventory/import/route.ts` chi xu ly rieng `'debt'` va `'bank'`; gia tri khac bi tinh vao `cashExpenses` nhung van luu `paymentMethod='paid'`.
- Impact: phieu nhap tra ngay co the duoc aggregate nhu tien mat nhung receipt/expense lai mang method `paid`, lam filter/report cash-bank-debt khong dong bo.
- Direction: UI phai gui `cash|bank|debt`; API validate enum va migrate/backfill `paid` neu da ton tai.

### P1 - Inventory import supplier fallback khong dong bo

- Evidence:
  - `src/app/api/inventory/import/route.ts` nhanh `order_receipt` chap nhan `receipt.supplierId`, nhung nhanh `complete_import` bao thieu NCC neu item khong co supplier rieng.
  - Cung trong `complete_import`, tao cong no dung `item.supplierId || receipt.supplierId`, chung minh server co y dinh ho tro NCC cap phieu.
- Impact: phieu nhap co NCC cap phieu co the bi chan hoan tat hoac buoc gan NCC lai tung dong, lam sai contract `ImportReceipt.supplierId`.
- Direction: chuan hoa guard UI/server theo fallback `receipt.supplierId`, them test debt import voi supplier cap receipt.

### P1 - Repair editor save khong atomic

- Evidence:
  - `src/app/admin/repairs/page.tsx` khi edit phieu goi `/api/repairs/payment-edit` truoc, roi moi `runTransaction` client update cac field ho so.
  - `src/app/api/repairs/payment-edit/route.ts` commit payment va tang `version` doc lap voi buoc luu ho so.
- Impact: neu buoc client update sau do fail, payment/coc/cong da thay doi nhung thong tin khach/thiet bi/KTV/media/chuyen muc khong luu, tao phieu nua-cu nua-moi va audit khong co mot operation duy nhat.
- Direction: gom edit repair vao server API transaction duy nhat, merge payment + profile/device/media/staff + version/audit trong cung operation.

### P1 - Supplier payment khong cap nhat revenue aggregates

- Evidence:
  - `src/app/admin/suppliers/page.tsx` ghi `expenses` category `supplier_payment` truc tiep tu client.
  - `src/app/admin/revenue/page.tsx` khi dung aggregate chi merge `revenue_daily_aggregates`; recent `expenses` khong duoc cong vao totals.
  - Khong co call `incrementRevenueAggregates` cho supplier payment.
- Impact: tong chi/loi nhuan rong tren aggregate-first report bi thieu khoan tra no NCC, trong khi fallback raw scan co the cho so khac.
- Direction: supplier payment phai la server API transaction, ghi expense/transaction/supplier debt va increment aggregate trong cung operation.

### P2 - Admin services/series/inventory product selectors con full catalog reads

- Evidence:
  - `src/app/admin/services/page.tsx` dung `useFirestoreCollection('services')` khong limit.
  - `src/components/admin/ProductSeriesManager.tsx` stream full `products`.
  - `src/app/admin/inventory/page.tsx` lazy `refreshProducts()` goi `getDocs(collection(db, 'products'))`.
- Impact: khi catalog tang, cac man hinh quan tri/danh muc va modal nhap kho co the cham, ton read lon va payload lon.
- Direction: them pagination/search API cho services/series/product selector; modal nhap kho chi load suggestions/IDs can thiet.

### P1 - Voucher code khong duoc enforce unique

- Evidence:
  - `src/app/admin/vouchers/page.tsx` tao voucher bang `addDoc(collection(db, 'vouchers'), ...)` va khong query/check duplicate code.
  - `src/app/api/vouchers/validate/route.ts`, `src/app/api/checkout/route.ts`, va `src/app/api/pos/checkout/route.ts` deu query `vouchers.where('code' == normalizedCode).where('isActive' == true).limit(1)`.
  - `src/lib/types/voucher.ts` comment `code` la unique nhung khong co invariant o Firestore rules/API.
- Impact: neu ton tai hai voucher active cung code, validate/checkout co the lay doc bat ky, ap dung nham value/ownerId/usageLimit va tang `usedCount` tren voucher khong dung.
- Direction: dua create/update voucher vao server API transaction, normalize code lam document ID hoac dung unique lock doc, reject duplicate va migration duplicate hien co.

### P1 - Idempotency guard khong dong bo giua cac API mutation

- Evidence:
  - `src/app/api/repairs/transition/route.ts`, `technician/assign`, `technician/transfer` da verify `type/referenceId/actorId` truoc khi cache hit.
  - `src/app/api/pos/checkout/route.ts` chi can completed + `referenceId`.
  - `src/app/api/inventory/import/route.ts`, `src/app/api/orders/transition/route.ts`, `src/app/api/repairs/handover/route.ts`, `src/app/api/repairs/payment-edit/route.ts` chi can `status=completed` roi return.
- Impact: neu client/retry dung lai key cho thao tac khac hoac target khac, API co the tra thanh cong gia, che loi version/business rule, hoac tra result khong khop thao tac hien tai.
- Direction: tao helper idempotency chung, moi op ghi/verify `type`, `referenceId`, `actorId`, action/target/payload hash khi can; key da dung sai thao tac phai reject.

### P1 - Initial-data Excel import order/repair khong the ghi qua client rules hien tai

- Evidence:
  - `src/app/admin/initial-data/page.tsx` van cung cap mode `order` va `repair` cho import du lieu lich su.
  - `src/components/admin/ExcelImportModal.tsx` trong `importLegacyOrderRow`/`importLegacyRepairRow` dung client `runTransaction` va `transaction.set` vao `orders/{id}`/`repairs/{id}`.
  - `firestore.rules` dang dat `orders.allow create: if false` va `repairs.allow create: if false`.
- Impact: bootstrap/import lich su don hang va phieu sua co the fail hang loat tren production, trong khi UI van bao day la workflow duoc ho tro. Neu mo rules lai de cho import thi se pha guard server-only cua order/repair.
- Direction: chuyen order/repair legacy import sang server API admin-only co validation/idempotency/audit, hoac route bootstrap server-only rieng; UI chi upload/preview va goi API.

### P2 - Admin vouchers doc 500 customers khi mo trang

- Evidence:
  - Anh debug ngay 2026-07-04 cho thay mo `/admin/vouchers` phat sinh `[FIRESTORE READ] getDocs: customers`, `So document doc (Reads): 500`.
  - Stack trace tro ve `src/app/admin/vouchers/DiscountRulesTab.tsx:477` va `:498`, component render tu `src/app/admin/vouchers/page.tsx`.
  - Code `loadTierCustomers()` query `customers` orderBy `totalSpent` va `limit(500)` de group preview thanh vien theo tier.
- Impact: vao trang quan ly voucher mac dinh bi ton 500 reads va latency khong lien quan den danh sach voucher; khi khach hang tang, chi phi/latency tang va dashboard Firestore bi nhieu noise.
- Direction: lazy-load tier customer preview chi khi user mo tab `discount-rules`/expand preview; UI can so luong khach theo hang phai doc aggregate/count doc rieng, khong dem bang query list. List preview chi la paged top customers limit nho.

## Data/Logic Conflicts With Roadmap

- Plan `plan_data_scale_performance_audit_20260622` dang danh dau tat ca phase `[x]`, nhung code hien tai van co cac pattern unbounded/realtime full collection o Products/Parts, Search API, POS repair lookup va Revenue fallback.
- `BUG-POS-013` da dong lock open/close cashier shift, nhung checkout chua su dung lock doc nen contract chua dong bo.
- `BUG-FIN-002` da ghi commission khong con transaction read-after-write, nhung helper van doc san pham/rule rieng va swallow error, tao debt moi ve do tin cay va hieu nang.
- Repair handover roadmap noi cho phep thu ngan dieu chinh phi/phu phi tai buoc hoan tat, nhung API hien tai khong nhan cac field do tu body.
- Firestore Rules khoa public read `orders`/`repairs`, nhung `/api/search` Admin SDK route dang mo lai duong doc public.
- Customer catalog public paths dang truyen raw product/service docs, trong khi schema product co field noi bo nhu costPrice/supplier/held.
- Inventory import UI gui `paid`, API/report lai dung `cash|bank|debt`; contract thanh toan nhap kho chua dong bo.
- Inventory import contract co `receipt.supplierId` nhung complete guard chi chap nhan supplier tung dong.
- Repair editor tach payment update va ho so update thanh hai write path, khong atomic.
- Supplier payment tao expenses nhung khong update revenue aggregates.
- Performance guard `limit + cursor` chua phu het services, series manager va product selector trong inventory.
- Voucher schema/roadmap noi `code` unique nhung create/update path khong enforce unique, con validate/checkout lay `limit(1)` khong deterministic.
- Operation idempotency da duoc tighten o mot so repair API nhung cac mutation API cu van cache-hit qua rong.
- Initial-data UI noi ho tro import order/repair lich su, nhung rules da chuyen order/repair thanh server-only collection nen client import path hien tai khong con hop dong.
- Vouchers page mac dinh nen chi doc voucher/config can thiet, nhung discount tier preview doc 500 customers tren luong vao trang.

## Proposed Fix Order

1. Instrument va toi uu `/api/pos/checkout`: cashier lock one-doc, remove duplicate commission product reads, cache/preload commission rules, batch doc reads.
2. Sua commission helper khong swallow error va them test.
3. Bound POS customer/repair lookup.
4. Refactor Products/Parts admin sang paginated bounded queries.
5. Tach public/admin `/api/search`: khoa leak order/repair truoc, sau do refactor sang indexed bounded search.
6. Lam revenue aggregate fallback thanh diagnostic/backfill flow.
7. Dong bo supplier payment/expenses write path ve server transaction.
8. Khoa public tracking bang rate-limit/proof va bound query.
9. Chuyen repair checklist/media patch sang API co version/audit.
10. Khoa public proxy/AI/OTP/products routes: proxy-image whitelist, AI room ownership, bounty OTP proof, products limit clamp.
11. Dua manual commission va fix-held vao server transaction/diagnostic an toan.
12. Sua collect-debt: them idempotency, merge debt orders theo customerId + phone legacy, reject khi payment khong phan bo het.
13. Tach refund/cancel flow cho order da Completed.
14. Sua repair handover payload/idempotency contract va verify phu phi ban giao.
15. Whitelist public catalog DTO va chuan hoa inventory import payment/supplier fallback.
16. Gom repair editor save ve server transaction duy nhat.
17. Dua supplier payment vao aggregate-aware server transaction.
18. Bo cac full catalog reads con lai o services/series/inventory selector.
19. Enforce voucher code uniqueness va migrate duplicate vouchers neu co.
20. Chuan hoa idempotency helper cho POS, inventory, orders va repair mutation APIs.
21. Chuyen initial-data order/repair Excel import sang server API bootstrap/admin-only.
22. Lazy-load hoac aggregate hoa customer tier preview trong admin vouchers de bo 500 reads khi mo trang.

## Verification Gates

- `corepack pnpm typecheck`
- Focused ESLint cho file touched.
- `git diff --check`
- POS browser smoke: ban hang thuong, thu no, voucher, repair payment, cashier shift open/close.
- Firebase read-count spot check truoc/sau cho POS checkout, POS lookup, Products, Parts, Search, Revenue.
- Rule/API audit: expenses write permission, public tracking, repair client patch.
