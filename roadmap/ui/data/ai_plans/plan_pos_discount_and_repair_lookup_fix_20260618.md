# Plan: POS Discount Rules & Repair Ticket Phone Lookup Fix

## Goal Description
Fixing two critical issues in the POS page:
1. **POS Discount Rules matching**: Category-based discount matching for accessories in the shopping cart was not working because POS did not pass category information with the cart items. Additionally, trigger matching failed because POS only sent repair parts into the calculator, while the new rule builder creates triggers from service taxonomy (`triggerServiceCategory`) and service/issue keywords.
2. **POS Repair Ticket Lookup by Phone & Manual Selection & Layout Optimization**:
   - Entering a customer's phone number did not load their unpaid/partial repair tickets because the Firestore query searched for `customerPhone` (root-level field) whereas the tickets store customer data nested inside the `customer` object (`customer.phone`). Furthermore, the composite query caused a missing Firestore index error, which we resolved by querying simply by `customer.phone` and performing in-memory filtering and sorting.
   - **UX Improvement (Manual Selection)**: Previously, loading a customer's phone automatically added *all* their unpaid repair tickets to the cart, preventing cashiers from choosing which ticket to pay. We removed this automatic injection. Tickets now list on the sidebar with a "Thêm vào HĐ" (Add to Invoice) button, enabling manual, precise ticket selection.
   - **Layout Fix (Cart Occlusion & Collapsible Sidebar)**: The list of repair tickets could expand without limit, pushing down or completely hiding the shopping cart layout. To protect the workspace:
     - We constraint the tickets list's height and wrap it in a scrollable container.
     - **Toggle & Auto-Collapse**: We added a collapse button (toggle text "Thu gọn" / "Hiển thị") next to the repair ticket list title. To keep the screen clean, the list automatically collapses (closes) immediately after a ticket is successfully added to the invoice. It also auto-expands when a new set of repairs is fetched by searching another SĐT.
   - **Duplicate Item Prevention**: Fixed a bug where clicking "Thêm vào HĐ" multiple times on the same ticket added duplicate items into the cart (due to comparing `productId` with `repair.id` while cart items are identified by `repair.id_part_X`). We changed the check to examine `repairTicketId`.

## Proposed Changes

### POS Cart Panel & Discount Calculator

#### [MODIFY] [discountCalc.ts](file:///m:/QLCH_VanLanh/src/lib/discountCalc.ts)
- Added `matchesCategoryId` helper to check if a product's category paths match the rule's target category slug (supporting hierarchical paths).
- Improved matching logic to inspect three paths in order: SEO Keywords (from taxonomy), Category IDs (prefix matching), and Fallback name matching.
- Updated typing of `CartItem` inside `discountCalc.ts` to accept `category` and `categoryIds`.

#### [MODIFY] [page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/pos/page.tsx)
- Cart items mapped during discount calculations now resolve `category` and `categoryIds` by referencing the products state list.
- Added `products` to the dependency array of the automatic discount calculation `useEffect` so it triggers appropriately.
- Added repair-ticket context (`serviceName`, `categoryPath`, per-issue `categoryPath/serviceName`) to the calculator so rules created from service taxonomy can trigger in POS even when the repair uses no matched part.
- Fixed the repair ticket mapper to read modern repair fields such as `customer.name`, `customer.phone`, and `deviceInfo.model`.

### POS Repair Ticket Lookup & Manual Selection & Layout

#### [MODIFY] [page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/pos/page.tsx)
- Replaced the Firestore query targeting `customerPhone` with a query targeting the nested field `customer.phone`.
- Simplified the query by removing the `payment.status` filter and the `createdAt` sort order, avoiding missing composite index failures.
- Implemented in-memory filtering (`unpaid`, `partial`) and descending sorting based on `createdAt` (resolving the timestamps via `.toMillis()`).
- Added robust fallbacks for customer name and phone extraction from the nested `customer` object as well as legacy root-level properties.
- **Removed the auto-addition logic** inside `lookupRepairByPhone` so that tickets are loaded into `linkedRepairs` state for display, but not automatically added to the cart array.
- **Removed the URL-handoff auto-add useEffect** block that would auto-inject the `repairId` upon page load, guaranteeing the cart starts empty and all additions are manual.
- **Fixed duplicate checking** in `addRepairToCart` by matching against the items' `repairTicketId` instead of `productId` (which is stored as `repair.id_part_index`).

#### [MODIFY] [PosCartPanel.tsx](file:///m:/QLCH_VanLanh/src/features/pos/PosCartPanel.tsx)
- Added `useState` and `useEffect` from React to implement collapsible widget logic.
- Declared a `showRepairsList` local state variable. Added a side-effect that auto-expands the list when a new set of repairs is fetched.
- Wrapped the mapped `linkedRepairs` tickets list inside a collapsible scrollable div (`max-h-[160px] overflow-y-auto pr-1`) which expands/collapses based on `showRepairsList`.
- Added manual "Thu gọn"/"Hiển thị" button next to the title.
- Updated the "Thêm vào HĐ" button click handler to execute both `onAddRepairToCart(repair)` and `setShowRepairsList(false)`.

## Verification Plan

### Manual Verification
- Verified by navigating to `/admin/pos` and typing customer phone number `0336813825`.
- Verified that the customer name "test v4" was loaded, the cart remained empty, and pending repair tickets were displayed in the sidebar.
- Checked layout: confirmed the shopping cart is not hidden or squished, and the repair tickets sidebar widget has a scrollbar when overflow occurs.
- Tested toggle collapse: confirmed clicking "Thu gọn" correctly hides the tickets list, and "Hiển thị" brings it back.
- Clicked "Thêm vào HĐ" (Add to Invoice) for a specific ticket and verified that only the selected ticket's items were added, and the ticket list automatically collapsed (closed).
- Clicked the button on the same ticket again and verified that the system prevents duplicates and shows a toast warning.
- Clicked the button on a second different ticket and verified both were merged correctly.
