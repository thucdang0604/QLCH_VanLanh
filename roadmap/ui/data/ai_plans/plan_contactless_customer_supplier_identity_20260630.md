# Plan: CRM/NCC Contact Identity - Luu khach hang va nha cung cap khong co SDT

**ID**: `plan-contactless-customer-supplier-identity-20260630`
**Ngay**: 30.06.2026
**Trang thai**: planned
**Muc tieu**: Cho phep admin luu tru, tra cuu, ghi no, lien ket chat, tao POS/sua chua va import Excel cho khach hang/NCC khong co so dien thoai, nhung van giu duoc tinh toan ven du lieu va tuong thich du lieu cu.

## 1. Van de can giai quyet

He thong hien tai dang coi SDT la dinh danh chinh cua khach hang:

- `customers/{phone}` la document ID.
- Form khach hang bat buoc SDT va validate dinh dang dien thoai.
- POS/sua chua/cong no/thu no tra cuu bang `customer.phone` hoac `customer_info.phone`.
- Chat CRM linkage chi cho phep link khi co SDT.
- Excel Importer bat buoc cot `SDT` cho customer, order lich su va repair lich su.

Trong thuc te van hanh, co nhieu doi tuong hop le khong co hoac khong muon cung cap SDT:

- Khach quen chi lien he qua Zalo/Facebook.
- Khach sua may da quen mat, chi can ten + note noi bo.
- Nha cung cap nho le hoac nguoi quen chi giao dich qua chat.
- Du lieu cu import tu Excel co ten/kenh lien he nhung thieu SDT.

## 2. Quyet dinh thiet ke

### 2.1. Khong tao "SDT gia"

Khong luu Zalo/Facebook vao truong `phone` duoi dang `zalo-...` hoac `fb-...`.

Ly do:

- Lam hong validate dien thoai, click-to-call, OTP, voucher, tracking.
- Gay nham lan khi cac API cu goi `normalizeVietnamPhone`.
- Kho phan biet du lieu that/gia trong bao cao va doi soat.

### 2.2. Tach document ID khoi SDT

Them `customerId`/`supplierId` la khoa chinh on dinh. `phone` chi la mot contact method.

Giai doan dau phai backward-compatible:

- Khach cu `customers/{phone}` van giu doc ID cu.
- Khach moi khong co SDT dung ID tu dong, vi du `KH-000001` hoac `KH-[slug]-[suffix]`.
- Moi write path moi phai ghi `customerId`; moi read path moi uu tien `customerId`, fallback phone cho du lieu cu.

### 2.3. Chuan hoa `contactMethods`

Them cau truc chung cho customer va supplier:

```ts
type ContactMethodType = 'phone' | 'zalo' | 'facebook' | 'email' | 'address' | 'note' | 'other';

interface ContactMethod {
  type: ContactMethodType;
  label?: string;
  value: string;
  normalizedValue?: string;
  verified?: boolean;
  isPrimary?: boolean;
  source?: 'manual' | 'chat' | 'pos' | 'repair' | 'excel' | 'web';
}
```

## 3. Schema muc tieu

### 3.1. Customer

```ts
customers/{customerId} {
  id: string;
  code: string;
  legacyPhoneId?: string;
  phone?: string;
  primaryPhone?: string;
  name: string;
  type?: 'retail' | 'wholesale';
  primaryContactType?: ContactMethodType;
  primaryContactValue?: string;
  contactMethods: ContactMethod[];
  searchKeywords: string[];
  totalSpent?: number;
  totalOrders?: number;
  totalRepairs?: number;
  totalDebt?: number;
  tags?: string[];
  email?: string;
  address?: string;
  note?: string;
  createdAt;
  updatedAt;
}
```

### 3.2. Supplier

```ts
suppliers/{supplierId} {
  id: string;
  code: string;
  phone?: string;
  primaryPhone?: string;
  name: string;
  companyName?: string;
  contactPerson?: string;
  primaryContactType?: ContactMethodType;
  primaryContactValue?: string;
  contactMethods: ContactMethod[];
  searchKeywords: string[];
  taxCode?: string;
  bankAccount?: string;
  bankName?: string;
  totalDebt?: number;
  isActive: boolean;
  tags?: string[];
  note?: string;
  createdAt;
  updatedAt;
}
```

### 3.3. Order/Repair snapshot

Order va repair phai luu snapshot lien he tai thoi diem giao dich:

```ts
customer_info: {
  customerId?: string;
  name: string;
  phone?: string;
  contactType?: ContactMethodType;
  contactLabel?: string;
  contactValue?: string;
  email?: string;
  address?: string;
  note?: string;
}
```

## 4. Logic nghiep vu bi anh huong

### 4.1. Admin CRM

Files du kien:

- `src/lib/types/commerce.ts`
- `src/components/admin/customers/CustomerFormModal.tsx`
- `src/app/admin/customers/page.tsx`
- `src/components/admin/customers/CustomerDetailDrawer.tsx`
- `src/lib/useCustomerActivity.ts`

Thay doi:

- SDT khong con bat buoc.
- Bat buoc `name` va it nhat mot trong: phone, Zalo, Facebook, email, dia chi, note nhan dien.
- Neu co SDT thi normalize/validate va them vao `contactMethods`.
- Search phai tim theo `id/code/name/phone/primaryContactValue/contactMethods/searchKeywords/tags`.
- Detail/history uu tien `customerId`, fallback phone cho du lieu cu.

### 4.2. POS va cong no khach hang

Files du kien:

- `src/app/admin/pos/page.tsx`
- `src/features/pos/PosCartPanel.tsx`
- `src/app/api/pos/checkout/route.ts`
- `src/app/api/admin/customers/collect-debt/route.ts`

Quy tac moi:

- Ban tien mat cho khach vang lai: khong can customer profile.
- Ghi no, tra sau, thanh toan thieu, hoac can tien du de tra no cu: bat buoc co `customerId`.
- `customerId` phai tro toi profile co it nhat mot contact method du ro rang.
- Customer ledger va customer transaction phai dung `customerId`, khong dung phone lam khoa chinh.
- Thu no don cu query theo `customer_info.customerId`; fallback `customer_info.phone` chi cho du lieu legacy.

### 4.3. Sua chua va bao hanh

Files du kien:

- `src/app/admin/repairs/page.tsx`
- `src/features/repairs/RepairEditorModal.tsx`
- `src/app/api/repairs/handover/route.ts`
- `src/features/repairs/RepairPrintTemplates.tsx`
- `src/components/admin/PrintableWarranty.tsx`

Thay doi:

- Cho tao phieu sua voi khach khong co SDT neu co contact method khac.
- Lookup khach khong chi theo phone; can search/select customer profile.
- Repair ticket luu `customer.id/customerId` va snapshot contact.
- In phieu/bao hanh hien "Lien he" thay vi chi "Dien thoai" khi khong co SDT.
- Handover aggregate vao `customers/{customerId}`; fallback phone cho ticket cu.

### 4.4. Chat/Facebook/Zalo linkage

Files du kien:

- `src/app/admin/chat/page.tsx`
- `src/components/admin/chat/ChatCustomerProfileModal.tsx`
- `src/components/admin/chat/ChatCustomerActivityPanel.tsx`
- `src/app/api/admin/chat/rooms/[roomId]/customer/route.ts`
- `src/lib/realtimedb.ts`
- `src/lib/chatWorkflowHandoff.ts`

Thay doi:

- Link chat room voi customer khong can phone.
- `roomId`, Facebook PSID/profile URL, Zalo label duoc luu trong `contactMethods`.
- RTDB room info luu `customerId`, `customerName`, `customerPhone?`, `primaryContactType`, `primaryContactValue`.
- Handoff sang POS/Repair truyen `customerId`; phone chi la optional snapshot.

### 4.5. NCC va nhap kho

Files du kien:

- `src/app/admin/suppliers/page.tsx`
- `src/lib/supplierDocumentIds.ts`
- `src/features/parts/ImportReceiptModals.tsx`
- `src/app/admin/inventory/page.tsx`
- `src/app/api/inventory/import/route.ts`

Thay doi:

- NCC tiep tuc dung `supplierId`, phone optional.
- Them `contactMethods` va `searchKeywords`.
- Tao NCC inline trong phieu nhap can cho phep them Zalo/Facebook/note neu khong co phone.
- Cong no NCC van dung `supplierId`; khong co thay doi dong tien, chi thay doi profile/contact.

### 4.6. Web customer public

Files lien quan:

- `src/app/api/checkout/route.ts`
- `src/app/api/appointments/route.ts`
- `src/app/api/tracking/route.ts`
- `src/app/api/bounty/*`
- `src/app/api/vouchers/validate/route.ts`

Quyet dinh:

- Giai doan nay chua noi long web public.
- Web checkout, OTP voucher, bounty va tracking cong khai van co the tiep tuc bat buoc SDT vi can xac minh phone ownership.
- Chi can dam bao khi ghi customer profile thi them `contactMethods` va `customerId` tuong thich schema moi.

## 5. Excel Importer

Files du kien:

- `src/features/excel-import/importSupport.ts`
- `src/components/admin/ExcelImportModal.tsx`
- `src/components/admin/excelImportTemplateFixtures.ts`
- `src/app/admin/initial-data/page.tsx`

### 5.1. Template moi

Khach hang:

```text
Ma KH, Ten KH, SDT, Zalo, Facebook, Email, Dia chi, Kenh lien he chinh, Loai KH, Tags, Chi tieu, Don hang, Sua chua, Cong no, Ghi chu
```

NCC:

```text
Ma NCC, Ten NCC, SDT, Zalo, Facebook, Nguoi lien he, Email, Dia chi, Cong ty, Phan loai, Ma so thue, So tai khoan, Ngan hang, Han thanh toan, Phu trach, Tags, Cong no, Ghi chu
```

Pham vi NCC import:

- Chi import ho so NCC va so cong no con sot lai tu he thong cu.
- Khong import lich su nhap hang tu NCC. Ton kho ban dau da duoc khai bao truc tiep khi import san pham, phu kien va linh kien; neu tao them phieu nhap hang lich su se lam trung ton kho, roi gia von va roi doi soat cong no.
- Neu can giu vet NCC cu, dung `Ghi chu`, `Cong no`, `So tai khoan`, `Nguoi lien he`, `Zalo`, `Facebook`; khong tao `import_receipts` lich su.

Don hang cu:

```text
Ma don, Ma KH, Ten KH, SDT, Zalo, Facebook, Email, Dia chi, San pham, So luong, Don gia, Tong tien, Thanh toan, Phuong thuc, Ngay tao, Ghi chu
```

Phieu sua cu:

```text
Ma phieu, Ma KH, Ten KH, SDT, Zalo, Facebook, Thiet bi, IMEI/Serial, Loi/Benh, Tong tien, Thanh toan, Trang thai, Ngay nhan, Ghi chu
```

### 5.2. Quy tac validate preview

Khach hang/NCC:

- Ten bat buoc.
- SDT optional; neu co thi phai co 9-15 chu so sau normalize.
- It nhat mot kenh lien he hoac ghi chu nhan dien.
- Neu co cong no khac 0 thi bat buoc co kenh lien he ro rang, khong chi duoc de ten chung chung.
- Check duplicate trong file theo thu tu uu tien:
  1. Ma KH/Ma NCC.
  2. SDT normalized.
  3. Zalo/Facebook normalized.
  4. Ten + cong ty/ghi chu canh bao, khong auto block neu khong chac.

Order/repair lich su:

- Neu co `Ma KH`: link theo `customerId`.
- Neu khong co `Ma KH` nhung co SDT: link/create customer theo phone legacy.
- Neu khong co SDT nhung co Zalo/Facebook: tao/link customer khong SDT.
- Neu payment/debt phat sinh ma khong co contact method: error block import.
- Neu khong co debt va contact yeu: warning, cho import neu admin xac nhan.

### 5.3. Import write logic

- Customer import tao `customers/{customerId}` va `customer_transactions` neu co cong no dau ky.
- Supplier import tao `suppliers/{supplierId}` va `supplier_transactions` neu co cong no dau ky.
- Legacy order import luu `customer_info.customerId` va snapshot contact.
- Legacy repair import luu `customer.id`/`customerId` va snapshot contact.
- Aggregate customer dung `customerId`; phone chi la field snapshot/fallback.

## 6. Migration va backward compatibility

Migration khong duoc bat buoc doi doc ID ngay lap tuc.

Buoc 1:

- Backfill doc cu `customers/{phone}`:
  - `id = phone`
  - `code = phone`
  - `legacyPhoneId = phone`
  - `primaryPhone = phone`
  - `contactMethods = [{ type: 'phone', value: phone, normalizedValue: phone, isPrimary: true, source: 'migration' }]`
  - `searchKeywords`

Buoc 2:

- Moi write path moi ghi `customerId`.
- Moi read path moi uu tien `customerId`, fallback phone.

Buoc 3:

- Sau khi e2e on dinh, can nhac doi sang ID sequence `KH-*` cho tat ca customer moi; khong can rewrite customer cu neu rui ro cao.

## 7. Verification plan

Automated:

- `node scripts/ai-guard.mjs`
- `corepack pnpm lint`
- `corepack pnpm typecheck`
- Targeted tests cho contact helper, Excel validation va POS checkout debt guard neu co test harness.

Manual:

- Tao khach khong SDT bang CRM voi Zalo.
- Tao NCC khong SDT voi Facebook/note.
- POS ban tien mat cho khach khong SDT.
- POS ghi no cho khach khong SDT nhung co Zalo/Facebook.
- Thu no khach qua `customerId`.
- Tao phieu sua va in phieu cho khach khong SDT.
- Link chat room vao customer khong SDT va handoff sang POS/Repair.
- Import Excel customer/NCC khong SDT.
- Import order/repair lich su voi `Ma KH` nhung khong co SDT.
- Import co cong no nhung khong co bat ky contact method nao phai bi chan.
- Du lieu cu theo phone van doc duoc trong CRM, POS, repair, collect debt.

## 8. Rui ro va guardrails

- Khong gom phone/contact migration voi thay doi dong tien lon trong cung commit neu co the tach duoc.
- Moi thay doi lien quan cong no phai dung Firestore transaction.
- Khong bo fallback phone cho du lieu cu cho den khi co migration report day du.
- Khong noi long OTP/voucher/tracking public trong phase dau.
- Khong dung `name` lam khoa duy nhat vi khach/NCC trung ten la binh thuong.
