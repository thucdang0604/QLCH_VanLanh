# Refactoring Task Tracker

## Phase 1A: Modal Component
- [x] Tạo `src/components/admin/Modal.tsx`
- [x] Swap modal ở `products/page.tsx` _(không có inline modal)_
- [x] Swap modal ở `services/page.tsx`
- [x] Swap modal ở `parts/page.tsx` _(không có inline modal)_
- [x] Swap modal ở `pos/page.tsx` _(không có inline modal)_
- [x] Swap modal ở `inventory/page.tsx`
- [x] Swap modal ở `orders/page.tsx`
- [x] Swap modal ở `staff/page.tsx`
- [x] Swap modal ở `commissions/page.tsx`
- [x] Swap modal ở `repairs/page.tsx`
- [x] Swap modal ở `technician/page.tsx`
- [x] Swap modal ở `revenue/page.tsx`
- [x] Swap modal ở `articles/page.tsx`
- [x] Swap modal ở `products/page.tsx`
- [x] Swap modal ở `settings/repairs/page.tsx` _(đã dùng Modal sẵn)_

## Phase 1B: MediaManager thống nhất
- [x] Swap image picker ở `products/page.tsx`
- [x] Swap image picker ở `services/page.tsx`
- [x] Swap image picker ở `parts/page.tsx`
- [x] Swap image picker ở `pos/page.tsx`
- [x] Xoá `listMediaFromFirestore` nếu không còn ai dùng

## Phase 2: Cart & Checkout
- [ ] Tạo `CartDrawer` component
- [ ] Cập nhật `CartContext` (isDrawerOpen, hydration)
- [ ] Gộp `/checkout` thành one-page
- [ ] `/cart` redirect về `/checkout`
- [ ] Stock real-time check

## Phase 3: Geofenced Review
- [ ] Geolocation + Haversine trên `/rate`
- [ ] PIN fallback
- [ ] Server-side rate limit API
- [ ] Admin Settings config (toạ độ, bán kính, PIN)

## Phase 4: Inventory Overhaul
- [ ] `UniversalProductModal` component
- [ ] Refactor `products/page.tsx` (view-only)
- [ ] Refactor `parts/page.tsx` (bỏ thêm LK, giữ đề xuất)
- [ ] Refactor `inventory/page.tsx` (snapshotted data)
- [ ] Refactor `pos/page.tsx` (tích hợp UniversalProductModal)
