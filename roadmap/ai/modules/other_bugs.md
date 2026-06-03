# 🐛 Bugs Khác
## Lỗi thuộc Module: rules
# 🐛 Bugs
## BUG-RULES-001: Missing Firestore Security Rules cho 4 collections mới (Phase 4/6/8)
- **Status:** fixed
- **Severity:** high
- **Module:** RULES
- **Files:** firestore.rules
### Cause
<b>Phân tích</b>: Khi implement Phase 4/6/8, code sử dụng <code>onSnapshot</code> (suppliers), <code>getDocs</code> (accessory_discount_rules, repairs), và <code>addDoc</code> (product_reviews, supplier_transactions) trên client SDK. Nhưng <code>firestore.rules</code> chưa có match rules cho 4 collections này → Firestore mặc định deny.
### Solution
<b>Giải pháp đã áp dụng</b>: Thêm rules:<br>• <code>suppliers</code> + <code>supplier_transactions</code>: staff read/write<br>• <code>accessory_discount_rules</code>: staff read/write<br>• <code>product_reviews</code>: public create+read, staff moderate<br><br>Deploy: <code>pnpm exec firebase deploy --only firestore:rules</code>
### Code
```javascript
// ✅ firestore.rules — 4 rules mới
match /suppliers/{supplierId} {
  allow read, write: if isStaff();
}
match /supplier_transactions/{txnId} {
  allow read, write: if isStaff();
}
match /accessory_discount_rules/{ruleId} {
  allow read, write: if isStaff();
}
match /product_reviews/{reviewId} {
  allow create: if true;
  allow read: if true;
  allow update, delete: if isStaff();
}
```
## Lỗi thuộc Module: hack
# 🐛 Bugs
## HACK-SEC-001: Hardcoded Fallback Secret trong API tạo Admin
- **Status:** fixed
- **Severity:** critical
- **Module:** HACK
- **Files:** 
### Cause
<b>Phân tích</b>: Đoạn code <code>const validSecret = process.env.ADMIN_SEED_SECRET || 'vanlanh-admin-secret-2024';</code> để lộ thông tin bí mật trong mã nguồn.
### Solution
<b>Giải pháp đã áp dụng</b>: Xóa fallback hoàn toàn. Bắt buộc đọc từ biến môi trường, trả 500 nếu thiếu, 401 nếu sai.
### Code
```javascript
// ✅ Code đã áp dụng (src/app/api/seed-admin/route.ts)
const validSecret = process.env.ADMIN_SEED_SECRET;
if (!validSecret) {
    console.error('CRITICAL: ADMIN_SEED_SECRET is not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
}
if (secret !== validSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```
## HACK-SEC-002: Firebase RTDB Quyền Đọc/Ghi Công Khai
- **Status:** fixed
- **Severity:** critical
- **Module:** HACK
- **Files:** database.rules.json, src/components/ChatWidget.tsx, src/lib/AuthContext.tsx
### Cause
<b>Phân tích</b>: Validation field không thay thế authorization; bản vá cũ vẫn giữ quyền public cho room guest.
### Solution
<b>Giải pháp đã áp dụng</b>: Dùng Firebase Anonymous Auth cho khách web; room chỉ được đọc/ghi bởi UID tương ứng hoặc staff có quyền chat; xóa nhánh rules <code>beginsWith('guest_')</code>.
### Code
```javascript
// database.rules.json
".read": "auth != null && (auth.uid === $roomId || root.child('admin_roles').child(auth.uid).child('canAccessChat').val() === true)"
// ChatWidget.tsx
const firebaseUser = currentUser || (await signInAnonymously(auth)).user;
```
## HACK-SEC-003: Lỗ hổng XSS trong trang chi tiết sản phẩm
- **Status:** fixed
- **Severity:** critical
- **Module:** HACK
- **Files:** 
### Cause
<b>Phân tích</b>: Mã nguồn render trực tiếp HTML từ database tại <code>product/[id]/page.tsx</code> line 144.
### Solution
<b>Giải pháp đã áp dụng</b>: Tạo shared <code>sanitizeHtml()</code> utility strip <code>&lt;script&gt;</code>, event handlers, <code>javascript:</code> URLs, iframe ngoài whitelist (YouTube/Facebook).
### Code
```javascript
// ✅ Code đã áp dụng
import { sanitizeHtml } from '@/lib/sanitizeHtml';
<div dangerouslySetInnerHTML={{ __html: sanitizeHtml(String(data.content)) }} />
```
## HACK-SEC-004: Rò rỉ thông tin nhạy cảm ở Client (ChatWidget)
- **Status:** fixed
- **Severity:** critical
- **Module:** HACK
- **Files:** src/components/ChatWidget.tsx, src/lib/chatWorkflowHandoff.ts, src/app/admin/pos/page.tsx, src/app/admin/repairs/page.tsx
### Cause
<b>Phân tích</b>: Mask dữ liệu vẫn tạo bản sao PII/identifier không cần thiết trên client; URL là kênh lưu vết không phù hợp cho thông tin khách.
### Solution
<b>Giải pháp đã áp dụng</b>: ChatWidget dùng identity Firebase; POS/Repair lấy tên/SĐT từ handoff theo tab và xóa ngay sau khi consume; URL chỉ mang <code>source=chat</code>.
### Code
```javascript
// chatWorkflowHandoff.ts
storeChatWorkflowHandoff({ customerName, customerPhone, roomId });
const handoff = consumeChatWorkflowHandoff();
// navigation URL: ?source=chat
```
## Lỗi thuộc Module: rbac
# 🐛 Bugs
## BUG-RBAC-001: RBAC URL Bypass (Vượt rào quyền truy cập)
- **Status:** fixed
- **Severity:** high
- **Module:** RBAC
- **Files:** 
### Cause
<b>Phân tích</b>: Chỉ ẩn menu ở Client-side. Thiếu Route Guard hoặc Middleware chặn ở Server.
### Solution
<b>Giải pháp đã áp dụng</b>: Triển khai 3 file mới: <code>sessionCookie.ts</code> (HMAC-SHA256 sign/verify), <code>api/auth/session/route.ts</code> (tạo/xóa session cookie), <code>middleware.ts</code> (Edge Middleware RBAC). Sửa <code>AuthContext.tsx</code> để sync cookie khi login/logout.
### Code
```javascript
// ✅ Code đã áp dụng (src/middleware.ts)
export async function middleware(request: NextRequest) {
  const cookie = request.cookies.get('__session')?.value;
  if (!cookie) return NextResponse.next(); // fallback to client guard
  const session = await verifyPayload(cookie); // HMAC verify
  if (!session) return NextResponse.redirect('/admin/login');
  if (session.role === 'admin') return NextResponse.next();
  // Staff: check route permission
  const required = ROUTE_PERMISSION_MAP[matchedRoute];
  if (!session.permissions.includes(required))
    return NextResponse.redirect('/admin/login');
}
```
## Lỗi thuộc Module: ord
# 🐛 Bugs
## BUG-ORD-002: Hủy đơn Completed gây âm held
- **Status:** fixed
- **Severity:** high
- **Module:** ORD
- **Files:** 
### Cause
<b>Phân tích</b>: Đơn <code>Completed</code> thì <code>held</code> đã giải phóng. Khi hủy lại tiếp tục trừ <code>held</code>.
### Solution
<b>Giải pháp tối ưu</b>: Check trạng thái đơn. Nếu đã <code>Completed</code> thì không trừ <code>held</code> nữa.
### Code
```javascript
// Kiểm tra trạng thái trước khi xử lý held
if (order.status !== 'Completed') {
  transaction.update(productRef, { held: FieldValue.increment(-item.quantity) });
}
```
## BUG-ORD-003: Thiếu kiểm tra cộng dồn số lượng trong Checkout API
- **Status:** fixed
- **Severity:** high
- **Module:** ORD
- **Files:** 
### Cause
<b>Phân tích</b>: Thiếu bước validate tổng hợp (Aggregation) dữ liệu đầu vào.
### Solution
<b>Giải pháp tối ưu</b>: Group các sản phẩm theo <code>productId</code> và tính tổng số lượng trước khi kiểm tra tồn kho.
### Code
```javascript
// Gom nhóm trước khi check
const groupedItems = items.reduce((acc, item) => {
  acc[item.productId] = (acc[item.productId] || 0) + item.quantity;
  return acc;
}, {});
```
## BUG-ORD-004: Race Condition & Double Submit trong updateStatus
- **Status:** fixed
- **Severity:** high
- **Module:** ORD
- **Files:** 
### Cause
<b>Phân tích</b>: Hàm sử dụng dữ liệu <code>order</code> từ React state thay vì fetch mới trong transaction. Không có bước kiểm tra trạng thái hiện tại trên server trước khi áp dụng logic cộng/trừ kho.
### Solution
<b>Giải pháp tối ưu</b>: Thực hiện <code>transaction.get(orderRef)</code> bên trong transaction để lấy trạng thái mới nhất. Nếu trạng thái đã trùng với <code>newStatus</code> thì dừng xử lý.
### Code
```javascript
await runTransaction(db, async (transaction) => {
  const orderSnap = await transaction.get(orderRef);
  const currentStatus = orderSnap.data().status;
  if (currentStatus === newStatus) return; // Ngăn Double Submit
  // ... xử lý logic dựa trên currentStatus
});
```
## BUG-ORD-005: Lỗi vi phạm nguyên tắc Transaction ở Web Checkout
- **Status:** fixed
- **Severity:** high
- **Module:** ORD
- **Files:** src/app/api/checkout/route.ts
### Symptom
API checkout báo lỗi 500: Firestore transactions require all reads to be executed before all writes. Đơn hàng không tạo được.
## Lỗi thuộc Module: com
# 🐛 Bugs
## BUG-COM-002: Trả hoa hồng trên đơn nợ (Pay Later)
- **Status:** fixed
- **Severity:** high
- **Module:** COM
- **Files:** 
### Cause
<b>Phân tích</b>: Trigger tính hoa hồng chạy theo trạng thái hoàn thành kỹ thuật, không theo trạng thái thanh toán.
### Solution
<b>Giải pháp đã áp dụng</b>: <code>commissionUtils.ts</code> đã kiểm tra payment status trước khi tính hoa hồng. Không cần sửa thêm.
### Code
```javascript
// Chỉ tính hoa hồng khi đã thanh toán
if (order.paymentStatus === 'Paid') {
  calculateCommission(technicianId, order.amount);
}
```
## BUG-COM-003: Làm tròn số thực gây lệch tiền (Float Precision)
- **Status:** fixed
- **Severity:** high
- **Module:** COM
- **Files:** 
### Cause
<b>Phân tích</b>: JavaScript xử lý số thực dấu phẩy động không chính xác và tiền VNĐ cần được làm tròn về số nguyên.
### Solution
<b>Giải pháp tối ưu</b>: Dùng <code>Math.round()</code> ngay sau khi tính toán để đảm bảo giá trị lưu trữ là số nguyên.
### Code
```javascript
// Sửa lại dòng 113 và 147
commissionAmount: Math.round((baseAmount * pct) / 100)
```
## BUG-COM-004: Phân bổ giảm giá tùy tiện (Arbitrary Discount Distribution)
- **Status:** fixed
- **Severity:** high
- **Module:** COM
- **Files:** 
### Cause
<b>Phân tích</b>: Thuật toán phân bổ giảm giá chưa công bằng và không nhất quán.
### Solution
<b>Giải pháp tối ưu</b>: Phân bổ giảm giá theo tỷ lệ giá trị của từng sản phẩm trên tổng giá trị đơn hàng (Pro-rata distribution).
### Code
```javascript
// Giải pháp Pro-rata
const ratio = item.price / totalOriginalAmount;
const itemDiscount = totalDiscount * ratio;
```
## BUG-COM-005: Thiếu kiểm tra trạng thái thanh toán đơn hàng
- **Status:** fixed
- **Severity:** high
- **Module:** COM
- **Files:** 
### Cause
<b>Phân tích</b>: Thiếu sót trong việc đồng bộ logic ghi nhận doanh thu giữa mảng sửa chữa và mảng bán lẻ.
### Solution
<b>Giải pháp tối ưu</b>: Bổ sung kiểm tra trạng thái thanh toán hoặc trạng thái hoàn thành của đơn hàng trước khi tính hoa hồng.
### Code
```javascript
// Bổ sung kiểm tra cho order
if (docType === 'order' && docData.paymentStatus !== 'paid') {
  return []; // Chưa thanh toán thì chưa có hoa hồng
}
```
## Lỗi thuộc Module: rev
# 🐛 Bugs
## BUG-REV-001: Mất mát dữ liệu báo cáo do giới hạn Query 3 tháng
- **Status:** fixed
- **Severity:** high
- **Module:** REV
- **Files:** 
### Cause
<b>Phân tích</b>: Lọc dữ liệu thô quá chặt bằng <code>createdAt</code> khiến các đơn hàng treo lâu bị loại bỏ trước khi kịp tính vào doanh thu.
### Solution
<b>Giải pháp tối ưu</b>: Fetch dữ liệu dựa trên khoảng thời gian cần báo cáo của ngày hoàn thành (ví dụ <code>completedAt</code> hoặc <code>updatedAt</code>), thay vì ngày tạo.
### Code
```javascript
// Query doanh thu chuẩn theo ngày hoàn thành
const revQuery = query(ordersRef, where('completedAt', '>=', startDate), where('completedAt', '<=', endDate));
```
## BUG-REV-002: Khấu trừ quà tặng trong Lợi nhuận ròng (NOT A BUG)
- **Status:** fixed
- **Severity:** high
- **Module:** REV
- **Files:** 
### Cause
<b>Phân tích ban đầu (SAI)</b>: Nghi ngờ <code>repairRevenue</code> đã trừ discount nên trừ thêm <code>giftDiscount</code> là double. <b>Thực tế</b>: <code>paymentHistory</code> ghi nhận tiền thực thu (không liên quan giftDiscount). GiftDiscount là chi phí xuất kho riêng.
### Solution
<b>Kết luận</b>: Không cần sửa. Logic <code>netProfit = totalRevenue - totalExpenses - totalGiftDiscount</code> là chính xác.
### Code
```javascript
// ✅ Logic đúng — KHÔNG SỬA
// repairRevenue = tiền khách trả (paymentHistory sums)
// giftDiscount = chi phí hàng tặng (stock đã trừ tại handleHandover)
const netProfit = totalRevenue - totalExpenses - totalGiftDiscount;
```
## BUG-REV-003: Sai lệch số tiền lẻ do không làm tròn số thực trong database
- **Status:** fixed
- **Severity:** high
- **Module:** REV
- **Files:** 
### Cause
<b>Phân tích</b>: Các phép tính giá sau chiết khấu hoặc thuế không được bọc trong <code>Math.round()</code> trước khi lưu vào Firestore, tạo ra các số thực vô hạn tuần hoàn hoặc có đuôi thập phân dài.
### Solution
<b>Giải pháp tối ưu</b>: Ép kiểu và làm tròn số tiền về số nguyên (VNĐ) ngay khi tính toán và trước khi lưu vào database.
### Code
```javascript
// Ép kiểu làm tròn khi lưu
const finalPrice = Math.round(calculatedPrice);
await updateDoc(docRef, { price: finalPrice });
```
## Lỗi thuộc Module: ser
# 🐛 Bugs
## BUG-SER-001: Cho phép nhập số âm cho giá dịch vụ
- **Status:** fixed
- **Severity:** high
- **Module:** SER
- **Files:** 
### Cause
<b>Phân tích</b>: Thiếu validation trong <code>handleSubmit</code> và <code>onChange</code>.
### Solution
<b>Giải pháp tối ưu</b>: Thêm kiểm tra giá trị âm trong <code>handleSubmit</code> hoặc dùng <code>Math.max(0, parseInt(e.target.value) || 0)</code> trong <code>onChange</code>.
### Code
```javascript
// Giải pháp: Khống chế giá trị >= 0
onChange={(e) => setFormData({ ...formData, price_original: Math.max(0, parseInt(e.target.value) || 0) })}
```
## Lỗi thuộc Module: par
# 🐛 Bugs
## BUG-PAR-001: Cập nhật bất đồng bộ (Receipt & Ticket)
- **Status:** fixed
- **Severity:** high
- **Module:** PAR
- **Files:** 
### Cause
<b>Phân tích</b>: Thiếu transaction khi cập nhật nhiều tài liệu có liên quan.
### Solution
<b>Giải pháp tối ưu</b>: Gộp cả 2 lệnh cập nhật vào một <code>runTransaction</code>.
### Code
```javascript
// Giải pháp: Sử dụng Transaction
await runTransaction(db, async (transaction) => {
  transaction.update(receiptRef, { items: newItems });
  transaction.update(ticketRef, { parts: updatedParts });
});
```
## BUG-PAR-002: Regression: Mất an toàn Transaction và Thiếu Log khi chốt phiếu nhập
- **Status:** fixed
- **Severity:** high
- **Module:** PAR
- **Files:** 
### Cause
<b>Phân tích</b>: Quá trình gộp file (Unification) đã vô tình hạ cấp mức độ an toàn dữ liệu từ Transaction xuống Batch, và loại bỏ phần code ghi log.
### Solution
<b>Giải pháp tối ưu</b>: Khôi phục lại logic dùng <code>runTransaction</code> và bổ sung ghi log vào <code>inventory_logs</code> như file cũ.
### Code
```javascript
// Giải pháp: Khôi phục Transaction và Logging
await runTransaction(db, async (transaction) => {
  const productSnap = await transaction.get(productRef);
  const currentStock = productSnap.data().stock;
  transaction.update(productRef, { stock: currentStock + newQty });
  // Thêm log vào inventory_logs...
});
```
## BUG-PAR-003: Race Condition & Stale Data trong executeFinalImport
- **Status:** fixed
- **Severity:** high
- **Module:** PAR
- **Files:** 
### Cause
<b>Phân tích</b>: Dùng dữ liệu từ hook để tính toán giá trị tuyệt đối rồi ghi đè thay vì dùng transaction hoặc increment. Đọc ticket ngoài batch dẫn đến nguy cơ ghi đè dữ liệu ticket.
### Solution
<b>Giải pháp tối ưu</b>: Chuyển toàn bộ logic tính toán và cập nhật vào trong một <code>runTransaction</code>.
### Code
```javascript
// Giải pháp: Chuyển sang runTransaction
await runTransaction(db, async (transaction) => {
  const pDoc = await transaction.get(productRef);
  const currentStock = pDoc.data().stock;
  const currentCost = pDoc.data().costPrice;
  // Tính toán avgCost dựa trên currentStock và currentCost thực tế
  const totalQty = currentStock + newQty;
  const avgCost = Math.round(((currentStock * currentCost) + (newQty * newCost)) / totalQty);
  transaction.update(productRef, { stock: totalQty, costPrice: avgCost });
});
```
## Lỗi thuộc Module: security
# 🐛 Bugs
## HACK-PUBLIC-REVIEWS-001: Public reviews/comments bypass moderation da duoc si?t Firestore rules
- **Status:** fixed
- **Severity:** high
- **Module:** Security
- **Files:** firestore.rules, src/app/(customer)/tin-tuc/[slug]/ArticleClientParts.tsx
### Symptom
Public create vao reviews/product_reviews/article_comments co the gui status approved hoac field la.
### Cause
Rules cu cho public create qua rong va client tu quyet dinh status.
### Solution
Dua moderation boundary vao Firestore rules; client chi tao pending. Public read chi doc approved hoac staff permission.
## HACK-API-001: Admin SDK mutation routes da co auth/production guard hoac da bi xoa
- **Status:** fixed
- **Severity:** high
- **Module:** Security
- **Files:** src/app/api/admin/seed-taxonomy/route.ts, src/lib/apiAuth.ts
### Symptom
Seed/migration endpoints dung Admin SDK co nguy co mutate DB neu public.
### Cause
Route Admin SDK mutation thieu auth/guard trong ban cu.
### Solution
Moi endpoint mutation dung Admin SDK phai co requireAdmin/requireAdminOrStaff va production guard, hoac chuyen thanh CLI script noi bo.
## HACK-CACHE-001: Revalidate API hardcoded fallback secret da duoc xoa
- **Status:** fixed
- **Severity:** medium
- **Module:** Security
- **Files:** src/app/api/revalidate/route.ts, src/lib/revalidate.ts
### Symptom
/api/revalidate co the bi purge cache neu dung fallback secret hoac caller khong gui secret.
### Cause
Fallback secret hardcoded va caller cu goi endpoint truc tiep.
### Solution
Secret-only server-to-server endpoint; admin UI goi triggerRevalidate server action.
## Lỗi thuộc Module: settings
# 🐛 Bugs
## BUG-REVALIDATE-CALLERS-001: Admin revalidate callers da chuyen sang server action
- **Status:** fixed
- **Severity:** medium
- **Module:** Settings
- **Files:** src/app/admin/settings/NavigationTab.tsx, src/app/admin/settings/CategoriesTab.tsx, src/lib/revalidate.ts
### Symptom
Admin UI fetch /api/revalidate tu browser se fail 401 hoac expose secret neu sua sai.
### Cause
Caller cu sai contract cua protected revalidate endpoint.
### Solution
Dung server action de revalidatePath/revalidateTag tren server.
## BUG-SEED-CONFIG-001: Settings seed-config da gui Bearer token
- **Status:** fixed
- **Severity:** medium
- **Module:** Settings
- **Files:** src/app/admin/settings/page.tsx, src/app/api/seed-config/route.ts
### Symptom
Nut khoi phuc mac dinh goi protected API nhung thieu Authorization.
### Cause
Client caller thieu token trong khi API requireAdminOrStaff.
### Solution
Gui Firebase ID token; API tiep tuc verify role/permission server-side.
## Lỗi thuộc Module: inventory
# 🐛 Bugs
## BUG-INVENTORY-HELD-001: Pending orders khong con tru stock va tang held dong thoi
- **Status:** fixed
- **Severity:** high
- **Module:** Inventory
- **Files:** src/app/api/checkout/route.ts, src/app/admin/pos/page.tsx, src/app/admin/orders/page.tsx
### Symptom
available = stock - held bi tru hai lan khi tao don pending.
### Cause
Logic cu tron reservation voi physical stock movement.
### Solution
Tao pending: held += qty. Completed: stock -= qty, held -= qty. Cancel active: held -= qty. Cancel completed: stock += qty.
## BUG-REPAIR-STOCK-001: Repair parts khong con tru stock hai lan
- **Status:** fixed
- **Severity:** high
- **Module:** Inventory
- **Files:** src/app/admin/technician/page.tsx, src/app/admin/repairs/page.tsx, src/app/admin/parts/page.tsx
### Symptom
KTV chon linh kien tru stock, handover done lai tru stock lan nua.
### Cause
Thieu ranh gioi selected/reserved va actual consumption.
### Solution
Selected part la reservation; done la physical consumption; out/refund la release reservation.
## Lỗi thuộc Module: build
# 🐛 Bugs
## BUG-TSC-STALENEXT-001: Typecheck standalone regenerate Next route types truoc khi tsc
- **Status:** fixed
- **Severity:** low
- **Module:** Build
- **Files:** package.json
### Symptom
tsc --noEmit doc .next/types stale co the fail gia sau doi route/page/layout.
### Cause
tsconfig include .next/types nhung generated files co the stale.
### Solution
Chay next typegen truoc tsc trong pipeline verify.
## BUG-MIGRATE-INVENTORY-SCRIPT-MISSING-001: package.json migrate:inventory dang tham chieu script bi thieu
- **Status:** open
- **Severity:** medium
- **Module:** Build
- **Files:** package.json, scripts/migrate-active-orders.ts
### Symptom
Sau clean code, <code>scripts/migrate-active-orders.ts</code> khong ton tai nhung <code>package.json</code> van co script <code>migrate:inventory</code>.
### Cause
Cleanup da xoa script nhung chua xoa/cap nhat package script va roadmap.
### Solution
Khoi phuc <code>scripts/migrate-active-orders.ts</code> neu can migration du lieu cu, hoac xoa script <code>migrate:inventory</code> sau khi xac nhan migration da chay va khong can nua.