# 7 TĂ­nh NÄƒng Má»Ÿ Rá»™ng â€” QLCH VanLanh

> **NgĂ y láº­p:** 19.05.2026 | **Tráº¡ng thĂ¡i:** IN PROGRESS

## Tá»•ng Quan

Bá»• sung 7 module má»›i vĂ o há»‡ thá»‘ng QLCH VanLanh:

| # | TĂ­nh nÄƒng | MĂ´ táº£ ngáº¯n |
|---|-----------|-------------|
| 1 | Import Excel | Nháº­p sáº£n pháº©m/dá»‹ch vá»¥ báº±ng file Excel, cĂ³ máº«u template |
| 2 | Quáº£n lĂ½ NCC | CRUD nhĂ  cung cáº¥p (tĂªn, SÄT, MST, STK...) |
| 3 | CĂ´ng ná»£ NCC | Tá»± phĂ¡t sinh ná»£ khi nháº­p hĂ ng, ghi nháº­n thanh toĂ¡n |
| 4 | Xuáº¥t bĂ¡o cĂ¡o Excel | Xuáº¥t lá»‹ch sá»­ nháº­p hĂ ng theo khoáº£ng ngĂ y |
| 5 | Chi tiáº¿t SP kiá»ƒu ÄTV | Biáº¿n thá»ƒ (mĂ u, dung lÆ°á»£ng, tĂ¬nh tráº¡ng), Ä‘Ă¡nh giĂ¡ & nháº­n xĂ©t |
| 6 | Discount Rules | Cáº¥u hĂ¬nh giáº£m giĂ¡ phá»¥ kiá»‡n theo dá»‹ch vá»¥ sá»­a chá»¯a (dynamic) |
| 7 | POS + Phiáº¿u SC | Tra cá»©u SÄT â†’ chá»n phiáº¿u sá»­a chá»¯a â†’ thanh toĂ¡n â†’ auto cáº­p nháº­t |

## Quyáº¿t Äá»‹nh ÄĂ£ Chá»‘t

- **Rule giáº£m giĂ¡:** Dáº¡ng Ä‘Æ¡n giáº£n `IF dá»‹ch vá»¥ X â†’ giáº£m Y% phá»¥ kiá»‡n Z` cho phá»¥ kiá»‡n cá»‘ Ä‘á»‹nh
- **POS + Repair:** Thanh toĂ¡n qua POS â†’ tá»± Ä‘á»™ng cáº­p nháº­t status phiáº¿u SC sang "ÄĂ£ thanh toĂ¡n"
- **Trang chi tiáº¿t SP:** Bá»• sung cáº£ nhĂ³m biáº¿n thá»ƒ + pháº§n "ÄĂ¡nh giĂ¡ & nháº­n xĂ©t"

## Schema Má»›i

### Firestore Collections
- `suppliers` â€” ThĂ´ng tin nhĂ  cung cáº¥p
- `supplier_transactions` â€” Lá»‹ch sá»­ giao dá»‹ch NCC (nháº­p hĂ ng / thanh toĂ¡n)
- `accessory_discount_rules` â€” Cáº¥u hĂ¬nh rule giáº£m giĂ¡ phá»¥ kiá»‡n Ä‘á»™ng

### Product Schema Expansion
- `seriesId` (optional) â€” nhĂ³m sáº£n pháº©m cĂ¹ng dĂ²ng
- `color` (optional) â€” mĂ u sáº¯c
- `storageCapacity` (optional) â€” dung lÆ°á»£ng
- `condition` (optional) â€” tĂ¬nh tráº¡ng mĂ¡y

### ImportReceipt Expansion
- `supplierId` (optional) â€” link tá»›i collection suppliers
- `paymentStatus` (optional) â€” 'paid' | 'partial' | 'unpaid'
- `paidAmount` (optional) â€” sá»‘ tiá»n Ä‘Ă£ tráº£

## Dependency
- ThĂªm thÆ° viá»‡n `xlsx` (SheetJS) cho Ä‘á»c/ghi Excel

## Files ChĂ­nh Bá»‹ áº¢nh HÆ°á»Ÿng
- `src/lib/types.ts` â€” ThĂªm interfaces má»›i
- `src/app/admin/suppliers/page.tsx` â€” [Má»I] Quáº£n lĂ½ NCC
- `src/components/admin/ExcelImportModal.tsx` â€” [Má»I] Import Excel
- `src/components/admin/ExportImportReportButton.tsx` â€” [Má»I] Xuáº¥t bĂ¡o cĂ¡o
- `src/app/admin/settings/discount-rules/page.tsx` â€” [Má»I] Cáº¥u hĂ¬nh rules
- `src/lib/discountRuleUtils.ts` â€” [Má»I] Utility tĂ­nh giáº£m giĂ¡
- `src/app/(customer)/product/[id]/ProductDetailClient.tsx` â€” NĂ¢ng cáº¥p UI
- `src/app/admin/pos/page.tsx` â€” TĂ­ch há»£p phiáº¿u SC
- `src/app/admin/parts/page.tsx` â€” Link NCC + cĂ´ng ná»£
