# Walkthrough: POS Discount Rules & Repair Ticket Phone Lookup Fix

## Changes Made

### 1. POS Discount Matching Logic Fix
- **File modified**: [discountCalc.ts](file:///m:/QLCH_VanLanh/src/lib/discountCalc.ts)
  - Refactored `calculateAccessoryDiscounts` to accept optional `category` and `categoryIds` for shopping cart items.
  - Implemented the `matchesCategoryId` helper function to perform prefix matching against taxonomy slugs (e.g. product categoryIds `['phu-kien', 'phu-kien/op-lung']` matches rule `'phu-kien'`).
  - Improved matching robustness using priority levels: Keywords first, then Category Path, then fallback string match.
- **File modified**: [page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/pos/page.tsx)
  - Resolved product category details from the `products` list when feeding items into `calculateAccessoryDiscounts`.
  - Added `products` to the React dependency array of the discount side-effect.

### 2. POS Repair Ticket Lookup & Manual Selection & Layout Fix
- **File modified**: [page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/pos/page.tsx)
  - Redirected Firestore query target to `customer.phone` (nested object property in the `repairs` collection).
  - Modified query structure to avoid missing Firebase composite indexes: it now queries only by `customer.phone` and does client-side filtering and sorting for status (`unpaid` / `partial`) and date descending.
  - Standardized customer information mapping with fallbacks for names and phone numbers.
  - **Removed automatic ticket injection**: Removed the logic that auto-adds all fetched repair tickets to the cart upon phone lookup. Unpaid tickets are loaded and displayed in the sidebar, but they remain out of the cart until manually selected.
  - **Removed URL handoff auto-addition**: Cleaned up the `useEffect` block that was auto-injecting `repairId` upon page load, making sure all items are added by active click action.
  - **Duplicate prevention fix**: Corrected `addRepairToCart` duplicate prevention logic. It now checks `repairTicketId` matching, ensuring that cashiers cannot accidentally add the same repair ticket twice, which would crash or warning-clutter the React virtual DOM with duplicate key errors.
- **File modified**: [PosCartPanel.tsx](file:///m:/QLCH_VanLanh/src/features/pos/PosCartPanel.tsx)
  - Added React `useState` and `useEffect` hooks to maintain collapse state.
  - Wrapped the mapped `linkedRepairs` tickets list inside a collapsible scrollable div (`max-h-[160px] overflow-y-auto pr-1 border border-blue-100 rounded-lg p-1.5 bg-blue-50/20`).
  - **Collapsible Toggle**: Added a manual toggle button ("Thu gọn" / "Hiển thị") next to the repair ticket list title to collapse the UI.
  - **Auto-collapse on Selection**: Configured the "Thêm vào HĐ" button click handler to collapse the repair list immediately after adding a ticket to the cart, automatically restoring space for the shopping cart.
  - **Auto-expand on Search**: Added a side-effect that auto-expands the list whenever `linkedRepairs` updates (e.g. searching a new phone number).

## Verification Results

We verified the fixes end-to-end using the browser automation tools:
1. Loaded the POS page at `http://localhost:3000/admin/pos`.
2. Inputted SĐT `0336813825`.
3. Observed that the customer name **test v4** was successfully mapped.
4. **Verified empty cart state**: The cart correctly showed "Chưa có sản phẩm" (no auto-added tickets).
5. **Preserved Layout integrity**: Confirmed that the shopping cart layout is fully visible and not collapsed, and the repair tickets list has a scrollbar when overflowing.
6. **Tested Collapsible Toggle**:
   - Confirmed clicking **"Thu gọn"** successfully collapsed (hid) the list of tickets.
   - Confirmed clicking **"Hiển thị"** expanded it back.
7. Clicked the **"Thêm vào HĐ"** (Add to Invoice) button next to the first ticket in the sidebar.
8. Verified that:
   - The repair ticket items and labor were added to the cart, updating the checkout total correctly to `4,388,886đ`.
   - **The repair tickets list automatically collapsed** (button state changed to 'Hiển thị'), restoring full screen focus on the cart and payment forms.
9. Expanded the list and clicked the **"Thêm vào HĐ"** on the same ticket again. Verified that the system blocks duplicates and displays a toast message *"Phiếu sửa chữa đã có trong hóa đơn!"*.
10. Clicked the **"Thêm vào HĐ"** on the second ticket (`qfkSKf`) and verified that it successfully combined both tickets, updating the total correctly to `8,488,886đ` (`4,388,886đ` + `4,100,000đ`).
