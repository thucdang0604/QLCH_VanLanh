# Walkthrough: Refactor cac file code lon theo phase

## 2026-06-16

- Bat dau tren branch `codex/refactor-large-code-files`.
- Working tree ban dau sach.
- Phan tich 5 file lon nhat dang duoc Git theo doi:
  - `src/app/admin/repairs/page.tsx` - 2510 dong
  - `src/app/admin/parts/page.tsx` - 1910 dong
  - `src/app/admin/technician/page.tsx` - 1698 dong
  - `src/app/admin/pos/page.tsx` - 1681 dong
  - `src/components/admin/ExcelImportModal.tsx` - 1545 dong
- Quyet dinh thuc hien Phase 1 voi `ExcelImportModal` truoc vi co nhieu pure helper co the tach va verify doc lap.

## Verification log

- Phase 1:
  - Tach support layer cua `src/components/admin/ExcelImportModal.tsx` sang `src/features/excel-import/importSupport.ts`.
  - `ExcelImportModal.tsx` giam tu 1545 dong xuong khoang 805 dong.
  - Focused ESLint pass voi `--max-warnings=0` cho Excel import va cac type blocker lien quan.
  - `pnpm typecheck` pass sau khi sua cac baseline type blocker trong POS/inventory/handover.
- Phase 2:
  - Tach import receipt types/helper sang `src/features/parts/importReceiptTypes.ts` va `src/features/parts/importReceiptUtils.ts`.
  - Tach `ImportPreviewModal` va `CreateReceiptModal` sang `src/features/parts/ImportReceiptModals.tsx`.
  - `src/app/admin/parts/page.tsx` giam tu khoang 1910 dong xuong khoang 1195 dong.
  - Bo sung cap nhat `lastImportLots` khi final import sinh batch lots de nut in lai dung du lieu moi nhat.
  - Focused ESLint pass voi `--max-warnings=0` cho `parts/page.tsx` va `src/features/parts/*`.
  - `pnpm typecheck` pass.
  - `pnpm lint` pass exit code 0; con 44 warnings no cu o roadmap scripts, repairs, technician, bank settings.
- Phase 3:
  - Commit checkpoint Phase 1-2: `09eefbff refactor: split import and parts workflows`.
  - Bat dau tach `src/app/admin/repairs/page.tsx` bang helper/type thuan trong `src/features/repairs/repairPageUtils.ts`.
  - Tach stats grid sang `src/features/repairs/RepairStatsGrid.tsx`.
  - Focused ESLint pass voi `--max-warnings=0` cho `repairs/page.tsx`, `repairPageUtils.ts`, va `RepairStatsGrid.tsx`.
  - `pnpm typecheck` pass.
  - Tiep tuc giam `src/app/admin/repairs/page.tsx` tu khoang 2447 dong sau buoc dau xuong 1456 dong.
  - Tach filters, header, pagination/load-more, media managers, print templates, editor modal, detail modal, handover modal, warranty modal va auxiliary modals sang `src/features/repairs/`.
  - Sua lai dependency hook thay cho disable comment cu bi xoa khi don page.
  - Focused ESLint pass voi `--max-warnings=0` cho `repairs/page.tsx` va toan bo `src/features/repairs/*`.
  - `pnpm typecheck` pass sau refactor UI repairs.
  - `pnpm lint` pass exit code 0; con 36 warnings no cu o roadmap scripts, technician, bank settings va proxy-image.
- Phase 4:
  - Commit checkpoint Phase 3: `462676a9 refactor: split repairs workflow UI`.
  - Tach `TechnicianPageHeader` sang `src/features/technician/TechnicianPageHeader.tsx`.
  - Tach cac modal workflow cua technician sang `src/features/technician/TechnicianWorkflowModals.tsx`: chuyen KTV, confirm status, verify parts, tech note.
  - Giu cac luong transition/transfer/confirm parts qua API hien co trong `src/app/admin/technician/page.tsx`.
  - Don warnings cu trong `technician/page.tsx` va giam file tu khoang 1698 dong xuong 1452 dong.
  - Focused ESLint pass voi `--max-warnings=0` cho `technician/page.tsx` va `src/features/technician/*`.
  - `pnpm typecheck` pass.
  - `pnpm lint` pass exit code 0; con 31 warnings no cu ngoai Phase 4.
- Phase 5:
  - Commit checkpoint Phase 4: `e91fdaef refactor: split technician workflow UI`.
  - Tach shared POS types sang `src/features/pos/posTypes.ts`.
  - Tach cart panel/checkout sidebar sang `src/features/pos/PosCartPanel.tsx`.
  - Giu checkout, voucher, repair lookup va scanner logic trong `src/app/admin/pos/page.tsx`.
  - Giam `src/app/admin/pos/page.tsx` tu khoang 1689 dong xuong 1361 dong.
  - Focused ESLint pass voi `--max-warnings=0` cho `pos/page.tsx` va `src/features/pos/*`.
  - `pnpm typecheck` pass.
  - `pnpm lint` pass exit code 0; con 31 warnings no cu ngoai Phase 5.
