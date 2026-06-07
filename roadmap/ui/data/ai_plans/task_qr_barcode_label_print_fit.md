# Task: QR/Barcode Label Print Fit Optimization

## Phase 1 - Context and Baseline

- [x] Read `roadmap/ai/master.md`.
- [x] Read mandatory roadmap rules in `roadmap/ai/AI_readme.md`.
- [x] Check `roadmap/ui/data/source_intelligence.json`.
- [x] Review existing POS QR plan and walkthrough.
- [x] Inspect current `ProductQrLabelModal.tsx` print CSS.

## Phase 2 - Print Fit Implementation

- [x] Add smaller paper presets: `30x20`, `40x20`, `40x25`.
- [x] Add custom paper width/height input in millimeters.
- [x] Add text density modes: `Tên ngắn`, `Chỉ mã`, `Tên + giá`.
- [x] Add configured shop name as the top brand line on each printed label.
- [x] Add content scale control for QR/barcode/text.
- [x] Add safe margin control to shrink printable label bounds.
- [x] Add `1 tem/dòng` / `2 tem/dòng` layout for physical two-up label stock.
- [x] Interpret quantity as row count when `2 tem/dòng` is selected so one row prints two labels.
- [x] Add column-gap control for the physical gap between two labels.
- [x] Add compact barcode alias for small label printing.
- [x] Include compact barcode alias in POS scan candidates.
- [x] Keep QR on the generated product code while allowing compact barcode alias for small labels.

## Phase 3 - Roadmap Recording

- [x] Create plan file.
- [x] Create task file.
- [x] Create walkthrough file.
- [x] Register plan in `roadmap/ui/data/manifest.json`.
- [x] Update `roadmap/ai/dashboard.md`.
- [x] Update `roadmap/ai/modules/pos-orders.md`.
- [x] Update `roadmap/ui/data/source_intelligence.json` changelog.

## Phase 4 - Verification

- [x] Run focused ESLint on `ProductQrLabelModal.tsx`.
- [x] Run `tsc --noEmit`.
- [x] Parse updated JSON roadmap files.
- [x] Run `git diff --check`.
- [ ] Manual print alignment on real paper stock.
- [ ] Scanner recognition test on target devices after physical print.

## Residual Manual Checks

- [ ] Confirm exact physical paper size and set custom width/height if no preset matches.
- [ ] Print `QR + Barcode` with `Chỉ mã` on the smallest stock.
- [ ] Print `2 tem/dòng` on the two-up stock shown in the user's photo.
- [ ] Print `Tên ngắn` on the daily-use stock.
- [ ] Scan printed `CODE128` using the shop scanner.
- [ ] Scan printed QR and barcode with POS camera fallback.
