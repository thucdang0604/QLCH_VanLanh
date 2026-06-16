# Plan: POS QR adjustments v2

**ID**: `plan-pos-qr-adjustments`
**Date**: 31.05.2026
**Status**: implemented-awaiting-hardware-validation (merged `master`)

## Goal

Close the operational gaps found after the first POS QR rollout:

1. Each product must have exactly one system-generated code, shared by QR, barcode, and POS lookup.
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
  - reject writes containing zero or multiple current codes;
  - claim the single current code and release obsolete legacy claims owned by the current product;
  - create or update the product in the same transaction.
- Existing products remain compatible because legacy aliases are queried before registry claims.

### 2. Cover all creation flows

- `UniversalProductModal`: generate the code automatically, initialize singleton `qrCodes`, claim the code transactionally, and preserve fixed IDs for existing products.
- `ExcelImportModal`: generate the code automatically without a custom-code column, initialize singleton `qrCodes`, claim the code transactionally, and write the real `productId` into inventory logs.
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
- Decode both `qr_code` and `code_128` with native `BarcodeDetector` when both formats are supported.
- Fall back to ZXing `BrowserMultiFormatReader` when native barcode support is incomplete so mobile camera scanning still recognizes QR and `CODE128`.
- Keep retail category filters stable across renders and route camera callbacks through a ref so product refreshes do not restart the active stream.
- Ignore camera-open rejections emitted after an effect cleanup has already cancelled the previous scanner session.

### 6. Product labels

- Generate compact stable automatic QR codes by catalog type: retail product `SP-XXXXXXXX`, accessory `PK-XXXXXXXX`, and component `LK-XXXXXXXX`.
- Use the same generated code as the QR payload, `CODE128` barcode payload, SKU alias, and POS lookup value.
- Do not expose custom-code entry or secondary-code management to admin users.
- Keep tolerant reads for legacy aliases while all new and updated records persist one current code.
- Offer label-content modes: `QR + barcode`, `QR only`, and `barcode only`.
- Offer common paper presets: `40x30 mm`, `50x30 mm`, `58x40 mm`, `58 mm roll`, and an `A4` grid.
- Let staff choose the number of copies before opening the browser print dialog.
- Keep barcode generation in the browser with `jsbarcode`; no product data migration is needed.

## Files

- `src/lib/productCodeRegistry.ts` [NEW]
- `src/lib/productCodes.ts`
- `src/lib/idNormalizer.ts`
- `src/components/admin/UniversalProductModal.tsx`
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

- Create retail, accessory, and component products and confirm one generated `SP-`, `PK-`, or `LK-` code.
- Confirm QR and barcode on each label contain the same generated code.
- Confirm admin pages no longer expose custom-code entry or secondary-code management.
- Open Smart Fix after page load and restore invalid retail and component taxonomy.
- Verify `/admin/parts` actions with inventory-only staff.
- Scan while POS search is focused.
- Verify QR and `CODE128` camera scans on browsers with and without complete native `BarcodeDetector` support.
- Print `QR + barcode`, QR-only, and barcode-only labels on a target label printer.
- Print an `A4` label grid and confirm labels align with the selected paper preset.
