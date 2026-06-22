# Plan: Data Scale, Search & Firebase Performance Audit - 2026-06-22

## Goal

Ghi nhan cac diem chua dong bo va cac query/write-path co nguy co cham, ton read/write Firebase khi du lieu tang theo thoi gian. Muc tieu la giu nghiep vu hien co, nhung dua cac man hinh admin/POS/revenue ve mo hinh:

- Danh sach lon phai co `limit + cursor`.
- Tim kiem phai doc dung tap du lieu can tim, khong tai ca collection ve client.
- Realtime chi dung cho hang doi dang thao tac, khong dung cho lich su/bao cao lon.
- Bao cao doanh thu/hoa hong/kho doc aggregate thay vi quet collection giao dich.
- Du lieu cu sai do bug truoc do phai co reconcile rieng, khong che dau bang UI.

## Audit Findings

### P0 - Inventory and stock screens still have unbounded source reads

- Evidence:
  - `src/app/admin/inventory/stock/page.tsx` doc toan bo `products`.
  - `src/app/admin/inventory/page.tsx` doc toan bo `import_receipts`.
  - `src/app/admin/inventory/page.tsx` doc toan bo `products`.
- Risk: khi so luong san pham, linh kien, phieu nhap va phieu de xuat tang, man hinh kho se cham va ton read nhieu nhat.
- Direction: chuyen danh sach kho/phieu nhap sang server API hoac query Firestore co `limit`, `orderBy`, filter theo tab/status va cursor.

### P0 - Revenue fallback still can scan many source collections

- Evidence: `src/app/admin/revenue/page.tsx` co fallback doc `orders`, `repairs`, `import_receipts`, `commissions`, `expenses` theo nhieu thang neu aggregate thieu/khong dung duoc.
- Risk: trang doanh thu bi cham, ton read lon va de phat sinh permission/index issue khi data cu ngay cang nhieu.
- Direction: aggregate ngay/thang phai la nguon chinh; neu aggregate thieu thi dung admin backfill/repair API, khong de client quet collection goc nhieu thang.

### P0 - Old POS debt-collection data may still pollute revenue

- Evidence: bug truoc do da tao order POS moi cho viec thu no don cu. Code moi da ghi lich su thanh toan vao don cu, nhung data da tao sai truoc do co the van ton tai.
- Risk: doanh thu va cong no khach hang co the sai neu cac order thu no cu van duoc tinh nhu doanh thu POS.
- Direction: tao reconcile script de tim order thu no cu, danh dau excluded/voided, cap nhat lai aggregate va tong no/tong chi tieu khach hang.

### P1 - Commissions screen reads broad collections

- Evidence: `src/app/admin/commissions/page.tsx` doc `commission_rules`, `commissions`, `users` rong, chua co phan trang/ky tinh luong.
- Risk: hoa hong tang theo moi don ban/sua chua, nen trang nay se cham theo thoi gian.
- Direction: loc theo thang/nhan vien/trang thai, phan trang, va them monthly aggregate cho view tong quan.

### P1 - POS search and barcode lookup still rely on multiple fallback queries

- Evidence: POS scan/tim kiem co nhieu query theo `sku`, `barcode`, `productCode`, `qrCodes`, kem fallback legacy.
- Risk: van chay duoc hien tai nhung khong toi uu cho luong hang lon va nhieu alias ma san pham.
- Direction: `product_code_registry/{code}` phai tro thanh lookup chinh mot doc, gom SKU/barcode/productCode/QR alias ve mot registry.

### P1 - Phone/IMEI search paths need bounded results

- Evidence: order/repair/appointment main list da co huong phan trang, nhung cac duong search theo SDT/IMEI co nguy co tra toan bo lich su cua mot khach quen.
- Risk: khach hang lau nam co nhieu don/phieu se lam search cham va ton read.
- Direction: search phai co `limit(50)`, `orderBy(createdAt desc)`, cursor "xem them", va uu tien exact ID/phone/IMEI truoc.

### P1 - Technician and repair active queues must query by workflow-actionable states

- Evidence: technician list co nguy co lay top records roi loc client-side; repairs can tach active vs terminal nhung can dam bao query chi lay tab dang thao tac.
- Risk: phieu da dong/cho ban giao van bi doc lai o man hinh thao tac, lam tang read va lam KTV bi nhieu nhieu.
- Direction: dung workflow Firebase de xac dinh state KTV can thao tac; terminal/closed tickets vao tab archive rieng va chi load khi mo tab.

### P2 - Customer activity/detail should not realtime-stream full history

- Evidence: customer drawer/activity hooks nghe order/repair/transaction theo khach hang.
- Risk: khach hang co lich su dai se lam popup chi tiet cham.
- Direction: chi realtime cac phieu/don dang mo; lich su da dong dung "recent 20" va "load more"; them customer activity summary neu can.

### P2 - Voucher/services/media selector reads need cache and central helpers

- Evidence: discount rule builder doc customer preview, services, media helper o nhieu noi; da co limit mot phan nhung con duplicate.
- Risk: khong nghiem trong bang inventory/revenue, nhung se tao do tre khi mo popup va kho maintain.
- Direction: cache services/media trong session, centralize media lookup/import helper, va chi doc active/minimal fields cho selector.

## Guardrails

- Khong thay doi nghiep vu thanh toan, cong no, voucher, kho neu chua co test bao ve.
- Moi phase phai co focused lint/typecheck va `git diff --check`.
- Cac thay doi query phai giu duong fallback an toan cho du lieu cu, nhung khong duoc dung fallback de che dau sai so doanh thu.
- Neu can them index Firestore/composite index, ghi ro trong walkthrough va deploy notes.

## Success Criteria

- Khong con `getDocs(collection(db, ...))` tren cac collection lon trong man hinh admin chinh neu khong co limit/filter hop ly.
- POS scan ma hang uu tien registry one-read path.
- Revenue ngay/thang doc aggregate trong normal path.
- Cac tab active/closed cua repair/technician doc dung tap phieu can thao tac.
- Co script/endpoint reconcile data thu no cu va backfill aggregate cho ngay bi anh huong.
