# User Test Error Intake - 2026-06-18

## Status
- Branch: `codex/fix-user-reported-errors-20260618`
- Mode: analysis after user-confirmed intake
- Current phase: root-cause grouping and implementation order proposal

## Ground Rules
- Record each reported error as a separate item.
- Keep different failure families separate: UI behavior, route/navigation, API/server error, provider/config error, permission/RBAC, data/business-state, build/deploy.
- Do not start proposing or implementing fixes until the user confirms the test pass is complete.
- When implementation starts later, update the matching roadmap module and mark each issue with evidence, root cause, files touched, and verification result.

## Analysis Started - 2026-06-18

### P0 - Payment, revenue, and repair completion are one coupled defect family
- Covered IDs: UT-20260618-001, UT-20260618-005, UT-20260618-007, UT-20260618-017.
- Evidence: POS checkout currently creates an `orders` document for every POS checkout, then immediately calls `buildCompletedOrderRevenueDelta(...)`. Repair handoff from the POS client sends `repairTicketIds`, but the checkout API reads `repairTicketId`, so the repair update branch is skipped for normal POS repair payments.
- Root cause: POS is being used as the cashier surface, but the backend still treats every checkout as a retail/POS order. Repair payments need source typing before revenue aggregation.
- Direction: introduce/standardize payable source types (`retail_order`, `repair_ticket`, `customer_debt`) and make repair payment update the repair workflow/payment ledger without polluting POS order revenue. If a POS receipt document is still needed, it must be excluded from order revenue and labeled as a repair payment receipt.

### P0 - Revenue day view depends on permissions and aggregate reads
- Covered IDs: UT-20260618-002.
- Evidence: `/admin/revenue` reads `revenue_daily_aggregates` and `expenses` in the day/range path. Firestore rules require revenue permissions for these collections.
- Root cause: user role/custom claims or module permission mapping is likely not aligned with the new aggregate/expense reads.
- Direction: verify the actual staff role permission set, then align route guard, Firestore rules, and admin module permissions around `view_revenue`.

### P0 - Repair workflow must stay Firebase-workflow driven
- Covered IDs: UT-20260618-017, UT-20260618-020, UT-20260618-024.
- Evidence: transition API loads workflow dynamically, but POS checkout still writes a hardcoded repair status, and repair/technician UI still exposes behavior that can bypass or hide workflow state.
- Root cause: workflow enforcement exists in the transition API, but some UI/payment paths still write direct state or conditionally render by hardcoded assumptions.
- Direction: route terminal/payment completion through workflow-aware repair APIs, lock create status to the workflow intake node, and separate read-only selected-parts display from workflow-gated add/remove controls.

### P1 - POS should become a customer payable workspace, not only a cart
- Covered IDs: UT-20260618-003, UT-20260618-004, UT-20260618-006.
- Evidence: POS already has phone-based repair lookup and manual voucher handling, but it does not present a unified payable list for unpaid orders, repairs, and debts. Search/add-to-cart logic also does not clearly distinguish "not found" from "out of stock" in the requested way.
- Root cause: POS data model is product-cart first; customer payable sources and stock availability are bolted on.
- Direction: build a phone lookup panel that returns typed payable records, keep out-of-stock search results visible but disabled, and apply system discount rules through the same checkout calculation path.

### P1 - Repair intake data model needs extension
- Covered IDs: UT-20260618-018, UT-20260618-019, UT-20260618-021, UT-20260618-022.
- Evidence: repair editor has one service group selection outside the issue list, a plain passcode field, limited condition/history booleans, and existing handover logic already has partial no-part warranty behavior.
- Root cause: the intake schema is still ticket-level for service category and passcode, while the real workflow needs issue-level service mapping and richer device metadata.
- Direction: add backward-compatible fields for issue service suggestions, pattern-lock passcode, condition/history other text, and surface no-part service warranty consistently in repair detail/POS print.

### P1 - Technician detail duplicates notes and mixes display with edit permissions
- Covered IDs: UT-20260618-016, UT-20260618-023, UT-20260618-024, UT-20260618-025.
- Evidence: repair transition stores the same technical note into timeline fields and issue notes; technician detail displays both. Selected parts display is tied to workflow edit capability.
- Root cause: audit log, issue note, and technician detail UI are not separated by purpose.
- Direction: store/show each note once per intended surface, collapse timeline by default, and always show selected/test/used parts read-only while workflow controls decide add/remove.

### P1 - Appointment workflow needs explicit confirmation and arrival method states
- Covered IDs: UT-20260618-014, UT-20260618-015.
- Evidence: appointments currently use a small manual status set and only link `tel:` without recording the call action.
- Root cause: appointment state machine is too coarse for the actual front-desk workflow.
- Direction: add call-confirmed action, direct/drop-off choice, and repair creation handoff that preserves existing prefill behavior.

### P2 - Inventory/products/parts boundary needs a structural refactor
- Covered IDs: UT-20260618-028.
- Evidence: products, parts, and inventory currently share import/proposal behavior unevenly. `inventory/stock` is already a separate stock view and should stay as-is.
- Root cause: page boundaries grew around UI history instead of business ownership.
- Direction: keep products/parts focused on catalog + create + proposal, move aggregate receipt/proposal/order lists to inventory, and reuse a shared proposal/import modal/service.

### P2 - Product variants should be category-derived
- Covered IDs: UT-20260618-029.
- Evidence: manual `ProductSeriesManager` and `seriesId` fields exist in admin product UI.
- Root cause: variant grouping is manually configured even though the desired grouping key is category.
- Direction: derive variant group key from category/category path for storefront grouping, hide/remove manual series configuration, and keep compatibility for old `seriesId` during migration.

### P2 - Services should become reusable business taxonomy
- Covered IDs: UT-20260618-012, UT-20260618-026, UT-20260618-027.
- Evidence: services currently render numeric pricing and are not strongly linked to repair issues or discount rules.
- Root cause: services are treated as storefront/admin content instead of a taxonomy used by repair and promotion workflows.
- Direction: add `priceOnRequest`/hide-price behavior across admin and customer surfaces, then use service/category metadata for repair issue suggestions and service-based promotions.

### P2 - Remaining admin/customer UX and security cleanup
- Covered IDs: UT-20260618-008, UT-20260618-009, UT-20260618-010, UT-20260618-011, UT-20260618-013, UT-20260618-030, UT-20260618-031, UT-20260618-032.
- Evidence: orders detail still exposes manual status controls; mobile bottom nav and missions widget need layout adjustment; supplier detail is much thinner than customer detail; AI Creator route/nav/permission still exists; bank config has TOTP support but still allows non-TOTP setup/edit paths and OTP wording remains.
- Root cause: several features are usable but not yet aligned with the newer workflow/security/product decisions.
- Direction: implement after P0/P1 data-flow fixes: hide manual order status controls, improve mobile navigation/product detail layout, enrich supplier detail, remove AI Creator route/nav/permission, and make TOTP mandatory for payment/bank config changes.

## Implementation Log

### Part 1 - POS repair checkout ID contract and revenue aggregate split
- Covered IDs: UT-20260618-001, UT-20260618-005, UT-20260618-007, UT-20260618-017.
- Files touched: `src/app/admin/pos/page.tsx`, `src/app/api/pos/checkout/route.ts`, `src/features/pos/posTypes.ts`.
- Change: POS cart repair lines now carry the real `repairTicketId`; checkout sends a deduplicated repair ticket list; the API accepts plural `repairTicketIds`, maps legacy synthetic repair line IDs back to the real ticket ID, updates all matching repair tickets, and splits revenue aggregates so retail lines count as POS order revenue while repair lines count as repair revenue.
- Verification: focused ESLint passed for the touched files; `tsc --noEmit` passed; `git diff --check` only reported Windows CRLF warnings.
- Remaining risk: order documents are still created as POS receipts for repair payments, so the next part must adjust order/admin display and any legacy revenue fallback paths that still derive totals directly from `orders`.

### Part 2 - Revenue fallback excludes repair payment lines from order revenue
- Covered IDs: UT-20260618-001, UT-20260618-007.
- Files touched: `src/app/admin/revenue/page.tsx`.
- Change: legacy/fallback revenue calculations now derive order revenue, POS order revenue, web order revenue, and daily chart order revenue from retail-only order lines. POS receipt lines marked as repair payments no longer inflate order revenue when aggregate docs are not used.
- Verification: focused ESLint passed for `src/app/admin/revenue/page.tsx`; `tsc --noEmit` passed; `git diff --check` only reported Windows CRLF warnings.
- Remaining risk: historical POS repair receipts created before Part 1 may not have `isRepairTicket` or `repairTicketId` on every repair-related line, so a one-time data audit/backfill may still be needed for old data.

### Part 3 - Order detail modal is read-only for status and clearer for repair receipts
- Covered IDs: UT-20260618-008, UT-20260618-009.
- Files touched: `src/app/admin/orders/page.tsx`.
- Change: the order detail modal no longer exposes a visible manual status selector; it shows a read-only system-managed status note, labels repair payment receipts, labels DEBT orders as "Ghi nợ - chờ thu", and reads POS item `productName` so line items are visible instead of blank/unclear.
- Verification: focused ESLint passed for `src/app/admin/orders/page.tsx`; `tsc --noEmit` passed; `git diff --check` only reported Windows CRLF warnings.
- Remaining risk: deeper order workflow automation still belongs in the order transition/payment source model; this part only removes the confusing manual control from the detail popup.

### Part 4 - POS repair completion follows configured workflow terminal
- Covered IDs: UT-20260618-017, UT-20260618-024.
- Files touched: `src/app/api/pos/checkout/route.ts`.
- Change: POS repair checkout no longer hardcodes repair status to `out`. It loads the configured repair workflow, resolves a valid terminal transition from the current node, prefers terminal nodes carrying commission features, records a POS payment timeline entry, and counts completed repairs only when the ticket actually moves into a terminal state.
- Verification: focused ESLint passed for `src/app/api/pos/checkout/route.ts`; `tsc --noEmit` passed; `git diff --check` only reported Windows CRLF warnings.
- Remaining risk: if a store workflow has multiple terminal choices from the current status and none is marked with commission features, checkout now fails loudly instead of guessing. The workflow config should make the paid-completion terminal unambiguous.

### Part 5 - POS search shows active out-of-stock products
- Covered IDs: UT-20260618-003.
- Files touched: `src/app/admin/pos/page.tsx`.
- Change: the default POS product cache still hides out-of-stock items, but search and scan now merge active out-of-stock products into the grid so staff see the product with the existing "Hết hàng" badge instead of a false "not found" result.
- Verification: focused ESLint passed for `src/app/admin/pos/page.tsx`; `tsc --noEmit` passed; `git diff --check` only reported Windows CRLF warnings.
- Remaining risk: this keeps hidden/inactive/proposed products excluded. If staff need to see inactive catalog entries in POS search, that should be a separate permissioned lookup.

### Part 6 - Remove admin AI Creator surface
- Covered IDs: UT-20260618-031.
- Files touched: `src/app/admin/ai-creator/page.tsx`, `src/app/admin/layout.tsx`, `src/lib/adminModules.ts`.
- Change: removed the AI Creator route file, admin nav item, icon registry key, permission registry entry, and content-role preset permission.
- Verification: no source references remain for `ai-creator`, `AI Creator`, `manage_ai_creator`, or `aiCreator`; focused ESLint passed for admin module/layout files; `next typegen && tsc --noEmit` passed after clearing stale `.next/types/app/admin/ai-creator`.
- Remaining risk: existing staff documents may still contain the old `manage_ai_creator` string, but it no longer grants access to any admin route.

### Part 7 - Bank config updates require TOTP
- Covered IDs: UT-20260618-032.
- Files touched: `src/components/admin/settings/BankIntegrationConfig.tsx`, `src/app/api/admin/bank-config/update/route.ts`.
- Change: the bank settings UI now requires Authenticator setup before edit; labels no longer say the admin phone receives OTP; the update API rejects bank config changes until TOTP is configured and still requires a valid TOTP token for every save.
- Verification: focused ESLint passed for the touched files with existing `<img>` warnings only; `next typegen && tsc --noEmit` passed; `git diff --check` only reported Windows CRLF warnings.
- Remaining risk: the field name `otpToken` remains as an internal request key for compatibility, but the runtime verification is TOTP-only.

### Part 8 - Customer mobile bottom nav and voucher offset
- Covered IDs: UT-20260618-010, UT-20260618-011.
- Files touched: `src/components/layout/MobileBottomNav.tsx`, `src/components/MissionsWidget.tsx`.
- Change: customer mobile bottom nav now has Home, Category, Contact, Appointment, Tracking; admin/staff mobile nav keeps Home, Category, Contact, Tracking, Admin. The voucher mission button and open panel are lifted above the mobile bottom nav while keeping the desktop position unchanged.
- Verification: focused ESLint passed for the touched components; `next typegen && tsc --noEmit` passed; `git diff --check` only reported Windows CRLF warnings.
- Remaining risk: visual QA on a real mobile viewport is still needed to confirm exact spacing with device safe-area insets.

### Part 9 - New repair tickets start at workflow intake
- Covered IDs: UT-20260618-020.
- Files touched: `src/features/repairs/RepairEditorModal.tsx`, `src/app/admin/repairs/page.tsx`.
- Change: create-repair mode no longer exposes an editable status selector. New tickets display the workflow initial status as read-only, and the create payload writes the first configured workflow status with `REPAIR_STATUS.INTAKE` only as a fallback.
- Verification: focused ESLint passed for the touched files; `next typegen && tsc --noEmit` passed; `git diff --check` only reported Windows CRLF warnings.
- Remaining risk: if the configured workflow order is wrong in Firebase, the first node will still be treated as the intake node by design.

### Part 10 - Product detail mobile action sizing
- Covered IDs: UT-20260618-013.
- Files touched: `src/app/(customer)/product/[id]/ProductDetailClient.tsx`.
- Change: mobile product/service action controls now use a two-column grid with 56px touch targets, full-width quantity controls, larger primary action buttons, and a larger favorite button while preserving the desktop flex layout.
- Verification: focused ESLint passed for the touched component; `next typegen && tsc --noEmit` passed; `git diff --check` only reported Windows CRLF warnings.
- Remaining risk: browser/device visual QA is still needed to confirm exact spacing with the fixed mobile bottom navigation.

### Part 11 - Repair device history other note
- Covered IDs: UT-20260618-022.
- Files touched: `src/lib/types/repair.ts`, `src/features/repairs/RepairEditorModal.tsx`, `src/features/repairs/RepairDetailModal.tsx`, `src/app/admin/repairs/page.tsx`.
- Change: the repair device history section now has a free-text "Khac" note stored as `deviceInfo.checklist.historyOtherNote`, loaded back when editing, saved on create/update, and displayed in repair details without polluting the technical checklist grid.
- Verification: focused ESLint passed for the touched files; `next typegen && tsc --noEmit` passed; `git diff --check` only reported Windows CRLF warnings.
- Remaining risk: existing tickets do not have this optional field until staff add it during edit.

### Part 12 - Revenue date fallback source read permissions
- Covered IDs: UT-20260618-002.
- Files touched: `firestore.rules`.
- Change: Firestore rules now let users with `view_revenue` read the source collections used by the revenue page fallback path: `orders`, `repairs`, `import_receipts`, and `commissions`. Write/update/delete rules remain unchanged.
- Verification: `next typegen && tsc --noEmit` passed; `firestore.rules` brace balance check passed; `git diff --check` only reported Windows CRLF warnings. Firebase CLI/rules emulator is not installed locally in this repo.
- Remaining risk: this matches the current client-side fallback design, which reads source documents directly for pre-aggregate date ranges.

### Part 13 - Technical notes are not appended again on status transitions
- Covered IDs: UT-20260618-016, UT-20260618-025.
- Files touched: `src/app/api/repairs/transition/route.ts`, `src/app/admin/technician/page.tsx`, `src/features/technician/TechnicianWorkflowModals.tsx`.
- Change: technician status changes no longer send the existing ticket note as a new note; the note modal starts blank and shows the current note as read-only context. The transition API trims notes and skips appending a note when the same content already exists, including dated note lines.
- Verification: focused ESLint passed for the touched files; `next typegen && tsc --noEmit` passed; `git diff --check` only reported Windows CRLF warnings.
- Remaining risk: old duplicated notes already stored in Firestore are not automatically cleaned; this prevents new duplicates.

### Part 14 - Technician ticket journal is collapsed by default
- Covered IDs: UT-20260618-023.
- Files touched: `src/features/technician/TechnicianTicketDetailModal.tsx`.
- Change: the technician ticket detail modal now hides the status timeline behind a "Xem/An" toggle and resets the journal to hidden when a different ticket is opened.
- Verification: focused ESLint passed for the touched component; `next typegen && tsc --noEmit` passed; `git diff --check` only reported Windows CRLF warnings.
- Remaining risk: this changes only the technician detail modal; the admin repair detail timeline remains visible.

### Part 15 - Technician detail always shows selected parts
- Covered IDs: UT-20260618-024.
- Files touched: `src/features/technician/TechnicianTicketDetailModal.tsx`.
- Change: selected/requested/in-stock repair parts now render in a read-only "Linh kien da chon" section whenever the ticket has parts. Workflow-gated part controls remain separate under "Thao tac linh kien".
- Verification: focused ESLint passed for the touched component; `next typegen && tsc --noEmit` passed; `git diff --check` only reported Windows CRLF warnings.
- Remaining risk: remove/add part actions remain governed by the existing workflow feature gates.

### Part 16 - Services can hide customer-facing price
- Covered IDs: UT-20260618-012, UT-20260618-026.
- Files touched: `src/app/admin/services/page.tsx`, `src/app/(customer)/service/[id]/ServiceDetailClient.tsx`, `src/components/home/ServiceCard.tsx`, `src/components/home/PricingSection.tsx`, `src/app/(customer)/category/[...slug]/CategoryClient.tsx`, `src/app/(customer)/product/[id]/ProductDetailClient.tsx`.
- Change: services now support `hidePrice`. Admin can toggle "An gia phia khach hang"; customer-facing service pages, category cards, homepage pricing, and legacy product-route fallback show "Lien he nhan bao gia" instead of numeric prices when the flag is enabled.
- Verification: focused ESLint passed for the touched files; `next typegen && tsc --noEmit` passed; `git diff --check` only reported Windows CRLF warnings.
- Remaining risk: existing services default to showing price until staff enables the flag.

## Intake List
### Batch 1 - User Reported 2026-06-18

#### UT-20260618-001 - Revenue repair revenue is counted through POS orders
- Reporter note: Trang `admin/revenue`: doanh thu phiếu sửa chữa được tính hoàn toàn vào doanh thu order POS.
- Page/route: `/admin/revenue`
- Expected result: Doanh thu sửa chữa và doanh thu order/POS phải được phân loại đúng để không tính sai.
- Actual result: Doanh thu phiếu sửa chữa đang đi vào doanh thu order POS.
- Cross-links: UT-20260618-008, UT-20260618-021
- Initial bucket: revenue/accounting, data/business-state
- Status: open

#### UT-20260618-002 - Revenue daily view permission error
- Reporter note: Trang `admin/revenue`: khi xem theo ngày đang lỗi `Missing or insufficient permissions`.
- Page/route: `/admin/revenue`
- Expected result: Nhân viên có quyền phù hợp xem được doanh thu theo ngày.
- Actual result: Lỗi `Missing or insufficient permissions`.
- Initial bucket: permission/RBAC
- Status: open

#### UT-20260618-003 - POS search hides out-of-stock distinction
- Reporter note: `admin/pos`: hiện tại đang ẩn toàn bộ sản phẩm và linh kiện tồn kho = 0. Logic đúng nhưng chưa đủ; khi tìm kiếm sản phẩm cần hiển thị sản phẩm và báo hết hàng, không báo không tìm thấy.
- Page/route: `/admin/pos`
- Expected result: Tìm kiếm vẫn cho thấy sản phẩm/linh kiện tồn tại nhưng hết hàng.
- Actual result: Nhân viên dễ nhầm giữa hết tồn kho và không có sản phẩm trong hệ thống.
- Initial bucket: POS UX, inventory display
- Status: open

#### UT-20260618-004 - POS needs phone lookup and payable invoice list
- Reporter note: `admin/pos`: cần tích hợp nhập SĐT và liệt kê các hóa đơn cần thanh toán của khách ngay trên POS.
- Page/route: `/admin/pos`
- Expected result: POS là trung tâm thanh toán, có thể tra khách bằng SĐT và thấy các hóa đơn cần thanh toán.
- Actual result: Chưa có luồng này ngay trên POS.
- Initial bucket: POS workflow, customer lookup
- Status: open

#### UT-20260618-005 - POS repair payment card lacks full repair details and warranty print
- Reporter note: `admin/pos`: đã có liên kết thanh toán phiếu sửa chữa trực tiếp trên POS nhưng thông tin phiếu sửa chữa chưa hiển thị đủ, ví dụ linh kiện đã sử dụng, phí sửa chữa, in phiếu bảo hành sau khi thanh toán.
- Page/route: `/admin/pos`
- Expected result: Khi thanh toán phiếu sửa chữa ở POS, thông tin sửa chữa đủ để thu tiền và in bảo hành.
- Actual result: Thiếu thông tin phiếu sửa chữa.
- Cross-links: UT-20260618-021
- Initial bucket: POS repair payment UI, warranty print
- Status: open

#### UT-20260618-006 - POS needs system discount program integration
- Reporter note: `admin/pos`: tích hợp áp dụng các chương trình giảm giá trên hệ thống.
- Page/route: `/admin/pos`
- Expected result: POS áp dụng được chương trình giảm giá đang cấu hình trên hệ thống.
- Actual result: Chưa tích hợp đầy đủ theo nhu cầu.
- Initial bucket: discount workflow, POS
- Status: open

#### UT-20260618-007 - Orders repair payment through POS causes wrong order revenue
- Reporter note: `admin/orders`: POS làm trung tâm thanh toán nên khi thanh toán phiếu sửa chữa lại được tính vào order POS; nếu vậy doanh thu sẽ tính sai vì không có doanh thu phát sinh từ phiếu sửa chữa.
- Page/route: `/admin/orders`
- Expected result: Thanh toán sửa chữa qua POS không làm sai phân loại doanh thu/order.
- Actual result: Phiếu sửa chữa được ghi nhận như order POS.
- Cross-links: UT-20260618-001
- Initial bucket: order/revenue classification, POS repair payment
- Status: open

#### UT-20260618-008 - Order detail status controls should be system-driven
- Reporter note: `admin/orders`: popup Chi tiết đơn hàng phần thay đổi trạng thái cần ẩn đi và chỉ để hệ thống cập nhật trạng thái tự động.
- Page/route: `/admin/orders`
- Expected result: Trạng thái đơn hàng do hệ thống cập nhật theo workflow, không cho đổi thủ công trong popup chi tiết.
- Actual result: Popup còn phần thay đổi trạng thái.
- Initial bucket: orders UI, workflow control
- Status: open

#### UT-20260618-009 - Order detail product display and DEBT state unclear
- Reporter note: `admin/orders`: chi tiết sản phẩm cần hiển thị rõ là sản phẩm nào; các trường hợp thanh toán là `ghi nợ/DEBT` nên có một trạng thái phù hợp hơn.
- Page/route: `/admin/orders`
- Expected result: Sản phẩm trong chi tiết đơn hàng rõ ràng; trạng thái ghi nợ dễ hiểu với nhân viên.
- Actual result: Thông tin sản phẩm và trạng thái DEBT chưa phù hợp.
- Initial bucket: orders UI, payment state wording
- Status: open

#### UT-20260618-010 - Customer mobile bottom nav needs quick appointment
- Reporter note: Trang chủ khách hàng: ưu tiên tối ưu trải nghiệm mobile. Bottom nav khách hàng gồm `Trang chủ / Danh mục / Liên hệ / Đặt lịch / Tra cứu`; với admin đã đăng nhập gồm `Trang chủ / Danh mục / Liên hệ / Tra cứu / Quản lý`.
- Page/route: customer storefront mobile
- Expected result: Bottom nav có đúng mục theo loại người dùng, có nút đặt lịch nhanh cho khách.
- Actual result: Chưa có bố cục bottom nav theo yêu cầu mới.
- Initial bucket: customer mobile UX, navigation
- Status: open

#### UT-20260618-011 - Voucher mission icon overlaps bottom nav
- Reporter note: Trang chủ khách hàng: icon làm nhiệm vụ nhận voucher cần cao hơn để không che khuất bottom.
- Page/route: customer storefront mobile
- Expected result: Icon nhiệm vụ không che bottom nav.
- Actual result: Icon có nguy cơ che khuất bottom.
- Initial bucket: customer mobile UX, layout
- Status: open

#### UT-20260618-012 - Customer service price should show contact quote when flagged
- Reporter note: Trang chủ khách hàng: hiển thị `liên hệ nhận báo giá` với các dịch vụ được gắn cờ.
- Page/route: customer storefront service display
- Expected result: Dịch vụ có cờ ẩn giá hiển thị `liên hệ nhận báo giá`.
- Actual result: Chưa có/cần kiểm tra hiển thị này.
- Cross-links: UT-20260618-030
- Initial bucket: services/customer display
- Status: open

#### UT-20260618-013 - Product detail mobile buttons need larger ergonomic layout
- Reporter note: `product/[id]`: trên mobile các nút bấm có kích thước lớn hơn và đặt vị trí phù hợp, tối ưu giao diện hiển thị.
- Page/route: `/product/[id]`
- Expected result: Nút bấm trên mobile đủ lớn, đúng vị trí và dễ thao tác.
- Actual result: Giao diện mobile chưa tối ưu.
- Initial bucket: customer mobile UX, product detail
- Status: open

#### UT-20260618-014 - Appointment statuses should auto-update from confirmation call
- Reporter note: `admin/appointments`: trạng thái cần thay đổi tự động. TT1 chờ xác nhận; nhân viên bấm SĐT gọi trực tiếp đến người đặt lịch thì hệ thống tự ghi nhận sang đã gọi xác nhận/đã xác nhận.
- Page/route: `/admin/appointments`
- Expected result: Click gọi SĐT ghi nhận trạng thái xác nhận phù hợp.
- Actual result: Trạng thái chưa tự động theo hành động gọi.
- Initial bucket: appointment workflow
- Status: open

#### UT-20260618-015 - Appointment next step needs direct/drop-off choices and repair creation handoff
- Reporter note: `admin/appointments`: sau xác nhận, hệ thống hiện 2 lựa chọn: khách đến trực tiếp hoặc khách gửi máy đến cửa hàng; sau khi chọn trạng thái hiển thị phù hợp và nút đổi sang `lên đơn`, bấm vào chuyển đến trang sửa chữa và mở tạo phiếu sửa chữa, điền tên/SĐT.
- Page/route: `/admin/appointments`
- Expected result: Appointment có nhánh trực tiếp/gửi máy và handoff tạo phiếu sửa chữa prefill.
- Actual result: Workflow chưa đủ theo mô tả.
- Initial bucket: appointment workflow, repair handoff
- Status: open

#### UT-20260618-016 - Repair technical notes are duplicated
- Reporter note: `admin/repairs`: ghi chú kỹ thuật đang bị ghi lặp lại mặc dù KTV hay admin chỉ nhập đúng 1 lần.
- Page/route: `/admin/repairs`
- Expected result: Ghi chú kỹ thuật chỉ lưu/hiển thị một lần cho một lần nhập.
- Actual result: Ghi chú bị lặp.
- Cross-links: UT-20260618-025
- Initial bucket: repair data/UI duplication
- Status: open

#### UT-20260618-017 - Repair completion via POS does not move repair to correct completed state
- Reporter note: `admin/repairs`: hoàn tất đơn sửa chữa đang tích hợp thanh toán trực tiếp tại POS nhưng đơn sửa chữa không chuyển trạng thái đúng (hoàn tất đơn), lại ghi nhận một đơn POS với giá bill bằng bill sửa chữa.
- Page/route: `/admin/repairs`, `/admin/pos`
- Expected result: Thanh toán POS cho sửa chữa hoàn tất đúng phiếu sửa chữa theo workflow lưu trên Firebase.
- Actual result: Phiếu sửa chữa không chuyển trạng thái đúng và phát sinh đơn POS như bill sửa chữa.
- Cross-links: UT-20260618-005, UT-20260618-007
- Initial bucket: repair workflow, POS payment integration, order/revenue classification
- Status: open

#### UT-20260618-018 - Repair issue entry should suggest service groups per issue, not force one group
- Reporter note: `admin/repairs`: trong tạo phiếu sửa chữa, mục Chi tiết sửa chữa đang cho chọn nhóm dịch vụ nhưng không có ý nghĩa thực tế vì có thể chọn nhiều bệnh, mỗi bệnh thuộc nhóm khác nhau. Nên nhập tên bệnh và hệ thống tự gợi ý nhóm dịch vụ liên quan; mục đích nhóm dịch vụ là áp dụng khuyến mãi mua kèm sản phẩm theo dịch vụ.
- Page/route: `/admin/repairs`
- Expected result: Mỗi bệnh có thể gợi ý/thuộc nhóm dịch vụ riêng để phục vụ khuyến mãi liên quan.
- Actual result: UI chọn nhóm dịch vụ hiện tại không khớp mô hình nhiều bệnh.
- Initial bucket: repair intake UX, service/discount linkage
- Status: open

#### UT-20260618-019 - Repair screen-lock password needs pattern entry support
- Reporter note: `admin/repairs`: mục mật khẩu màn hình cần hỗ trợ hình vẽ 9 điểm; nhân viên nối như bình thường nhưng mật khẩu hiện dạng `1->2->3->5->7->8->9`.
- Page/route: `/admin/repairs`
- Expected result: Có cách nhập pattern lock 9 điểm và lưu/hiển thị thứ tự nối.
- Actual result: Chưa hỗ trợ đúng kiểu mật khẩu hình vẽ.
- Initial bucket: repair intake UX
- Status: open

#### UT-20260618-020 - New repair default status must always be waiting intake
- Reporter note: `admin/repairs`: trạng thái phiếu khi khởi tạo luôn mặc định là chờ tiếp nhận, không cho tùy chọn trạng thái như hiện tại.
- Page/route: `/admin/repairs`
- Expected result: Phiếu mới luôn bắt đầu ở trạng thái chờ tiếp nhận theo workflow Firebase.
- Actual result: Hiện còn cho tùy chọn trạng thái khi tạo.
- Initial bucket: repair workflow
- Status: open

#### UT-20260618-021 - Warranty calculation for repairs without parts
- Reporter note: `admin/repairs`: tính bảo hành cho các trường hợp sửa không cần linh kiện.
- Page/route: `/admin/repairs`
- Expected result: Phiếu sửa chữa không dùng linh kiện vẫn có logic bảo hành phù hợp.
- Actual result: Chưa có/cần kiểm tra tính bảo hành cho trường hợp này.
- Initial bucket: repair warranty
- Status: open

#### UT-20260618-022 - Repair condition/history needs Other field
- Reporter note: `admin/repairs`: trong phiếu sửa chữa, `Tình trạng & Lịch sử máy` có thêm mục khác để điền thêm lý do cho một số trường hợp.
- Page/route: `/admin/repairs`
- Expected result: Có mục `Khác` để nhập lý do/tình trạng bổ sung.
- Actual result: Chưa có mục này.
- Initial bucket: repair intake UX
- Status: open

#### UT-20260618-023 - Technician detail should collapse ticket log by default
- Reporter note: `admin/technician`: chi tiết phiếu ẩn nhật ký phiếu; khi nào bấm xem mới hiện ra.
- Page/route: `/admin/technician`
- Expected result: Nhật ký phiếu bị ẩn mặc định, có thao tác xem khi cần.
- Actual result: Nhật ký hiển thị ngay trong chi tiết phiếu.
- Initial bucket: technician UI
- Status: open

#### UT-20260618-024 - Technician detail must show all selected parts, test or used
- Reporter note: `admin/technician`: danh sách linh kiện đã chọn dù `test` hay `sử dụng` đều hiển thị trong chi tiết phiếu khi KTV mở xem; các trường hợp thêm/xóa linh kiện được quy định trong workflow sửa chữa.
- Page/route: `/admin/technician`
- Expected result: Chi tiết phiếu KTV hiển thị đủ linh kiện đã chọn theo workflow, không hardcode trạng thái.
- Actual result: Cần kiểm tra/hoàn thiện hiển thị đủ linh kiện test và sử dụng.
- Initial bucket: technician UI, repair workflow
- Status: open

#### UT-20260618-025 - Technician technical notes are duplicated
- Reporter note: `admin/technician`: ghi chú kỹ thuật đang bị ghi lặp lại mặc dù KTV hay admin chỉ nhập đúng 1 lần.
- Page/route: `/admin/technician`
- Expected result: Ghi chú kỹ thuật chỉ lưu/hiển thị một lần cho một lần nhập.
- Actual result: Ghi chú bị lặp.
- Cross-links: UT-20260618-016
- Initial bucket: repair data/UI duplication
- Status: open

#### UT-20260618-026 - Services need hide-price flag and customer quote text
- Reporter note: `admin/services`: tạo dịch vụ mới, vì giá dịch vụ thường dao động nên cần tùy chọn ẩn giá và hiển thị phía khách hàng `liên hệ nhận báo giá`.
- Page/route: `/admin/services`
- Expected result: Dịch vụ có tùy chọn ẩn giá; phía khách hiển thị `liên hệ nhận báo giá`.
- Actual result: Chưa có/cần hoàn thiện tùy chọn này.
- Cross-links: UT-20260618-012
- Initial bucket: services schema/admin UI/customer display
- Status: open

#### UT-20260618-027 - Services module is isolated from other features
- Reporter note: `admin/services`: phần dịch vụ đang bị cô lập, chưa thể sử dụng nhiều thông tin cho các tính năng khác; cần đề xuất sau.
- Page/route: `/admin/services`
- Expected result: Sau khi tổng hợp lỗi, cần đánh giá cách dùng dữ liệu dịch vụ cho các tính năng khác.
- Actual result: Dịch vụ chưa liên kết đủ với các workflow khác.
- Initial bucket: services architecture
- Status: open

### Batch 2 - User Reported 2026-06-18

#### UT-20260618-028 - Products, parts, and inventory responsibilities need restructuring
- Reporter note: `admin/products`, `admin/inventory`, `admin/parts`: tái cấu trúc 3 file này để thực hiện đúng chức năng.
- Page/route: `/admin/products`, `/admin/inventory`, `/admin/parts`, `/admin/inventory/stock`
- Expected result: `products` là danh sách sản phẩm, thao tác thêm sản phẩm, thao tác tạo đề xuất nhập hàng. `parts` là danh sách linh kiện, thao tác thêm linh kiện, thao tác đề xuất nhập linh kiện. `inventory` là danh sách phiếu nhập hàng, danh sách phiếu đề xuất, danh sách phiếu đã đặt hàng, tổng hợp từ products và parts. Thao tác đề xuất ở `inventory` lấy logic từ tạo đề xuất nhập hàng product và đề xuất nhập linh kiện parts. `inventory/stock` giữ chức năng hiện tại.
- Actual result: Chức năng hiện tại giữa 3 trang chưa đúng ranh giới mong muốn.
- Initial bucket: inventory/products/parts workflow architecture
- Status: open

#### UT-20260618-029 - Variant grouping should be derived from category instead of separate configuration
- Reporter note: Nhóm biến thể sẽ không cấu hình riêng; logic giữ nguyên nhưng tính theo danh mục. Danh mục được chọn giống nhau sẽ gom về cùng một nhóm biến thể và hiển thị tại trang khách hàng như hiện tại, đơn giản hóa quy trình.
- Page/route: `/admin/products`, customer product display
- Expected result: Các sản phẩm cùng danh mục được gom nhóm biến thể tự động, không cần cấu hình nhóm biến thể riêng.
- Actual result: Quy trình nhóm biến thể hiện còn cần cấu hình riêng/chưa theo mong muốn đơn giản hóa.
- Initial bucket: product variants, taxonomy workflow
- Status: open

#### UT-20260618-030 - Suppliers need richer detail similar to customers
- Reporter note: `admin/suppliers`: thêm các thông tin chi tiết hơn tương tự như trang `admin/customers`.
- Page/route: `/admin/suppliers`
- Expected result: Nhà cung cấp có trang/thông tin chi tiết phong phú tương tự khách hàng.
- Actual result: Thông tin nhà cung cấp hiện chưa đủ chi tiết theo nhu cầu.
- Initial bucket: suppliers CRM-like detail
- Status: open

### Batch 3 - User Reported 2026-06-18

#### UT-20260618-031 - Remove admin AI Creator page
- Reporter note: Loại bỏ trang `admin/ai-creator`.
- Page/route: `/admin/ai-creator`
- Expected result: Trang AI Creator không còn trong admin.
- Actual result: Trang này hiện vẫn tồn tại/cần loại bỏ.
- Initial bucket: admin navigation/route cleanup
- Status: open

#### UT-20260618-032 - Settings payment and bank tab should use TOTP
- Reporter note: `admin/settings` tab thanh toán và Ngân hàng thay đổi sang sử dụng TOTP.
- Page/route: `/admin/settings`
- Expected result: Tab thanh toán/ngân hàng dùng TOTP cho xác thực/cấu hình theo yêu cầu.
- Actual result: Luồng hiện tại chưa đúng yêu cầu TOTP hoặc cần chuyển đổi.
- Initial bucket: settings security, payment/bank config, TOTP
- Status: open

## Required Fields Per Error
- Error ID:
- Reporter note:
- Page/route:
- Role/account:
- Steps to reproduce:
- Expected result:
- Actual result:
- Screenshot/log:
- Frequency:
- Initial bucket:
- Status: open

### Part 17 - Appointment phone call confirms booking
- Covered IDs: UT-20260618-014
- Files touched: `src/app/admin/appointments/page.tsx`
- Change: When staff clicks an appointment phone number, the existing `tel:` action is preserved and pending appointments are marked `confirmed` with `calledAt`, `confirmedAt`, and `updatedAt` timestamps.
- Guardrail: Completed/cancelled/already-confirmed appointments are not changed by clicking the phone link.
- Verification: `eslint src/app/admin/appointments/page.tsx`, `next typegen`, `tsc --noEmit`, and `git diff --check` passed.

### Part 18 - Appointment intake method before repair creation
- Covered IDs: UT-20260618-014
- Files touched: `src/app/admin/appointments/page.tsx`
- Change: Confirmed appointments now require staff to choose whether the customer comes directly or sends the device to the store before the repair-ticket link appears. The choice is saved as `intakeMethod` on the appointment.
- Guardrail: Appointment `status` remains one of the existing public states (`pending`, `confirmed`, `completed`, `cancelled`) so customer tracking is not forced to understand new status IDs.
- Verification: `eslint src/app/admin/appointments/page.tsx`, `next typegen`, `tsc --noEmit`, and `git diff --check` passed.

### Part 19 - Repair screen pattern passcode input
- Covered IDs: UT-20260618-019
- Files touched: `src/features/repairs/RepairEditorModal.tsx`
- Change: The repair editor keeps the existing passcode text field and adds a 9-point pattern keypad that writes the selected order into `devicePasscode` as `1->2->3` style text.
- Guardrail: No repair schema change; saved/printed passcode behavior continues to use the existing `deviceInfo.passcode` field.
- Verification: `eslint src/features/repairs/RepairEditorModal.tsx`, `next typegen`, `tsc --noEmit`, and `git diff --check` passed.

### Part 20 - Service warranty for repairs without parts
- Covered IDs: UT-20260618-021
- Files touched: `src/features/repairs/RepairTicketBoard.tsx`, `src/features/repairs/RepairWarrantyModal.tsx`, `src/app/admin/repairs/page.tsx`, `src/app/api/repairs/handover/route.ts`, `src/lib/types/repair.ts`
- Change: Completed repair tickets without warranty-eligible parts can now open the warranty flow when the service/category has a warranty template. The warranty modal allows creating a service/repair warranty ticket without selected parts. Handover now stamps `serviceWarrantyExpiresAt` from the service taxonomy `warrantyMonths`, falling back to 3 months when no category value exists.
- Guardrail: Part warranty behavior is unchanged; if active warranty parts exist, staff still must select at least one part before creating the warranty ticket.
- Verification: `eslint src/features/repairs/RepairTicketBoard.tsx src/features/repairs/RepairWarrantyModal.tsx src/app/admin/repairs/page.tsx src/app/api/repairs/handover/route.ts`, `next typegen`, `tsc --noEmit`, and `git diff --check` passed.

### Part 21 - Repair issue service-category suggestions
- Covered IDs: UT-20260618-018
- Files touched: `src/features/repairs/RepairEditorModal.tsx`, `src/lib/types/repair.ts`
- Change: Each repair issue row now suggests service taxonomy groups from the typed issue name. Selecting a suggestion stores `categoryPath` and `serviceName` on that issue while also updating the ticket-level service/category fallback.
- Guardrail: The existing manual service category selector remains available; existing tickets without per-issue category metadata continue to work.
- Verification: `eslint src/features/repairs/RepairEditorModal.tsx src/lib/types/repair.ts`, `next typegen`, `tsc --noEmit`, and `git diff --check` passed.

### Part 22 - Supplier richer profile fields
- Covered IDs: UT-20260618-030
- Files touched: `src/app/admin/suppliers/page.tsx`, `src/lib/types/inventory.ts`
- Change: Suppliers can now store and display richer CRM-like profile fields: company/legal name, supplier type, website, payment terms, assigned owner, and tags. Search now includes company name, tax code, and tags.
- Guardrail: Existing supplier debt/payment flow and transaction history remain unchanged; all new fields are optional for backward compatibility.
- Verification: `eslint src/app/admin/suppliers/page.tsx src/lib/types/inventory.ts`, `next typegen`, `tsc --noEmit`, and `git diff --check` passed.

### Part 23 - Category-derived product variants
- Covered IDs: UT-20260618-029
- Files touched: `src/app/(customer)/_lib/server-queries.ts`, `src/app/(customer)/product/[id]/page.tsx`, `src/app/admin/products/page.tsx`
- Change: Product detail variants are now derived from the product's deepest selected retail category instead of manually configured `seriesId`. The manual Series/variant grouping tab has been removed from `/admin/products` so staff only manages products and categories.
- Guardrail: Existing `seriesId` data is left untouched for backward compatibility; the customer-facing variant list ignores it and does not require a new Firestore composite index.
- Verification: `eslint src/app/admin/products/page.tsx`, `eslint src/app/(customer)/_lib/server-queries.ts src/app/(customer)/product/[id]/page.tsx`, `next typegen`, `tsc --noEmit`, and `git diff --check` passed.

### Part 24 - AI Creator removal recheck
- Covered IDs: UT-20260618-031
- Files touched: `roadmap/ui/data/ai_plans/plan_user_test_error_intake_20260618.md`
- Change: Rechecked the AI Creator removal. The tracked source no longer contains `/admin/ai-creator`, `AI Creator`, `manage_ai_creator`, or `aiCreator`; the remaining empty local route folder was removed from the workspace.
- Guardrail: No admin navigation, permission registry, or role preset changes were needed because the tracked code had already been cleaned up.
- Verification: `rg "manage_ai_creator|aiCreator|ai-creator|AI Creator" src/lib src/app/admin src/components` returned no source matches, `git ls-files src/app/admin/ai-creator` returned no tracked files, and `git diff --check` passed.

### Part 25 - Bank settings require TOTP state
- Covered IDs: UT-20260618-032
- Files touched: `src/components/admin/settings/BankIntegrationConfig.tsx`, `src/app/api/admin/bank-config/route.ts`, `src/app/api/admin/bank-config/totp/setup/route.ts`, `src/app/api/admin/bank-config/totp/verify/route.ts`
- Change: The bank config API now returns `totpEnabled` to the settings UI, so existing Authenticator setup is recognized before editing. The setup/verify APIs reject attempts to overwrite an already-enabled TOTP secret, and the UI requires a verified TOTP token before saving bank/payment config.
- Guardrail: TOTP secret is still never returned by the read API; existing bank account display and VietQR config fields remain unchanged.
- Verification: `eslint src/components/admin/settings/BankIntegrationConfig.tsx src/app/api/admin/bank-config/route.ts src/app/api/admin/bank-config/totp/setup/route.ts src/app/api/admin/bank-config/totp/verify/route.ts` passed with existing `<img>` warnings only, `next typegen`, `tsc --noEmit`, and `git diff --check` passed.

### Part 26 - Inventory lists split by receipt status
- Covered IDs: UT-20260618-028
- Files touched: `src/app/admin/inventory/page.tsx`
- Change: `/admin/inventory` now separates the shared `import_receipts` collection into visible tabs for completed import receipts, draft proposal receipts, ordered receipts, and all receipts. This starts moving inventory toward the requested aggregate workspace while leaving `/admin/inventory/stock` unchanged.
- Guardrail: No receipt mutation logic was moved in this step; products and parts proposal creation flows continue to work as before.
- Verification: `eslint src/app/admin/inventory/page.tsx`, `next typegen`, `tsc --noEmit`, and `git diff --check` passed.

### Part 27 - Product import proposal action
- Covered IDs: UT-20260618-028
- Files touched: `src/app/admin/products/page.tsx`, `src/features/parts/ImportReceiptModals.tsx`
- Change: `/admin/products` now has a direct retail import proposal action. It reuses the existing import receipt modal, starts locked in retail-product mode, and passes the current supplier list so staff can create product purchase proposals without going through the parts page.
- Guardrail: The shared modal remains backward-compatible for `/admin/parts`; parts keeps its component/retail toggle, while products only opens the retail flow.
- Verification: `eslint src/app/admin/products/page.tsx src/features/parts/ImportReceiptModals.tsx`, `next typegen`, `tsc --noEmit`, and `git diff --check` passed.

### Part 28 - Inventory tab deep links
- Covered IDs: UT-20260618-028
- Files touched: `src/app/admin/inventory/page.tsx`
- Change: `/admin/inventory` now accepts `?tab=completed`, `?tab=draft`, `?tab=ordered`, or `?tab=all` so product/part proposal entry points can send staff directly to the aggregate receipt/proposal/order list.
- Guardrail: The default remains completed import receipts; no receipt mutation behavior changed.
- Verification: `eslint src/app/admin/inventory/page.tsx`, `next typegen`, `tsc --noEmit`, and `git diff --check` passed.

### Part 29 - Product proposal handoff to inventory
- Covered IDs: UT-20260618-028
- Files touched: `src/app/admin/products/page.tsx`
- Change: After staff creates a retail product import proposal from `/admin/products`, the page now routes to `/admin/inventory?tab=draft` so proposal follow-up happens in the inventory aggregate workspace.
- Guardrail: Product creation/editing remains on `/admin/products`; only the purchase proposal follow-up is handed off.
- Verification: `eslint src/app/admin/products/page.tsx`, `next typegen`, `tsc --noEmit`, and `git diff --check` passed.

### Part 30 - Parts proposal handoff to inventory
- Covered IDs: UT-20260618-028
- Files touched: `src/app/admin/parts/page.tsx`
- Change: After staff creates an import proposal from `/admin/parts`, the page now routes to `/admin/inventory?tab=draft` so proposal follow-up happens in the inventory aggregate workspace.
- Guardrail: Parts catalog creation/editing remains on `/admin/parts`; existing proposal creation logic is reused unchanged.
- Verification: `eslint src/app/admin/parts/page.tsx`, `next typegen`, `tsc --noEmit`, and `git diff --check` passed.
