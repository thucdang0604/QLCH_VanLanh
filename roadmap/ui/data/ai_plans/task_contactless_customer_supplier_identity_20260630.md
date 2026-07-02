# Task: CRM/NCC Contact Identity - Khach hang va NCC khong co SDT

**Plan**: `plan-contactless-customer-supplier-identity-20260630`
**Trang thai**: planned
**Ngay tao**: 30.06.2026

## Phase 0 - Chot contract va helper dung chung

- [x] Tao type dung chung `ContactMethod` va `ContactMethodType`.
- [x] Mo rong `Customer`, `CustomerInfo`, `CustomerTransaction` de ho tro `customerId`, `primaryContact*`, `contactMethods`.
- [x] Mo rong `Supplier` de ho tro `primaryContact*`, `contactMethods`, `searchKeywords`.
- [x] Tao helper build/normalize contact:
  - [x] Normalize phone neu co.
  - [x] Normalize Zalo/Facebook/email.
  - [x] Build primary contact.
  - [x] Build search keywords.
  - [x] Validate "co cach lien he du ro rang" cho cong no.
- [x] Tao helper generate base ID khong dung SDT va khong them Firestore read.
- [x] Tao helper reserve `customerId` co kiem tra trung lap khi bat dau sua write path.

## Phase 1 - Backward-compatible CRM

- [x] Sua `CustomerFormModal`: SDT optional, them contact method Zalo/Facebook/Khac.
- [x] Sua `customers/page.tsx`: tao doc bang `customerId`, khong dung `phone` lam doc ID cho khach moi khong SDT.
- [x] Sua search/filter CRM theo `customerId`, `phone`, `primaryContactValue`, `searchKeywords`, `tags`.
- [x] Sua customer detail/history de uu tien `customerId`, fallback phone.
- [x] Cap nhat export CRM them Ma KH va contact chinh.

## Phase 2 - POS, thu no va customer ledger

- [x] Sua POS state/UI de chon hoac tao customer khong SDT.
- [x] Sua handoff vao POS de nhan `customerId` va contact snapshot.
  - [x] POS nhan `customerId` tu chat handoff va repair handoff co san.
  - [x] Chat/repair handoff truyen day du contact snapshot Zalo/Facebook/khac.
- [x] Sua `/api/pos/checkout`:
  - [x] Nhan `customer_info.customerId`.
  - [x] Tao/update customer theo `customerId`.
  - [x] Debt/partial payment guard dung `customerId + contactMethods`, khong bat buoc phone.
  - [x] Ghi `customer_ledger` va `customer_transactions` theo `customerId`.
- [x] Sua `/api/admin/customers/collect-debt`:
  - [x] Query don no theo `customer_info.customerId`.
  - [x] Fallback query theo `customer_info.phone` cho du lieu cu.
  - [x] Ghi transaction va revenue aggregate khong phu thuoc phone.
- [x] Kiem tra lai cashier shift/revenue path khong bi lech do `customerId`.

## Phase 3 - Repair, warranty va in phieu

- [x] Sua form repair de co customer selector/search khong chi phone.
- [x] Cho tao repair ticket voi contact Zalo/Facebook/note neu khong co phone.
- [x] Luu `customer.id`/`customerId` va contact snapshot tren repair ticket.
- [x] Sua `/api/repairs/handover` aggregate vao `customers/{customerId}`.
- [x] Sua print/warranty template hien "Lien he" khi khong co SDT.
- [x] Giu fallback phone cho repair ticket cu.

## Phase 4 - Chat CRM linkage

- [x] Sua `ChatCustomerProfileModal` cho phep tao/link customer khong phone.
- [x] Sua `/api/admin/chat/rooms/[roomId]/customer`:
  - [x] GET/POST theo `customerId` hoac contact token.
  - [x] Khong reject khi phone trong.
  - [x] Luu room/platform identity vao `contactMethods`.
- [x] Sua RTDB room info: `customerId`, `customerName`, `customerPhone?`, `primaryContactType`, `primaryContactValue`.
- [x] Sua `ChatCustomerActivityPanel` dung `customerId`, fallback phone.
- [x] Sua handoff chat -> POS/Repair truyen `customerId`.
  - [x] Chat modal/build URL truyen `customerId`.
  - [x] Repair intake doc query tieu thu `handoffCustomerId`.

## Phase 5 - Suppliers va nhap kho

- [x] Sua `suppliers/page.tsx` them contactMethods; phone optional.
- [x] Sua `supplierDocumentIds.ts` de uu tien `Ma NCC`, taxCode/bankAccount/contact slug, khong phu thuoc phone.
- [x] Sua tao NCC inline trong inventory/import receipt de cho nhap contact khong phone.
- [x] Dam bao supplier debt/import transaction van dung `supplierId`.
- [x] Cap nhat search NCC theo `searchKeywords`, contact, taxCode, bankAccount.

## Phase 6 - Excel Importer

- [x] Cap nhat `MODE_CONFIG.customer`:
  - [x] Bo `SDT` khoi required headers.
  - [x] Them `Ma KH`, `Zalo`, `Facebook`, `Kenh lien he chinh`.
- [x] Cap nhat `MODE_CONFIG.supplier`:
  - [x] Them `Ma NCC`, `Zalo`, `Facebook`.
  - [x] Giu phone optional.
- [x] Ghi ro guardrail: NCC import chi gom ho so/cong no con sot, khong import lich su nhap hang tu NCC vi ton kho da nhap trong product/accessory/part.
- [x] Cap nhat template fixtures cho customer/supplier/order/repair co dong mau khong SDT.
- [x] Cap nhat preview validation:
  - [x] SDT optional nhung validate neu co.
  - [x] Contact method bat buoc neu co cong no.
  - [x] Duplicate detection theo Ma, phone, Zalo/Facebook.
- [x] Cap nhat `resolveTargetDocId` cho customer khong SDT.
- [x] Sua `importCustomerRow` dung `customerId/contactMethods`.
- [x] Sua `importSupplierRow` dung `supplierId/contactMethods`.
- [x] Sua `importLegacyOrderRow` dung `Ma KH` hoac tao/link customer khong SDT.
- [x] Sua `importLegacyRepairRow` dung `Ma KH` hoac tao/link customer khong SDT.
- [x] Cap nhat `/admin/initial-data` mo ta cot va huong dan import.

## Phase 7 - Migration va guardrails

- [ ] Viet backfill script dry-run cho `customers/{phone}` them id/code/primaryPhone/contactMethods/searchKeywords.
- [ ] Chay dry-run va ghi report so doc bi thieu phone/contact.
- [ ] Chay migration thuc te sau khi backup/confirm.
- [ ] Cap nhat Firestore rules neu schema moi can field-level guard.
- [ ] Giu fallback phone cho read path cho den khi co report du lieu cu on dinh.

## Phase 8 - Verification

- [ ] Automated: `node scripts/ai-guard.mjs`.
- [ ] Automated: `corepack pnpm lint`.
- [ ] Automated: `corepack pnpm typecheck`.
- [ ] Manual: CRM tao khach khong SDT.
- [ ] Manual: NCC tao khong SDT.
- [ ] Manual: POS ban tien mat cho khach khong SDT.
- [ ] Manual: POS ghi no cho khach co Zalo/Facebook nhung khong phone.
- [ ] Manual: Thu no khach bang `customerId`.
- [ ] Manual: Repair ticket va in phieu cho khach khong SDT.
- [ ] Manual: Link chat room vao customer khong SDT va handoff sang POS/Repair.
- [ ] Manual: Import Excel customer/NCC/order/repair khong SDT.
- [ ] Manual: Import co cong no nhung khong contact bi chan.
- [ ] Manual: Du lieu cu theo phone van doc duoc.

## Acceptance criteria

- [ ] Khach hang moi khong SDT co the duoc luu, tim kiem, cap nhat va xem lich su.
- [ ] NCC moi khong SDT co the duoc luu, tim kiem, gan vao phieu nhap va ghi cong no.
- [ ] Ghi no khach hang khong phu thuoc SDT, nhung khong cho ghi no khi khong co contact method ro rang.
- [ ] Excel Importer khong con bat buoc SDT cho customer/NCC/order/repair noi bo.
- [ ] Web public OTP/voucher/tracking khong bi noi long ngoai y muon.
- [ ] Tat ca write path moi ghi `customerId`/`supplierId`; phone chi la optional contact/snapshot.
