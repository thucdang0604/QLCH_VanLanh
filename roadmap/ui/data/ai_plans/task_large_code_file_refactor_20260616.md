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
- [x] Doi mutation phu hop sang repair API da co.
- [x] Focused ESLint pass cho buoc helper dau tien.
- [x] `pnpm typecheck` pass cho buoc helper dau tien.
- [x] Focused ESLint pass cho repairs feature components.
- [x] `pnpm typecheck` pass sau khi tach repairs UI.

## Phase 4: Technician page

- [x] Tach header/search/view toggle sang component rieng.
- [x] Tach workflow modals: chuyen KTV, confirm status, verify parts, tech note.
- [x] Tach ticket list/detail modal sau hon neu can tiep tuc giam complexity.
- [x] Giu transition/transfer qua API.
- [x] Focused ESLint pass.
- [x] `pnpm typecheck` pass.

## Phase 5: POS page

- [x] Tach POS shared types sang `src/features/pos/posTypes.ts`.
- [x] Tach cart panel/checkout sidebar sang `src/features/pos/PosCartPanel.tsx`.
- [x] Tach product grid/scanner/repair lookup hooks neu can giam tiep.
- [x] Focused ESLint pass.
- [x] `pnpm typecheck` pass.

## Final

- [x] Cap nhat walkthrough tong ket.
- [x] Chay verification tong hop neu cac phase deu sach.
