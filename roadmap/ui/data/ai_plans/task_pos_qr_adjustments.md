# Task: POS QR adjustments v2

## Phase 1 - Roadmap and design

- [x] Review latest implementation against live checkout.
- [x] Run baseline typecheck and production build.
- [x] Document findings and remediation design.

## Phase 2 - Unique code registry

- [x] Add `product_code_registry` helper with legacy alias checks.
- [x] Claim and release registry entries in Firestore transactions.
- [x] Integrate manual product create/edit.
- [x] Integrate QR manager save.
- [x] Integrate Excel product import.
- [x] Add Firestore rules.

## Phase 3 - Creation-flow coverage

- [x] Initialize `qrCodes` for manual product create.
- [x] Initialize `qrCodes` for Excel product import.
- [x] Assign codes to proposed parts created from inventory and technician flows.
- [x] Backfill missing aliases when proposed products become active inventory.
- [x] Fix Excel inventory log `productId`.

## Phase 4 - Smart Fix

- [x] Recompute modal state after async product load.
- [x] Detect invalid taxonomy roots.
- [x] Build choices from configured retail and component taxonomy.
- [x] Save real taxonomy root IDs and `updatedAt`.

## Phase 5 - POS and permission alignment

- [x] Permit inventory and repair workflows to write required product records.
- [x] Permit equivalent registry writes.
- [x] Handle keyboard-scanner input while POS search is focused.
- [x] Add camera decode fallback when native `BarcodeDetector` is unavailable.
- [x] Prevent camera stream restart loops caused by unstable product-filter dependencies.
- [x] Ignore stale camera-open rejection after scanner cleanup.

## Phase 5b - Barcode label printing

- [x] Add browser-side `CODE128` generation with `jsbarcode`.
- [x] Add label modes for combined QR and barcode, QR-only, and barcode-only printing.
- [x] Add paper presets for compact label printers, roll printers, and A4 grid printing.
- [x] Add copy-count selection before opening the browser print dialog.

## Phase 6 - Verification

- [x] Run `next typegen`.
- [x] Run `tsc --noEmit`.
- [x] Run focused ESLint.
- [x] Run production `next build`.
- [x] Parse JSON configs.
- [x] Record residual manual checks.

## Residual manual checks after rules deploy

- [ ] Create retail, accessory and component products on a real Firestore project.
- [ ] Confirm duplicate rejection through create, QR manager and Excel import.
- [ ] Verify inventory-only staff can maintain QR and run Smart Fix from `/admin/parts`.
- [ ] Verify repair-only staff can create proposed components but cannot edit existing catalog records.
- [ ] Verify camera scan on target phones with native and ZXing fallback paths.
- [ ] Test printed barcode recognition on each target scanner model.
- [ ] Confirm label alignment on the actual printer and paper stock.
