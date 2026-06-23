# Plan: Refactor cac file code lon theo phase

## Muc tieu

Giam rui ro bao tri trong cac file UI/logic dang qua lon bang cach tach theo workflow nghiep vu, giu nguyen hanh vi hien co va verify sau tung phase.

## Pham vi uu tien

1. `src/components/admin/ExcelImportModal.tsx`
2. `src/app/admin/parts/page.tsx`
3. `src/app/admin/repairs/page.tsx`
4. `src/app/admin/technician/page.tsx`
5. `src/app/admin/pos/page.tsx`

## Nguyen tac

- Khong tach co hoc theo so dong; tach theo boundary: pure logic, hook data, mutation service/API, va UI component.
- Moi phase phai co verification rieng truoc khi sang phase tiep theo.
- Uu tien dua business mutation ve API/service da co thay vi tao logic song song trong client page.
- Voi repair/POS/inventory, giu canh bao rui ro cao cho trang thai phieu, ton kho, cong no va thanh toan.
- Khi tach component React, tranh tao inline component moi trong component cha; giu props ro rang va typed.

## Phase 1: Excel import logic

Tach logic thuần cua `ExcelImportModal` sang `src/features/excel-import/`:

- `types.ts`: type dung chung cho import mode, row, check, media requirement.
- `modeConfig.ts`: cau hinh mode product/accessory/part/service.
- `excelImportUtils.ts`: parse number/text/spec/category/image helpers.
- `template.ts`: tao workbook template va guide sheet.
- `importClient.ts`: cac thao tac Firestore/Storage/client import helper.

Verification sau phase:

- `pnpm exec eslint src/components/admin/ExcelImportModal.tsx src/features/excel-import --max-warnings=0`
- `pnpm typecheck`

## Phase 2: Parts/import receipts

Tach `src/app/admin/parts/page.tsx` theo sub-flow:

- hook doc/import receipt: `useImportReceipts`
- component danh sach linh kien: `PartsTable`
- component proposal/ordered receipts
- modal import preview/create receipt
- mutation order/final import/availability goi `/api/inventory/import`

Verification sau phase:

- focused ESLint cho `src/app/admin/parts/page.tsx` va `src/features/parts`
- `pnpm typecheck`
- smoke logic import receipt neu co test san

## Phase 3: Repairs manager

Tach `src/app/admin/repairs/page.tsx` theo workflow:

- hook load/filter/pagination tickets
- table/list va stats component
- form modal, print modal, handover modal, warranty modal
- mutation transition/handover/assign/override uu tien API route da co

Verification sau phase:

- focused ESLint cho repairs files
- `pnpm typecheck`
- repair workflow tests hien co

## Phase 4: Technician workspace

Tach `src/app/admin/technician/page.tsx`:

- ticket query/filter hook
- ticket list/detail
- parts verification modal
- transfer modal
- checklist/history helpers

Verification sau phase:

- focused ESLint cho technician files
- `pnpm typecheck`
- repair access/workflow tests hien co

## Phase 5: POS workspace

Tach `src/app/admin/pos/page.tsx`:

- `usePosProducts`
- `useCart`
- `useBarcodeScanner`
- product grid
- cart panel
- repair lookup panel

Verification sau phase:

- focused ESLint cho POS files
- `pnpm typecheck`
- POS checkout/API tests neu co, hoac smoke checkout route bang build/typecheck

## Definition of done

- Page/container con lai doc duoc, tap trung orchestration.
- Pure helpers co the test rieng.
- Khong lam thay doi schema Firestore neu khong can.
- Khong them lint suppression moi de che loi type.
- Roadmap task/walkthrough duoc cap nhat sau moi phase.
