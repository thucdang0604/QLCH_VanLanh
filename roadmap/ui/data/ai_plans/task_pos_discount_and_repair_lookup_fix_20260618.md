# Task: POS Discount Rules & Repair Ticket Phone Lookup Fix

- [x] Analyze the POS accessory discount matching logic and identify why categories were not matching.
- [x] Fix `src/lib/discountCalc.ts` matching logic to check category IDs with hierarchical prefix matching.
- [x] Update `src/app/admin/pos/page.tsx` to pass category data to the calculator.
- [x] Pass repair service/category/issue context from POS into the discount calculator so service-category trigger rules actually activate.
- [x] Debug the phone number lookup for repair tickets in POS.
- [x] Modify the Firestore query in POS to target `customer.phone` instead of `customerPhone`.
- [x] Simplify the Firestore query to avoid index failures, filtering and sorting in-memory instead.
- [x] Remove automatic addition of repair tickets to the cart upon phone lookup, allowing manual selection.
- [x] Remove automatic URL handoff ticket insertion to ensure all ticket additions are strictly manual.
- [x] Constrain the repair tickets sidebar list height (`max-h-[160px] overflow-y-auto`) to protect the shopping cart layout from collapsing.
- [x] Add collapse state (`showRepairsList`) and manual toggle button ("Thu gọn" / "Hiển thị") next to the repair ticket list title in `PosCartPanel.tsx`.
- [x] Implement auto-expand on repair results load, and auto-collapse after adding a ticket to the invoice.
- [x] Fix duplicate protection logic in `addRepairToCart` by checking `repairTicketId` to avoid adding items of the same ticket multiple times and prevent duplicate key errors.
- [x] Verify the fixes using the browser subagent by testing with the customer phone `0336813825` to confirm manual adding, layout preservation, manual toggling, duplicate block, and auto-collapsing.
- [x] Log the changes in the project's documentation.
