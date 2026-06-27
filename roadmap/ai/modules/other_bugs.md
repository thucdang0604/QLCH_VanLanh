# 🐛 Bugs Khác

## Lỗi thuộc Module: hardcode
# 🐛 Bugs
## BUG-HARDCODE-001: Hardcode còn rải rác trong secret, storefront fallback, business identity và workflow status
- **Status:** fixed
- **Severity:** high
- **Module:** SystemContent
- **Files:** src/app/(customer)/info/gioi-thieu/page.tsx, src/components/home/HeroSection.tsx, src/components/home/ServiceBlock.tsx, src/components/home/GoogleReviewsSection.tsx, src/lib/config-defaults.ts, src/lib/gemini.ts, src/app/admin/repairs/page.tsx, src/app/admin/technician/page.tsx, src/app/api/inventory/import/route.ts, src/components/admin/ExcelImportModal.tsx, src/app/admin/settings/receipt/WarrantyComponents.tsx
### Symptom
Audit ngày 2026-06-07 phát hiện các nhóm hardcode còn ảnh hưởng production hoặc dễ gây lệch cấu hình: Google Maps Embed API key nằm trực tiếp trong trang giới thiệu, storefront còn banner/dịch vụ/giá demo fallback, business identity như brand/hotline/domain/address bị lặp trong nhiều file UI/SEO/AI prompt, workflow status repair/POS còn so sánh string rải rác, và dữ liệu demo/template admin còn nằm trong component runtime.
### Cause
Các fallback được thêm qua nhiều giai đoạn để UI không trắng khi thiếu cấu hình hoặc thiếu dữ liệu Firestore. Sau khi dự án đã có `system_config`, admin appearance, workflow settings và source intelligence, các fallback này trở thành technical debt.
### Solution
Thực hiện theo `roadmap/ui/data/ai_plans/plan_hardcode_cleanup_20260607.md` và `roadmap/ui/data/ai_plans/task_hardcode_cleanup_20260607.md`: xử lý P0 Maps key, gỡ storefront fake fallback, gom business identity về helper/config trung tâm, chuẩn hóa workflow/status constants, bỏ bypass quyền bằng `email?.includes('admin')`, và tách demo/template thành fixture rõ ràng.
### Verification
2026-06-13: Batch 1-5 đã merge vào `master` qua PR #8. Pass `pnpm lint`, `pnpm typecheck`, `pnpm build`; browser QA storefront pass cho trang chủ, trang giới thiệu, header/footer/chat/mobile nav và xác nhận trang giới thiệu không còn Google Maps API key/embed trong HTML. Smoke có dữ liệu admin thật được chuyển thành residual verification riêng, không còn giữ bug code ở trạng thái mở.

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
## BUG-FIREBASE-DEPLOY-SHARP-001: Firebase SSR deploy fail vi npm ci va sharp peer conflict
- **Status:** fixed
- **Severity:** high
- **Module:** Build
- **Files:** package.json, pnpm-lock.yaml, roadmap/ai/modules/system-content.md, roadmap/ai/dashboard.md
### Symptom
Local <code>pnpm typecheck</code> va <code>pnpm build</code> pass nhung <code>firebase deploy --only hosting</code> fail o buoc update Functions SSR: <code>firebase-frameworks-qlch-vanlanh:ssrqlchvanlanh(asia-southeast1)</code>. Log Cloud Build dung tai <code>npm ci</code> voi loi <code>package.json</code> va <code>package-lock.json</code> khong dong bo, thuong thay <code>sharp@0.34.5</code> khong thoa <code>sharp@0.33.5</code> hoac thieu cac goi <code>@img/sharp-*</code>.
### Cause
Firebase Frameworks sinh bundle SSR trong <code>.firebase/.../functions</code> va bundle nay dung npm lock rieng, du du an goc dung pnpm. <code>firebase-frameworks@0.11.8</code> chi chap nhan peer optional <code>sharp ^0.32 || ^0.33</code>, trong khi <code>next@15.5.x</code> can optional <code>sharp ^0.34.3</code>. Neu root function khong pin <code>sharp</code>, lock npm generated de bi lech va Cloud Build <code>npm ci</code> se fail. Warning <code>@zxing/library requires node >=24</code> la warning, khong phai nguyen nhan dung deploy.
### Solution
Giu du an dung pnpm: root <code>package.json</code> phai co <code>packageManager: pnpm@10.30.3</code>, <code>engines.node: 22</code>, va <code>verify</code> chay bang pnpm. Them root dependency <code>sharp: 0.33.5</code> de thoa peer cua <code>firebase-frameworks</code>; Next van tu giu nested <code>sharp@0.34.x</code>. Sau khi sua dependency, chay <code>pnpm install</code>, clean <code>.firebase/</code>, roi deploy lai.
### Verification
<code>pnpm list sharp next firebase-frameworks --depth 1</code> phai cho thay root co <code>sharp@0.33.5</code> va <code>next</code> co nested <code>sharp@0.34.x</code>. Da verify <code>pnpm typecheck</code> pass, <code>pnpm build</code> pass, generated function <code>npm ci --dry-run</code> pass, va <code>firebase deploy --only hosting</code> pass.
### Guardrail
Khong commit <code>package-lock.json</code> hoac artifact <code>.firebase/</code> trong repo pnpm. Khi deploy fail sau build local pass, doc dung stage log: neu fail tai Cloud Build <code>npm ci</code>, kiem tra generated function lock, package manager, va peer conflict <code>firebase-frameworks</code>/<code>sharp</code> truoc khi sua source UI/TypeScript.
## BUG-DEPLOY-007: Firebase CLI Windows deploy warning node-which/esbuild khi bundle next.config
- **Status:** in_progress
- **Severity:** medium
- **Module:** Build
- **Files:** package.json, pnpm-lock.yaml, next.config.mjs, firebase.json, .firebase/qlch-vanlanh/functions/package.json (generated), .firebase/qlch-vanlanh/functions/package-lock.json (generated)
### Symptom
Trong luc <code>firebase deploy --only hosting</code>, Firebase Frameworks tao SSR Cloud Function vi project co middleware va nhieu route revalidate/dynamic. Buoc bundle <code>next.config.mjs</code> bao <code>'node-which' is not recognized</code> khi chay <code>npx which esbuild</code>, sau do fallback <code>npm install esbuild@^0.19.2 --no-save</code> fail voi npm tarball <code>closure-net</code> va loi <code>Cannot read properties of null (reading 'matches')</code>. CLI tiep tuc deploy voi warning <code>Unable to bundle next.config.mjs for use in Cloud Functions</code>. Log cung co warning <code>@zxing/library@0.22.0</code> yeu cau Node <code>>=24</code> trong khi project dang dung Node 22.
### Cause
Day la nhom loi deploy toolchain tren Windows/Firebase CLI, khac voi <code>BUG-FIREBASE-DEPLOY-SHARP-001</code>. Firebase CLI dang phu thuoc vao binary lookup qua <code>npx</code> va cai goi tam thoi bang npm trong mot project pnpm-first. Khi lookup/cai tam thoi loi, CLI khong bundle duoc <code>next.config.mjs</code> nhung van tiep tuc deploy, tao rui ro cau hinh headers/redirects/SSR khong vao Cloud Function day du. Warning Node engine den tu dependency ZXing can duoc xu ly rieng, khong nen nang Node runtime neu chua verify Firebase Functions ho tro.
### Solution
Thuc hien theo <code>roadmap/ui/data/ai_plans/plan_deploy_pipeline_cleanup_20260609.md</code> va <code>roadmap/ui/data/ai_plans/task_deploy_pipeline_cleanup_20260609.md</code>: dong bang evidence deploy, reproduce voi <code>--debug</code>, them direct <code>esbuild</code> devDependency/lookup helper neu can de khong phu thuoc npm install tam thoi, validate generated functions bundle bang <code>npm ci --dry-run</code>, va xu ly warning <code>@zxing/library</code> bang pin/downgrade tuong thich Node 22 hoac nang runtime chi sau khi verify Firebase ho tro.
### Verification
Can pass <code>pnpm lint</code>, <code>pnpm typecheck</code>, <code>pnpm build</code>, generated function <code>npm ci --dry-run</code>, va <code>pnpm exec firebase deploy --only hosting</code>. Deploy log phai khong con <code>node-which</code>, <code>esbuild not found</code>, <code>Unable to bundle next.config.mjs</code>; production smoke phai pass <code>/</code>, <code>/admin</code>, <code>/sitemap.xml</code>, <code>/cart</code>, <code>/checkout</code>, <code>/search</code>, <code>/manifest.webmanifest</code> va mot redirect trong <code>next.config.mjs</code>.

2026-06-13 local fix: da them direct <code>esbuild@0.19.12</code>, pin <code>@zxing/browser@0.1.5</code> + <code>@zxing/library@0.21.3</code> tuong thich Node 22; <code>pnpm lint</code>, <code>pnpm typecheck</code>, <code>pnpm build</code> pass. Bug van <code>in_progress</code> den khi co deploy log Firebase sach va production smoke.
### Guardrail
Khong commit <code>.firebase/</code>, <code>.next/</code>, npm cache hoac root <code>package-lock.json</code>. Khong sua UI/PWA de xu ly loi deploy toolchain. Khong nang Node runtime chi de xoa warning neu chua co bang chung Firebase Functions/Hosting Frameworks ho tro runtime do.

## BUG-BANK-CONFIG-AUTH-001: OTP phone session co the thay admin session va API thieu RBAC
- **Status:** fixed
- **Severity:** high
- **Module:** Security
- **Files:** src/components/admin/settings/BankIntegrationConfig.tsx, src/app/api/admin/bank-config/route.ts, src/app/api/admin/bank-config/update/route.ts, src/app/api/admin/bank-config/banks/route.ts
### Symptom
Man hinh cau hinh tai khoan thu huong dung Phone Auth tren Firebase app chinh. Sau khi xac nhan OTP, admin session co the bi thay bang phone user; API doc/cap nhat bank config khong bat buoc permission admin day du.
### Cause
Phone OTP va admin authentication dung chung Firebase Auth instance. Server route tin vao OTP proof ma khong ket hop RBAC cua admin dang dang nhap.
### Solution
Tao secondary named Firebase app/auth rieng cho OTP; giu admin auth tren app chinh. GET yeu cau Bearer admin token va <code>manage_settings</code>; UPDATE yeu cau ca admin token co permission va phone proof token.
### Verification
2026-06-13: unit/typecheck/lint/build pass. API khong con cho OTP phone user don le sua tai khoan thu huong.
## BUG-MIGRATE-INVENTORY-SCRIPT-MISSING-001: package.json migrate:inventory dang tham chieu script bi thieu
- **Status:** fixed
- **Severity:** medium
- **Module:** Build
- **Files:** package.json, scripts/migrate-active-orders.ts
### Symptom
Sau clean code, <code>scripts/migrate-active-orders.ts</code> khong ton tai nhung <code>package.json</code> van co script <code>migrate:inventory</code>.
### Cause
Cleanup da xoa script nhung chua xoa/cap nhat package script va roadmap.
### Solution
Đã xóa command chết <code>migrate:inventory</code> khỏi <code>package.json</code>. Production hardening 2026-06-27 đã gỡ các script migration/backfill Firestore còn lại khỏi repo để tránh chạy nhầm sau go-live.
### Verification
2026-06-13: <code>package.json</code> parse hợp lệ, không còn tham chiếu tới <code>scripts/migrate-active-orders.ts</code> và tìm kiếm toàn repo chỉ còn tài liệu lịch sử của bug.
## Lỗi thuộc Module: encoding
# 🐛 Bugs
## BUG-ENCODING-001: Mojibake (Lỗi font tiếng Việt) trong technician/page.tsx
- **Status:** fixed
- **Severity:** medium
- **Module:** Encoding
- **Files:** src/app/admin/technician/page.tsx
### Symptom
5 chuỗi tiếng Việt trong file `technician/page.tsx` bị hiển thị sai font (mojibake). Ví dụ: `Báº¡n cĂ³ cháº¯c` thay vì `Bạn có chắc`, `Lá»—i khi cáº­p nháº­t` thay vì `Lỗi khi cập nhật`.
### Cause
**Phân tích**: Các chuỗi UTF-8 tiếng Việt bị **double-encode** — byte UTF-8 bị đọc lại như Latin-1/Windows-1252 rồi encode lại thành UTF-8. Nguyên nhân gốc: một tool hoặc editor đã lưu file với encoding sai (ví dụ: save as Latin-1 rồi reopen as UTF-8, hoặc AI agent ghi file không đảm bảo UTF-8 BOM/encoding).
### Solution
**Giải pháp đã áp dụng**: Thay thế thủ công 5 chuỗi bị lỗi bằng tiếng Việt đúng.

**⚠️ QUY TẮC PHÒNG TRÁNH CHO AI AGENT:**
1. **KHÔNG BAO GIỜ** dùng regex replace hoặc bulk string replacement trên các chuỗi tiếng Việt có dấu mà không verify encoding output.
2. Khi sửa file chứa tiếng Việt, **LUÔN** kiểm tra lại file sau khi lưu (view lại ít nhất 1 dòng có dấu) để đảm bảo không bị mojibake.
3. Nếu phát hiện chuỗi bị garbled (ký tự như `Ă`, `á»`, `áº`, `Æ°`...), đó là dấu hiệu UTF-8 double-encoding. Sửa bằng cách thay bằng chuỗi tiếng Việt đúng.
4. Khi tạo file mới hoặc ghi nội dung, đảm bảo output encoding là **UTF-8 without BOM**.

### Code
```
// 5 chuỗi đã sửa tại technician/page.tsx:
// Line 261: 'Bạn có chắc chắn muốn xóa linh kiện này khỏi phiếu?'
// Line 265: 'Linh kiện này chưa có mã dòng (partLineId). Vui lòng báo Admin chạy migrate.'
// Line 416: 'Lỗi khi cập nhật trạng thái'
// Line 418: 'Cập nhật trạng thái thành công.'
// Line 424: 'Lỗi khi cập nhật trạng thái.'
```
## Lỗi thuộc Module: rbac
# 🐛 Bugs
## BUG-RBAC-002: Admin layout và permission map phân tán gây rối UI/cấp quyền
- **Status:** in_progress
- **Severity:** medium
- **Module:** RBAC
- **Files:** src/lib/adminModules.ts, src/lib/permissions.ts, src/app/admin/layout.tsx, src/app/admin/staff/page.tsx, src/middleware.ts, src/app/admin/reviews/page.tsx
### Symptom
Admin sidebar có quá nhiều mục ngang cấp, các trang cấu hình phụ bị bày trực tiếp trong menu, và quyền route/menu nằm ở nhiều nơi nên dễ lệch khi thêm tính năng mới. Staff page chỉ có danh sách quyền lẻ, không có preset theo vai trò vận hành như Thu ngân, KTV, Kho, CSKH, Content.
### Cause
Menu admin được hardcode trong `src/app/admin/layout.tsx`, trong khi route guard dùng `src/lib/permissions.ts`. Một số route map chưa đúng nghiệp vụ như `/admin/customers` dùng `manage_orders`, và trang reviews còn kiểm tra quyền ngoài registry bằng `admin_only`.
### Solution
Triển khai theo `roadmap/ui/data/ai_plans/task_admin_ia_rbac_cleanup_20260608.md`: tạo registry admin module dùng chung, gom sidebar theo workflow, sửa mapping quyền lệch, thêm preset phân quyền trong staff page, và để staff route không map bị deny mặc định.
### Verification
2026-06-08: Đã triển khai registry admin module, refactor sidebar/RBAC map, thêm preset quyền staff, bỏ `admin_only` khỏi source. Pass `pnpm lint`, `pnpm typecheck`, `pnpm build`; còn cần browser smoke admin/RBAC với tài khoản thật trước khi đóng bug.
