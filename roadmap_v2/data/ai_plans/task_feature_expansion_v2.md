# Task Tracker â€” 7 TĂ­nh NÄƒng Má»Ÿ Rá»™ng

> **Cáº­p nháº­t láº§n cuá»‘i:** 19.05.2026

## Phase 1: Foundation (Types + xlsx)
- [x] CĂ i Ä‘áº·t thÆ° viá»‡n `xlsx`
- [x] ThĂªm interfaces: Supplier, SupplierTransaction, AccessoryDiscountRule vĂ o types.ts
- [x] ThĂªm variant fields vĂ o Product interface (seriesId, color, storageCapacity, condition)
- [x] ThĂªm supplier fields vĂ o ImportReceipt interface

## Phase 2: Quáº£n LĂ½ NCC
- [x] Táº¡o trang admin/suppliers/page.tsx (CRUD NCC)
- [x] ThĂªm menu "NhĂ  cung cáº¥p" vĂ o sidebar admin

## Phase 3: Import Excel
- [x] Táº¡o ExcelImportModal.tsx (upload, parse, preview, validate, import)
- [x] Táº¡o Excel template generator (products + services)
- [x] TĂ­ch há»£p nĂºt Import vĂ o products/page.tsx
- [x] TĂ­ch há»£p nĂºt Import vĂ o services/page.tsx

## Phase 4: Nháº­p HĂ ng + CĂ´ng Ná»£
- [x] Cáº­p nháº­t parts/page.tsx â€” dropdown chá»n NCC
- [x] Táº¡o SupplierTransaction khi hoĂ n táº¥t nháº­p hĂ ng
- [x] Cáº­p nháº­t totalDebt trĂªn supplier

## Phase 5: Xuáº¥t BĂ¡o CĂ¡o Excel
- [x] Táº¡o ExportImportReportButton.tsx
- [x] TĂ­ch há»£p vĂ o parts/page.tsx

## Phase 6: Chi Tiáº¿t SP + ÄĂ¡nh GiĂ¡
- [x] Cáº­p nháº­t ProductDetailClient.tsx â€” hiá»ƒn thá»‹ biáº¿n thá»ƒ (kĂ¨m hiá»ƒn thá»‹ dá»‹ch vá»¥ & phá»¥ kiá»‡n gá»£i Ă½)
- [x] ThĂªm section "ÄĂ¡nh giĂ¡ & nháº­n xĂ©t" (Ä‘Ă£ tĂ¡ch component vĂ  dá»i xuá»‘ng dÆ°á»›i cĂ¹ng)
- [x] Cáº­p nháº­t server page.tsx â€” fetch sáº£n pháº©m cĂ¹ng seriesId vĂ  fetchRelatedItems
- [x] Quáº£n lĂ½ nhĂ³m biáº¿n thá»ƒ (ProductSeriesManager) tĂ­ch há»£p trá»±c tiáº¿p vĂ o Tab á»Ÿ admin/products

## Phase 7: Discount Rules Engine
- [x] Táº¡o settings/discount-rules/page.tsx (Ä‘Ă£ tĂ­ch há»£p logic Háº¡ng khĂ¡ch hĂ ng & Rule giáº£m giĂ¡ phá»¥ kiá»‡n)
- [x] Táº¡o discountRuleUtils.ts (Ä‘Ă£ cĂ³ lib/discountCalc.ts & lib/discountRuleUtils.ts)

## Phase 8: POS + Phiáº¿u Sá»­a Chá»¯a
- [x] ThĂªm lookup SÄT khĂ¡ch â†’ hiá»ƒn thá»‹ phiáº¿u SC
- [x] Chá»n phiáº¿u SC â†’ thĂªm vĂ o giá» POS (DÆ°á»›i dáº¡ng má»™t sáº£n pháº©m áº£o, tiá»n sá»­a chá»¯a + linh kiá»‡n)
- [x] Auto-apply discount rules (Giáº£m giĂ¡ tá»± Ä‘á»™ng phá»¥ kiá»‡n Ä‘i kĂ¨m theo luáº­t cáº¥u hĂ¬nh)
- [x] Thanh toĂ¡n â†’ auto cáº­p nháº­t status phiáº¿u SC (Khi POS checkout, chuyá»ƒn status phiáº¿u sá»­a chá»¯a sang Ä‘Ă£ giao khĂ¡ch vĂ  thanh toĂ¡n)
