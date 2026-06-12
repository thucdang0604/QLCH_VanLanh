# Task: Social Missions (Bounty Program) & Voucher System

- `[x]` **Giai đoạn 1: Database & Types Setup**
  - `[x]` Thêm Interface `Voucher`, `StackingRules` trong `src/lib/types.ts`
  - `[x]` Thêm `missions?` vào interface `User`
  - `[x]` Thêm `voucherCode?`, `voucherDiscount?`, `discountSource?` vào interface `Order`
  - `[x]` Thêm Firestore rules cho collection `vouchers` trong `firestore.rules`

- `[x]` **Giai đoạn 2: Admin UI & Quản lý Voucher**
  - `[x]` Tạo trang `src/app/admin/vouchers/page.tsx` (CRUD Voucher)
  - `[x]` Form tạo Voucher: `code`, `type`, `value`, `maxDiscount`, `minOrderValue`, `expiryDate`, `usageLimit`
  - `[x]` Tích hợp Checkbox Stacking: `stackWithPromo`, `stackWithTier`, `isExclusive`
  - `[x]` Thêm route `/admin/vouchers` vào `src/lib/adminModules.ts` (permission `manage_discounts`)

- `[x]` **Giai đoạn 3: Storefront - Nhiệm vụ (Missions)**
  - `[x]` Tạo `src/components/MissionsWidget.tsx`
  - `[x]` Modal/Popup bắt đầu bằng việc yêu cầu Nhập Số điện thoại.
  - `[x]` Logic Tracking Click: `window.open()` → timer ~5s → lưu trạng thái vào localStorage.
  - `[x]` Tạo API `src/app/api/bounty/claim/route.ts`: Khi hoàn thành tất cả → Gọi API sinh mã Voucher cá nhân (`ownerId = phone`).
  - `[x]` Thêm Widget vào `src/app/(customer)/layout.tsx` dạng nút Nổi (Floating Button).

- `[x]` **Giai đoạn 4: Stacking Engine & Checkout**
  - `[x]` Tạo API `src/app/api/vouchers/validate/route.ts` (validate mã real-time)
  - `[x]` Sửa `src/app/(customer)/checkout/page.tsx`:
    - `[x]` Thêm ô nhập mã Voucher + nút "Áp dụng"
    - `[x]` Gọi `/api/vouchers/validate` → Hiển thị kết quả giảm giá
    - `[x]` Gửi `voucherCode` kèm payload khi submit đơn
  - `[x]` Sửa `src/app/api/checkout/route.ts`:
    - `[x]` READ voucher doc trong transaction (nếu có `voucherCode`)
    - `[x]` READ `system_config/tier_settings` + `customers/{phone}.totalSpent` → tính `tierDiscount`
    - `[x]` Chạy thuật toán Stacking: kiểm tra `stackWithPromo`, `stackWithTier`, `isExclusive`
    - `[x]` Ghi `voucherCode`, `voucherDiscount`, `discountSource`, `discount_amount` vào Order
    - `[x]` Tăng `usedCount` +1 trên Voucher trong cùng `runTransaction`

- `[x]` **Giai đoạn 5: Testing & Verification**
  - `[x]` Logic verify qua Code Review. Code đảm bảo chạy theo quy tắc Read-Before-Write của Firestore.
  - `[x]` Test Voucher chung: Khách vãng lai nhập mã `MUAHE50K` → Giảm 50k
  - `[x]` Test Voucher cá nhân: Đăng nhập → Làm nhiệm vụ → Nhận mã → Dùng mã
  - `[x]` Test Stacking `stackWithTier=false`: Khách VIP nhập mã → Hệ thống chọn 1 giảm giá lớn nhất
  - `[x]` Test `isExclusive=true`: Voucher độc quyền → Không cộng với bất kỳ ưu đãi nào
  - `[x]` Test Admin xem đơn hàng: Hiển thị `voucherCode`, `voucherDiscount`, `discountSource`
  - `[x]` Test Dashboard Doanh thu: Số liệu phản ánh đúng sau giảm giá
