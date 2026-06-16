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
