# Plan: POS QR adjustments v2

**ID**: `plan-pos-qr-adjustments`
**Date**: 31.05.2026
**Status**: implemented-local

## Goal

Close the operational gaps found after the first POS QR rollout:

1. A product code must resolve to exactly one product.
2. Every newly created retail product, accessory, or component must receive a usable QR code.
3. Smart Fix must restore products using the real configured taxonomy.
4. Inventory staff must be allowed to maintain product QR data from `/admin/parts`.
5. Keyboard scanners must continue working when the POS search box is focused.
6. Product labels must support barcode scanners and common label-paper sizes.

## Design

### 1. Unique product-code registry

- Add collection `product_code_registry`.
- Document ID is the normalized product code.
- Each registry document stores `productId`, `code`, and `updatedAt`.
- Client writes use Firestore transactions:
  - check legacy aliases `sku`, `barcode`, `productCode`, and `qrCodes[]`;
  - read every registry document before writing;
  - reject a code owned by another product;
  - claim current codes and release obsolete claims owned by the current product;
  - create or update the product in the same transaction.
- Existing products remain compatible because legacy aliases are queried before registry claims.

### 2. Cover all creation flows

- `UniversalProductModal`: initialize `qrCodes`, claim the code transactionally, preserve fixed IDs for existing products.
- `ExcelImportModal`: initialize `qrCodes`, claim the code transactionally, and write the real `productId` into inventory logs.
- Proposed components created by parts and technician workflows receive deterministic codes from their generated Firestore IDs.
- Inventory completion backfills aliases and `qrCodes` for older proposed products when missing.

### 3. Smart Fix taxonomy

- Recompute repair candidates whenever the modal opens or loaded products change.
- Detect missing and invalid root taxonomy IDs.
- Build dropdown choices from `config.taxonomy.retail` and `config.taxonomy.component`.
- Save the selected real taxonomy root ID, not an English label slug.
- Save `updatedAt` in the batch.

### 4. Permissions

- Permit `manage_inventory` and `manage_repairs` staff to write product catalog records needed by their workflows.
- Apply the same permission rule to `product_code_registry`.

### 5. POS scanner

- Continue buffering keyboard-scanner input when the POS search input is focused.
- Preserve manual text entry behavior for other inputs.
- Add camera decode fallback using `@zxing/browser` when `BarcodeDetector` is unavailable.
- Keep retail category filters stable across renders and route camera callbacks through a ref so product refreshes do not restart the active stream.
- Ignore camera-open rejections emitted after an effect cleanup has already cancelled the previous scanner session.

### 6. Product labels

- Generate a `CODE128` barcode from the same primary product code used by QR and POS lookup.
- Offer label-content modes: `QR + barcode`, `QR only`, and `barcode only`.
- Offer common paper presets: `40x30 mm`, `50x30 mm`, `58x40 mm`, `58 mm roll`, and an `A4` grid.
- Let staff choose the number of copies before opening the browser print dialog.
- Keep barcode generation in the browser with `jsbarcode`; no product data migration is needed.

## Files

- `src/lib/productCodeRegistry.ts` [NEW]
- `src/lib/productCodes.ts`
- `src/lib/idNormalizer.ts`
- `src/components/admin/UniversalProductModal.tsx`
- `src/components/admin/ManageQrCodesModal.tsx`
- `src/components/admin/FixHiddenProductsModal.tsx`
- `src/components/admin/ExcelImportModal.tsx`
- `src/app/admin/parts/page.tsx`
- `src/app/admin/technician/page.tsx`
- `src/app/admin/pos/page.tsx`
- `src/components/admin/ProductQrLabelModal.tsx`
- `src/app/api/inventory/import/route.ts`
- `firestore.rules`
- `package.json`

## Verification

### Automated

- `next typegen`
- `tsc --noEmit`
- focused ESLint for changed files
- `next build`
- JSON parse for roadmap manifest and Firebase config

### Manual

- Create retail, accessory, and component products and confirm QR aliases.
- Attempt duplicate codes through manual create, QR manager, and Excel import.
- Add and remove secondary QR codes and confirm POS lookup.
- Open Smart Fix after page load and restore invalid retail and component taxonomy.
- Verify `/admin/parts` actions with inventory-only staff.
- Scan while POS search is focused.
- Verify camera scan on a browser with and without native `BarcodeDetector`.
- Print `QR + barcode`, QR-only, and barcode-only labels on a target label printer.
- Print an `A4` label grid and confirm labels align with the selected paper preset.
