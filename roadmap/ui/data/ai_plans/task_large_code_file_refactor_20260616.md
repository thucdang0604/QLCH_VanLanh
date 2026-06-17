# Task: Refactor cac file code lon theo phase

## Phase 0: Roadmap

- [x] Luu plan vao `roadmap/ui/data/ai_plans/plan_large_code_file_refactor_20260616.md`.
- [x] Tao checklist phase trong file task nay.
- [x] Dang ky plan vao `roadmap/ui/data/manifest.json`.

## Phase 1: ExcelImportModal

- [x] Tao `src/features/excel-import/`.
- [x] Tach type/import mode config ra file rieng.
- [x] Tach helper parse/validate/template/import client ra module rieng.
- [x] Cap nhat `ExcelImportModal.tsx` chi con orchestration UI.
- [x] Focused ESLint pass.
- [x] `pnpm typecheck` pass.

## Phase 2: Parts page

- [x] Tach import receipt hooks/components.
- [x] Doi mutation phu hop sang API `/api/inventory/import`.
- [x] Focused ESLint pass.
- [x] `pnpm typecheck` pass.

## Phase 3: Repairs page

- [x] Tach type/helper thuan sang feature module.
- [x] Tach stats grid sang component rieng.
- [x] Tach filters va pagination/media/header UI sang component rieng.
- [x] Tach editor/detail/handover/warranty/auxiliary/print UI sang component rieng.
- [ ] Doi mutation phu hop sang repair API da co.
- [x] Focused ESLint pass cho buoc helper dau tien.
- [x] `pnpm typecheck` pass cho buoc helper dau tien.
- [x] Focused ESLint pass cho repairs feature components.
- [x] `pnpm typecheck` pass sau khi tach repairs UI.

## Phase 4: Technician page

- [ ] Tach ticket list/detail va modal phu tung/chuyen giao.
- [ ] Giu transition/transfer qua API.
- [ ] Focused ESLint pass.
- [ ] `pnpm typecheck` pass.

## Phase 5: POS page

- [ ] Tach product/cart/scanner/repair lookup hooks.
- [ ] Tach product grid va cart panel.
- [ ] Focused ESLint pass.
- [ ] `pnpm typecheck` pass.

## Final

- [ ] Cap nhat walkthrough tong ket.
- [ ] Chay verification tong hop neu cac phase deu sach.
