# Walkthrough: POS QR adjustments v2

**Status**: implemented-local

## Operator flow

### Create product or component

1. Open `/admin/products` or `/admin/parts`.
2. Create a new record.
3. Save. The system generates one code automatically: `SP-XXXXXXXX`, `PK-XXXXXXXX`, or `LK-XXXXXXXX`.
4. The generated code is shared by QR, barcode, and POS lookup. Admin users cannot add secondary codes.

### Restore hidden products

1. Open Smart Fix from `/admin/products` or `/admin/parts`.
2. Review products with missing or invalid taxonomy roots.
3. Select the correct configured retail or component category.
4. Save all changes in one batch.

### Scan at POS

1. Use a keyboard scanner, POS search box, manual code entry, or camera.
2. Keyboard scanners remain active while the POS search field is focused.
3. Camera scan recognizes QR and printed `CODE128` barcodes. It uses native `BarcodeDetector` when both formats are supported and ZXing multi-format fallback otherwise.

### Print product labels

1. Open the label action from a product or component row.
2. Choose `QR + barcode`, QR-only, or barcode-only.
3. Choose the matching paper preset and number of copies.
4. Print. QR and `CODE128` barcode contain the same single generated product code.

## Verification record

Baseline before fixes:

- `next typegen`: passed.
- `tsc --noEmit`: passed.
- focused ESLint: passed with 3 warnings.
- `next build`: passed with existing non-blocking warnings.
- `npm.cmd run migrate:inventory -- --help`: still fails because `scripts/migrate-active-orders.ts` is missing. This is an existing roadmap bug outside the POS QR patch.

Final local verification:

- Added `product_code_registry` transaction claims with legacy alias checks.
- Added QR initialization to manual create, Excel import, proposed-part create, and inventory completion.
- Smart Fix now derives choices from configured taxonomy and recomputes after async data load.
- Firestore rules now align inventory and repair catalog operations with least-required permissions.
- POS keyboard scan remains active in the search box and camera scan has ZXing fallback.
- Follow-up fix: phone camera scanning now recognizes printed `CODE128` labels through native multi-format detection or ZXing `BrowserMultiFormatReader`.
- Follow-up fix: stabilized the POS retail filter and camera callback lifecycle after a runtime report that camera repeatedly opened and closed with `Camera open failed: false`.
- Follow-up verification: focused POS ESLint, sequential `next typegen && tsc --noEmit`, and production `next build` passed. Build must run while the dev server is stopped because both commands write `.next`.
- Installed `@zxing/browser@0.2.0` with pnpm v10 to preserve the existing store layout.
- Added browser-side `CODE128` label rendering with `jsbarcode`, label-content modes, print quantity, and paper presets for compact, roll, and A4 printers.
- Changed new automatic QR codes to `SP-XXXXXXXX` for retail products, `PK-XXXXXXXX` for accessories, and `LK-XXXXXXXX` for components.
- Simplified labels and persistence to one system-generated code shared by QR, barcode, SKU aliases, and POS lookup. Removed admin custom-code and secondary-code management.
- `next typegen`: passed.
- `tsc --noEmit`: passed when run sequentially after type generation.
- focused ESLint: passed with zero warnings.
- `git diff --check`: passed.
- JSON parse for Firebase config and roadmap data: passed.
- `next build`: passed with existing non-blocking repository warnings.
- Local dev server: running at `http://localhost:3010`; HTTP `/admin/pos` returned `200`.
- Interactive browser click-through: not completed because the integrated browser failed to start in the Windows environment.

Residual manual checks:

- Deploy Firestore rules before testing QR registry writes.
- Test duplicate rejection against the real Firestore dataset.
- Test inventory-only and repair-only staff permissions.
- Test QR and printed `CODE128` labels through native and ZXing camera paths on target phones.
- Test printed `CODE128` recognition on each target scanner and confirm alignment on real paper stock.
