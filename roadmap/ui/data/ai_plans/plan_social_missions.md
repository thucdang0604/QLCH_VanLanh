# Social Missions (Bounty Program) & Voucher System

**Status:** completed; OTP/idempotency production E2E được theo dõi trong plan follow-up riêng ngày 11.06.2026.

Tính năng tăng cường tương tác (Growth Hacking) bằng cách tặng Voucher cho khách hàng khi họ hoàn thành các nhiệm vụ mạng xã hội (VD: Follow Fanpage, Tiktok, v.v). Hệ thống xác thực bằng phương pháp "Honor System" (Click Tracking).

---

## 1. Database Schema (Firestore)

### [NEW] `vouchers` collection
Tạo collection lưu trữ thông tin mã giảm giá:
- `code` (string): Mã giảm giá (uppercase, unique)
- `type` (string): `fixed` (Giảm tiền mặt) hoặc `percentage` (Giảm %)
- `value` (number): Giá trị giảm
- `maxDiscount` (number): Số tiền giảm tối đa (Dành cho loại %)
- `minOrderValue` (number): Giá trị đơn hàng tối thiểu để áp dụng
- `expiryDate` (timestamp): Ngày hết hạn
- `usageLimit` (number): Giới hạn số lần dùng mã (0 = không giới hạn)
- `usedCount` (number): Số lần đã dùng
- `isActive` (boolean): Trạng thái hoạt động
- `ownerId` (string | null): UID của người dùng (Bounty Program — mã cá nhân)
- `stackingRules` (object):
  ```json
  {
    "isExclusive": false,
    "stackWithPromo": true,
    "stackWithTier": false
  }
  ```
- `createdAt`, `updatedAt` (timestamp)

### [MODIFY] `users/{userId}`
Thêm object `missions` để lưu tiến trình nhiệm vụ:
```json
{
  "missions": {
    "facebook_like": true,
    "tiktok_follow": false,
    "completedAt": null
  }
}
```

### [MODIFY] Order document (trong `orders` collection)
Bổ sung các trường sau để lưu vết giảm giá khi áp dụng Voucher:
- `voucherCode` (string | null): Mã Voucher đã dùng
- `voucherDiscount` (number): Số tiền giảm từ Voucher
- `discountSource` (string | null): `'voucher'` hoặc `'tier'` — ghi nhận nguồn giảm giá đã áp dụng

---

## 2. Động cơ Cộng dồn Giảm giá (Discount Stacking Engine)

Hệ thống hiện có 5 cơ chế giảm giá. Để ngăn cộng dồn vô kiểm soát, chúng ta phân thành các nhóm và cho Admin quyền cấu hình trên từng Voucher:

### Phân nhóm Giảm giá (Discount Groups)
- **Nhóm 1: Giá Khuyến mãi sản phẩm (`price_promo`).** Luôn được áp dụng trước tiên — đây là giá bán thực tế trên web.
- **Nhóm 2: Ưu đãi Hạng Thành viên (`tier_discount`).** Giảm % theo hạng VIP. ⚠️ **Lưu ý:** Hàm `getTierDiscountPercent()` hiện đã được định nghĩa nhưng chưa được gọi ở checkout web. Plan này sẽ tích hợp nó vào `/api/checkout/route.ts`.
- **Nhóm 3: Mã giảm giá / Voucher (`voucher`).** Mã chung (Marketing) hoặc mã cá nhân (Bounty Program).
- **Nhóm 4: Mua kèm phụ kiện (`cross_sell_discount`).** Chỉ hoạt động ở POS (bán tại quầy), **không ảnh hưởng đến Web Checkout** → Loại khỏi Stacking Engine của Web.

### Quyền năng của Admin (Stacking Rules)
Trên mỗi mã Voucher, Admin có các tùy chọn:
- `stackWithPromo` (boolean, default `true`): Cho phép áp dụng chung với Giá khuyến mãi. Vì hầu hết SP đều có `price_promo`, nên mặc định BẬT.
- `stackWithTier` (boolean, default `false`): Cho phép áp dụng chung với Hạng thành viên VIP.
- `isExclusive` (boolean, default `false`): Nếu `true`, Voucher này KHÔNG ĐƯỢC DÙNG CHUNG với bất kỳ ưu đãi nào khác ngoài giá bán. Giống khái niệm "Mã này không áp dụng cùng các chương trình khuyến mãi khác".

### Thuật toán áp dụng tại Checkout (Backend)
1. Tính `subtotal` = tổng `finalPrice * qty` (trong đó `finalPrice` = `price_promo > 0 ? price_promo : price_original`).
2. Nếu có `voucherCode`:
   - READ voucher doc trong transaction.
   - Validate: `isActive`, `expiryDate`, `minOrderValue`, `usageLimit > usedCount`, `ownerId` (nếu có).
   - Kiểm tra Stacking Rules:
     - Nếu `isExclusive == true` → Không áp dụng Tier Discount.
     - Nếu `stackWithTier == false` VÀ khách có hạng VIP → Từ chối hoặc bỏ qua Tier (chọn 1).
   - Tính `voucherDiscount`:
     - Loại `fixed`: `voucherDiscount = value`.
     - Loại `percentage`: `voucherDiscount = min(subtotal * value / 100, maxDiscount)`.
3. Nếu có Tier Discount VÀ Voucher cho phép `stackWithTier`:
   - `tierDiscount = subtotal * tierPercent / 100`.
   - `total_discount = voucherDiscount + tierDiscount`.
4. Nếu Voucher KHÔNG cho phép `stackWithTier`:
   - So sánh `voucherDiscount` vs `tierDiscount`, chọn cái lớn hơn cho khách.
   - Ghi `discountSource = 'voucher'` hoặc `'tier'`.
5. WRITE: Tăng `usedCount` của Voucher +1 trong cùng `runTransaction`.

---

## 3. Phạm vi Mã nguồn (Scope of Changes)

### [MODIFY] `src/lib/types.ts`
- Thêm interface `Voucher` và `StackingRules`.
- Thêm trường `missions?` vào interface `User`.
- Thêm trường `voucherCode?`, `voucherDiscount?`, `discountSource?` vào interface `Order`.

### [NEW] `src/app/admin/vouchers/page.tsx`
- Giao diện Admin tạo/quản lý Voucher (CRUD).
- Form có các checkbox cho `stackWithPromo`, `stackWithTier`, `isExclusive`.
- Danh sách hiển thị thống kê lượt dùng, trạng thái, hạn sử dụng.

### [MODIFY] `src/lib/adminModules.ts`
- Thêm route `/admin/vouchers` vào `ADMIN_NAV_GROUPS` (nhóm "Bán hàng" hoặc "Quản trị").
- Gắn permission `manage_discounts`.

### [NEW] `src/components/MissionsWidget.tsx`
- UI hiển thị nhiệm vụ cho người dùng (Follow FB, TikTok).
- **Yêu cầu đăng nhập** để lưu tiến trình `missions` vào `users/{uid}`.
- Logic Tracking Click: `window.open(link)` → timer ~5s → cập nhật Firestore.
- Khi tất cả nhiệm vụ hoàn thành → Gọi API sinh mã Voucher cá nhân (`ownerId = uid`).

### [MODIFY] `src/app/(customer)/checkout/page.tsx`
- ⚠️ **Lưu ý:** Plan cũ ghi sai path là `CheckoutCart.tsx` — file này không tồn tại. Checkout thực tế nằm ở đây.
- Thêm ô nhập mã Voucher trước khu vực "Tổng cộng".
- Gọi API `/api/vouchers/validate` khi người dùng nhập xong mã.
- Hiển thị tách biệt: Tiền hàng → Giảm giá Voucher → Tổng cộng.
- Gửi `voucherCode` cùng payload khi submit đơn hàng.

### [MODIFY] `src/app/api/checkout/route.ts`
- Nhận thêm tham số `voucherCode` từ body.
- Thêm READ voucher doc vào transaction (trước boundary "NO MORE READS").
- Thêm READ `system_config/tier_settings` + đối chiếu `customers/{phone}` để lấy `totalSpent` → tính `tierDiscount`.
- Chạy thuật toán Stacking (mục 2).
- WRITE: Ghi `voucherCode`, `voucherDiscount`, `discountSource`, `discount_amount` vào Order doc.
- WRITE: Tăng `usedCount` +1 trên Voucher doc.

### [NEW] `src/app/api/vouchers/validate/route.ts`
- API kiểm tra mã hợp lệ theo thời gian thực (Server-side).
- Trả về: `{ valid, type, value, maxDiscount, minOrderValue, stackingRules, error? }`.

### [MODIFY] `firestore.rules`
- Thêm match cho `/vouchers/{voucherId}`:
  - `allow read: if true` (chỉ đọc mã đang active, logic lọc ở query).
  - `allow create, update, delete: if hasPermission('manage_discounts')`.
  - ⚠️ Voucher `usedCount` được cập nhật qua Admin SDK (server API) nên không cần client write.

---

## 4. Xử lý Khách vãng lai vs. Khách đăng nhập

- **Khách vãng lai (không đăng nhập):** Có thể nhập mã Voucher chung (VD: `MUAHE50K`). Server chỉ kiểm tra `ownerId == null`.
- **Khách đăng nhập:** Có thể làm Nhiệm vụ để nhận mã cá nhân. Server kiểm tra `ownerId == request.auth.uid` (qua header hoặc token).
- **MissionsWidget:** Chỉ hiển thị khi đã đăng nhập. Nếu chưa đăng nhập, hiện nút "Đăng nhập để nhận ưu đãi".

---

## 5. Ảnh hưởng đến Doanh thu & Hoa hồng

- Trường `discount_amount` trên Order đã tồn tại và được `commissionCalcServer.ts` sử dụng (khi `applyAfterDiscount == true`).
- Khi Voucher giảm giá, `discount_amount` sẽ phản ánh đúng → Dashboard Doanh thu và Hoa hồng tự động chính xác, không cần sửa thêm.

---

## 6. Verification Plan

### Build & Type Check
- `pnpm typecheck` và `pnpm build` để đảm bảo Next.js không lỗi.

### Manual Verification
1. **Admin:** Tạo Voucher chung `MUAHE50K` (giảm 50k, `stackWithPromo=true`, `stackWithTier=false`).
2. **Storefront (đăng nhập):** Thực hiện 2 nhiệm vụ → Nhận mã cá nhân.
3. **Checkout (vãng lai):** Nhập mã `MUAHE50K` → Xác nhận giảm 50k.
4. **Checkout (VIP):** Khách VIP nhập mã không cho stackWithTier → Hệ thống chọn 1 trong 2 cái giảm nhiều hơn.
5. **Admin:** Kiểm tra đơn hàng → Hiển thị `voucherCode`, `voucherDiscount`, `discountSource`.
6. **Admin:** Kiểm tra Voucher → `usedCount` đã tăng. Kiểm tra Dashboard Doanh thu → Số liệu phản ánh đúng.
