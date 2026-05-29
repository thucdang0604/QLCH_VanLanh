# Plan: CRM KhĂ¡ch hĂ ng Má»Ÿ rá»™ng â€” v12

**ID**: `plan-crm-customers-v2`  
**NgĂ y**: 27.05.2026  
**Tráº¡ng thĂ¡i**: ready-for-implementation-review (v12 + 4 blockers + 3 decisions + 38 hardening fixes)

## Thay Ä‘á»•i v11 â†’ v12 (fix 9 gaps + 4 blockers + 3 decisions + 38 hardening fixes)

### Blockers fixed (v11 â†’ v12):
1. **F1**: `checkout/route.ts` bá» aggregate cho Pending web orders. Chá»‰ ensure customer profile (aggregate=0).
2. **F3**: `confirm-parts` diff parts cÅ©/má»›i: release held cho bá», add held cho má»›i. Lifecycle held rĂµ rĂ ng.

### Gaps filled:
3. **F2**: TĂ¡ch `calculateAccessoryDiscounts` â†’ `discountCalc.ts` (pure). Server API dĂ¹ng Admin SDK fetch rules.
4. **F4**: Handover fail closed náº¿u dá»¯ liá»‡u cÅ© thiáº¿u snapshot giĂ¡; khĂ´ng auto-confirm/reprice dá»¯ liá»‡u lá»‹ch sá»­.
5. **F5**: Note modal `out` lĂ  **dead code** (setNoteModal khĂ´ng bao giá» open). XĂ³a.
6. **F6**: `operation_requests` + `customer_ledger` rules: `allow read, write: if false`.
7. **F7**: Test count cáº­p nháº­t.
8. **F8**: Orders read Ä‘Ă£ Ä‘Ăºng (`manage_orders`). Chá»‰ `create: false` lĂ  thay Ä‘á»•i.
9. **F9**: Auto discount chá»‰ khi cĂ³ `linkedRepairId`.

### 4 Blockers (thĂªm sau review):
10. **Auth confirm-parts**: Bearer token + `requirePermission('manage_repairs')`. Tests A9/A10/A11.
11. **KhoĂ¡ snapshot giĂ¡**: Cáº¥m client update `parts` field sau confirm. D10 â†’ reject.
12. **Commission scope**: Option Y â€” fix BUG-COM-001 server-side. Test I3/I4.
13. **Äá»“ng bá»™ files**: plan + task sync.

### 3 Decisions (chá»‘t 27.05.2026):
14. **Parts server-only (Decision 1)**: KTV add/request/remove parts qua `confirm-parts` command API; tráº¡ng thĂ¡i kho qua `inventory/import`. `partsLockedAt` top-level. KhĂ´ng cĂ²n client `runTransaction`; `technician/page.tsx` + `parts/page.tsx` vĂ o scope MODIFY.
15. **assignedSeller (Decision 2)**: ThĂªm `assignedSellerId/assignedSellerName` cho Order. Web order chÆ°a assign â†’ Complete OK nhÆ°ng khĂ´ng táº¡o commission. POS â†’ `createdBy` lĂ  seller.
16. **All-transitions API (Decision 3)**: Má»i order status transitions qua `orders/transition` API. Rules cáº¥m client update `status` trá»±c tiáº¿p.

### 38 Hardening Fixes (thĂªm 27.05.2026):
17. **Fix 1**: Rules `repairs` cáº¥m client update `parts` trong Má»ŒI tráº¡ng thĂ¡i. Cáº¥m create repair chá»©a `parts`.
18. **Fix 2**: Payment lock rules cáº¥m toĂ n bá»™ `payment` field (top-level key) tá»« client.
19. **Fix 3**: `confirm-parts` vĂ  `handover` ghi rĂµ server-compute payment.partsCost vĂ  payment.amount.
20. **Fix 4**: GĂ¡n seller qua API `orders/assign-seller` vá»›i permission vĂ  audit (`assignedBy`). Rules cáº¥m client gĂ¡n trá»±c tiáº¿p.
21. **Fix 5**: `Completed` â†’ `Cancelled` reverse commission idempotently.
22. **Fix 6**: ThĂªm 7 tests má»›i (security parts/payment/seller, cancel reverse, retry cancel).
23. **Fix 7**: Äá»“ng bá»™ files (34 files, 69 tests).
24. **Fix 8**: Rules cáº¥m client chuyá»ƒn `status` sang `done`/`out`/`refund` (terminal). Terminal pháº£i qua `handover` API.
25. **Fix 9**: Bá»• quyáº¿t API `/api/repairs/payment-edit` Ä‘á»ƒ sá»­a `laborCost`, `deposit`, `quote` cĂ³ auth + audit + version.
26. **Fix 10**: Server `payment.amount` = partsCost + laborCost + additionalFees - discountAmount. Recompute á»Ÿ handover.
27. **Fix 11**: `assign-seller` cáº¥m gĂ¡n sau khi Completed/Cancelled. Fetch `sellerName` tá»« db `staff`.
28. **Fix 12**: Commission reversal dĂ¹ng cÆ¡ cháº¿ báº£n ghi Ă¢m (negative record). Query theo `sourceType/sourceId`.
29. **Fix 13**: Äá»“ng bá»™ files (35 files, 77 tests).
30. **Fix 14**: `confirm-parts` pricing: giá»¯ nguyĂªn giĂ¡ (unchanged parts). Snapshot má»›i chá»‰ khi part má»›i hoáº·c tÄƒng sá»‘ lÆ°á»£ng.
31. **Fix 15**: Lifecycle guards: `confirm-parts` vĂ  `payment-edit` reject khi ticket terminal hoáº·c payment paid/refunded.
32. **Fix 16**: Rules cáº¥m hoĂ n toĂ n client sá»­a `status` vĂ  `statusTimeline` cá»§a repair.
33. **Fix 17**: API má»›i `/api/repairs/transition` xá»­ lĂ½ má»i transition non-terminal cá»§a repair, validate workflow.
34. **Fix 18**: Äá»“ng bá»™ files vĂ  tĂ­nh láº¡i tests (35 files, 88 tests).
35. **Fix 19**: Lifecycle parts Ä‘Æ°á»£c bao phá»§ bá»Ÿi cĂ¡c API server: command KTV vĂ  inventory owner; há»— trá»£ custom part vĂ  phiáº¿u nháº­p gom.
36. **Fix 20**: Há»£p Ä‘á»“ng API `/api/repairs/transition` check `allowedNext`, `requireChecklist`, `requirePartsReady`.
37. **Fix 21**: Thay tháº¿ hardcode terminal guard (done/out/refund) báº±ng check `isTerminal === true` dá»±a trĂªn workflow config (ticketType).
38. **Fix 22**: ChĂ­nh sĂ¡ch giĂ¡ khi tÄƒng quantity: giá»¯ nguyĂªn giĂ¡ dĂ²ng cÅ©, tĂ¡ch sá»‘ lÆ°á»£ng tÄƒng thĂªm thĂ nh dĂ²ng má»›i láº¥y giĂ¡ catalog hiá»‡n táº¡i.
39. **Fix 23**: Role separation: `manage_repairs` Ä‘Æ°á»£c request hoáº·c chá»n hĂ ng cĂ³ sáºµn (`selected`); `manage_inventory` sá»Ÿ há»¯u tráº¡ng thĂ¡i kho `ordered`/`in_stock`/`unavailable`.
40. **Fix 24**: ThĂªm API atomic `/api/inventory/import` cho thao tĂ¡c nháº­p kho.
41. **Fix 25**: Sá»­a trigger import receipt: táº¡o idempotent khi part chuyá»ƒn sang `requested` hoáº·c transition ticket tháº¥y `requested`.
42. **Fix 26**: Bá»• sung contract cho `transition` API: tech note gate, durationInMinutes, tech handover block.
43. **Fix 27**: Äá»“ng bá»™ files vĂ  tĂ­nh láº¡i tests.
44. **Fix 28**: ThĂªm `partLineId` server-generated cho RepairPart Ä‘á»ƒ Ä‘áº£m báº£o map diff vĂ  split-row pricing an toĂ n.
45. **Fix 29**: Bá»• sung legacy fallback (`done`, `out`, `refund`, v.v.) vĂ o logic dynamic terminal guard.
46. **Fix 30**: Cáº­p nháº­t chuáº©n quyá»n quáº£n lĂ½ tá»“n kho cho route `/admin/parts` thĂ nh `manage_inventory`.
47. **Fix 31**: Sá»­a `repairs/transition`: lÆ°u `technicianNote` vĂ o `issue.notes` trong cĂ¹ng transaction.
48. **Fix 32**: Chuyá»ƒn `confirm-parts` sang command API cho KTV; tráº¡ng thĂ¡i kho chá»‰ do `inventory/import` thay Ä‘á»•i, trĂ¡nh hai API cĂ¹ng sá»Ÿ há»¯u lifecycle.
49. **Fix 33**: `partLineId` optional cho dĂ²ng má»›i, báº¯t buá»™c vá»›i dĂ²ng Ä‘Ă£ tá»“n táº¡i; thĂªm preflight/backfill repair cÅ© trÆ°á»›c khi báº­t rules.
50. **Fix 34**: Chá»‘t state machine `held`: chá»‰ reserve khi part thĂ nh `selected`; `in_stock` khĂ´ng giá»¯ hĂ ng; handover consume Ä‘Ăºng má»™t láº§n.
51. **Fix 35**: Viáº¿t contract `inventory/import` Ä‘áº§y Ä‘á»§ cho `order_receipt`, `mark_availability` (`in_stock`/`unavailable`) vĂ  `complete_import`, cĂ³ idempotency/version.
52. **Fix 36**: Viáº¿t contract `repairs/handover` cho terminal Ä‘á»™ng/báº£o hĂ nh vĂ  Ä‘á»“ng bá»™ acceptance tests.
53. **Fix 37**: Báº¯t buá»™c `operationKey` cho command parts; cháº¡y preflight/backfill `partLineId` vĂ  quyá»n kho trÆ°á»›c khi deploy rules.
54. **Fix 38**: Bao phá»§ tráº¡ng thĂ¡i `ordered`; `approved` chá»‰ lĂ  legacy-compatible input náº¿u dá»¯ liá»‡u cÅ© cĂ³, khĂ´ng sinh má»›i trong UX v12.

## Scope: 36 files. Tests: 112.

## Chi tiáº¿t
â†’ Xem implementation_plan.md (artifact)

## Review chi tiáº¿t
â†’ Xem review_v11.md (artifact) + review_4_blockers.md (artifact)
