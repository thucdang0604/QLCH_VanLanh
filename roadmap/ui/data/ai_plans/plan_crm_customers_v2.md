# Plan: CRM Khách hàng Mở rộng — v12

**ID**: `plan-crm-customers-v2`  
**Ngày**: 27.05.2026  
**Trạng thái**: ready-for-implementation-review (v12 + 4 blockers + 3 decisions + 38 hardening fixes)

## Thay đổi v11 → v12 (fix 9 gaps + 4 blockers + 3 decisions + 38 hardening fixes)

### Blockers fixed (v11 → v12):
1. **F1**: `checkout/route.ts` bỏ aggregate cho Pending web orders. Chỉ ensure customer profile (aggregate=0).
2. **F3**: `confirm-parts` diff parts cũ/mới: release held cho bỏ, add held cho mới. Lifecycle held rõ ràng.

### Gaps filled:
3. **F2**: Tách `calculateAccessoryDiscounts` → `discountCalc.ts` (pure). Server API dùng Admin SDK fetch rules.
4. **F4**: Handover fail closed nếu dữ liệu cũ thiếu snapshot giá; không auto-confirm/reprice dữ liệu lịch sử.
5. **F5**: Note modal `out` là **dead code** (setNoteModal không bao giờ open). Xóa.
6. **F6**: `operation_requests` + `customer_ledger` rules: `allow read, write: if false`.
7. **F7**: Test count cập nhật.
8. **F8**: Orders read đã đúng (`manage_orders`). Chỉ `create: false` là thay đổi.
9. **F9**: Auto discount chỉ khi có `linkedRepairId`.

### 4 Blockers (thêm sau review):
10. **Auth confirm-parts**: Bearer token + `requirePermission('manage_repairs')`. Tests A9/A10/A11.
11. **Khoá snapshot giá**: Cấm client update `parts` field sau confirm. D10 → reject.
12. **Commission scope**: Option Y — fix BUG-COM-001 server-side. Test I3/I4.
13. **Đồng bộ files**: plan + task sync.

### 3 Decisions (chốt 27.05.2026):
14. **Parts server-only (Decision 1)**: KTV add/request/remove parts qua `confirm-parts` command API; trạng thái kho qua `inventory/import`. `partsLockedAt` top-level. Không còn client `runTransaction`; `technician/page.tsx` + `parts/page.tsx` vào scope MODIFY.
15. **assignedSeller (Decision 2)**: Thêm `assignedSellerId/assignedSellerName` cho Order. Web order chưa assign → Complete OK nhưng không tạo commission. POS → `createdBy` là seller.
16. **All-transitions API (Decision 3)**: Mọi order status transitions qua `orders/transition` API. Rules cấm client update `status` trực tiếp.

### 38 Hardening Fixes (thêm 27.05.2026):
17. **Fix 1**: Rules `repairs` cấm client update `parts` trong MỌI trạng thái. Cấm create repair chứa `parts`.
18. **Fix 2**: Payment lock rules cấm toàn bộ `payment` field (top-level key) từ client.
19. **Fix 3**: `confirm-parts` và `handover` ghi rõ server-compute payment.partsCost và payment.amount.
20. **Fix 4**: Gán seller qua API `orders/assign-seller` với permission và audit (`assignedBy`). Rules cấm client gán trực tiếp.
21. **Fix 5**: `Completed` → `Cancelled` reverse commission idempotently.
22. **Fix 6**: Thêm 7 tests mới (security parts/payment/seller, cancel reverse, retry cancel).
23. **Fix 7**: Đồng bộ files (34 files, 69 tests).
24. **Fix 8**: Rules cấm client chuyển `status` sang `done`/`out`/`refund` (terminal). Terminal phải qua `handover` API.
25. **Fix 9**: Bổ quyết API `/api/repairs/payment-edit` để sửa `laborCost`, `deposit`, `quote` có auth + audit + version.
26. **Fix 10**: Server `payment.amount` = partsCost + laborCost + additionalFees - discountAmount. Recompute ở handover.
27. **Fix 11**: `assign-seller` cấm gán sau khi Completed/Cancelled. Fetch `sellerName` từ db `staff`.
28. **Fix 12**: Commission reversal dùng cơ chế bản ghi âm (negative record). Query theo `sourceType/sourceId`.
29. **Fix 13**: Đồng bộ files (35 files, 77 tests).
30. **Fix 14**: `confirm-parts` pricing: giữ nguyên giá (unchanged parts). Snapshot mới chỉ khi part mới hoặc tăng số lượng.
31. **Fix 15**: Lifecycle guards: `confirm-parts` và `payment-edit` reject khi ticket terminal hoặc payment paid/refunded.
32. **Fix 16**: Rules cấm hoàn toàn client sửa `status` và `statusTimeline` của repair.
33. **Fix 17**: API mới `/api/repairs/transition` xử lý mọi transition non-terminal của repair, validate workflow.
34. **Fix 18**: Đồng bộ files và tính lại tests (35 files, 88 tests).
35. **Fix 19**: Lifecycle parts được bao phủ bởi các API server: command KTV và inventory owner; hỗ trợ custom part và phiếu nhập gom.
36. **Fix 20**: Hợp đồng API `/api/repairs/transition` check `allowedNext`, `requireChecklist`, `requirePartsReady`.
37. **Fix 21**: Thay thế hardcode terminal guard (done/out/refund) bằng check `isTerminal === true` dựa trên workflow config (ticketType).
38. **Fix 22**: Chính sách giá khi tăng quantity: giữ nguyên giá dòng cũ, tách số lượng tăng thêm thành dòng mới lấy giá catalog hiện tại.
39. **Fix 23**: Role separation: `manage_repairs` được request hoặc chọn hàng có sẵn (`selected`); `manage_inventory` sở hữu trạng thái kho `ordered`/`in_stock`/`unavailable`.
40. **Fix 24**: Thêm API atomic `/api/inventory/import` cho thao tác nhập kho.
41. **Fix 25**: Sửa trigger import receipt: tạo idempotent khi part chuyển sang `requested` hoặc transition ticket thấy `requested`.
42. **Fix 26**: Bổ sung contract cho `transition` API: tech note gate, durationInMinutes, tech handover block.
43. **Fix 27**: Đồng bộ files và tính lại tests.
44. **Fix 28**: Thêm `partLineId` server-generated cho RepairPart để đảm bảo map diff và split-row pricing an toàn.
45. **Fix 29**: Bổ sung legacy fallback (`done`, `out`, `refund`, v.v.) vào logic dynamic terminal guard.
46. **Fix 30**: Cập nhật chuẩn quyền quản lý tồn kho cho route `/admin/parts` thành `manage_inventory`.
47. **Fix 31**: Sửa `repairs/transition`: lưu `technicianNote` vào `issue.notes` trong cùng transaction.
48. **Fix 32**: Chuyển `confirm-parts` sang command API cho KTV; trạng thái kho chỉ do `inventory/import` thay đổi, tránh hai API cùng sở hữu lifecycle.
49. **Fix 33**: `partLineId` optional cho dòng mới, bắt buộc với dòng đã tồn tại; thêm preflight/backfill repair cũ trước khi bật rules.
50. **Fix 34**: Chốt state machine `held`: chỉ reserve khi part thành `selected`; `in_stock` không giữ hàng; handover consume đúng một lần.
51. **Fix 35**: Viết contract `inventory/import` đầy đủ cho `order_receipt`, `mark_availability` (`in_stock`/`unavailable`) và `complete_import`, có idempotency/version.
52. **Fix 36**: Viết contract `repairs/handover` cho terminal động/bảo hành và đồng bộ acceptance tests.
53. **Fix 37**: Bắt buộc `operationKey` cho command parts; chạy preflight/backfill `partLineId` và quyền kho trước khi deploy rules.
54. **Fix 38**: Bao phủ trạng thái `ordered`; `approved` chỉ là legacy-compatible input nếu dữ liệu cũ có, không sinh mới trong UX v12.

## Scope: 36 files. Tests: 112.

## Chi tiết
→ Xem implementation_plan.md (artifact)

## Review chi tiết
→ Xem review_v11.md (artifact) + review_4_blockers.md (artifact)
