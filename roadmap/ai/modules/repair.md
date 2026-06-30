# 🧩 Workflows
## repair
# 🧩 Workflows
## repair
- **Title:** Sửa chữa
- **Icon:** 🔧
### 📁 Target Files (Các file đích)
- src/app/admin/repair/page.tsx (Danh sách sửa chữa)
- src/app/admin/repair/[id]/page.tsx (Chi tiết phiếu sửa chữa)
- src/lib/services/repair.ts (Cập nhật trạng thái)
```mermaid
graph TD
            A("🚀 Chờ Tiếp nhận") --> A1("🔐 Kiểm tra Quyền & Check-in")
            A -->|"Khách quay lại bảo hành"| WAR_CLAIM("🛡️ Check hạn Bảo hành")
            WAR_CLAIM -->|"Còn hạn"| A1
            WAR_CLAIM -->|"Hết hạn"| C
            A1 -->|"Gán KTV, Checklist"| B("🔍 Đang Kiểm Tra")
            A -->|"Khách đổi ý"| OUT("❌ Trả Máy / Hủy")
            B --> B1{"Có lỗi phát sinh?"}
            B1 -->|"Có"| C("📞 Báo Tình trạng & Giá")
            B1 -->|"Không / Lỗi nhẹ"| D("🛠️ Đang Sửa Chữa")
            B1 -->|"Sửa xong ngay"| DONE("✅ Hoàn Thành")
            B1 -->|"Không sửa được"| OUT
            C -->|"Báo khách"| E("⏳ Đợi Phản hồi")
            C -->|"Từ chối"| OUT
            E -->|"Đồng ý, có LK"| D
            D -.->|Đã vá| BUG_REP_004["✅ ĐÃ VÁ: handleQuickStatus → runTransaction"]
            D -.->|Đã vá| BUG_REP_006["✅ ĐÃ VÁ: Missing Tx Submit"]
            E -->|"Đồng ý, thiếu LK"| F("🔗 🔎 Tìm Linh Kiện (Mở Kho)")
            F -.->|Đã vá| BUG_REP_003["✅ ĐÃ VÁ: Sản phẩm ma (Custom ID Mapping)"]
            F -.->|Đã vá| BUG_REP_005["✅ ĐÃ VÁ: Race Condition Tổng hợp"]
            E -->|"Từ chối"| OUT
            E -->|"Đòi lại cọc"| REFUND("💸 Hoàn Phí")
            F -->|"Linh kiện chưa có sẵn"| F_PROP("📝 Tạo Phiếu Đề Xuất Nhập (Kèm repairTicketId)")
            F_PROP -->|"Đã đặt mua"| G("📦 Đã Đặt LK")
            F_PROP -->|"Không đặt được hàng (unavailable)"| REFUND
            F -->|"Không tìm được"| REFUND
            F -->|"Khách lấy lại"| OUT
            G -->|"Chốt: LK đã về"| D
            D --> D1{"Kiểm tra Bảo Hành?"}
            D1 -->|"isWarrantyCovered: true"| D2("🛡️ Filter Cost (Free Part)")
            D1 -->|"Billable"| D3("💰 Tính phí linh kiện")
            D2 --> D4("🛠️ Tiến hành Thay thế / Fix")
            D3 --> D4
            D4 --> D5("🛡️ runTransaction (Handover)")
            D5 -.->|Đã vá| BUG_REP_002["✅ ĐÃ VÁ: Ghi đè dữ liệu (Stale Overwrite)"]
            D5 -.->|Đã vá| BUG_REP_001["✅ ĐÃ VÁ: Hoa hồng ngoài Transaction"]
            D5 --> D6("➖ Trừ Kho LK (Stock -= N)")
            D6 -.->|Đã vá| BUG_INV_006["✅ ĐÃ VÁ: Rò rỉ Held (Chỉ trừ Stock)"]
            D6 -.->|Đã vá| BUG_REP_007["✅ ĐÃ VÁ: Held Counter Corruption"]
            D6 -->|"Xong"| DONE
            D6 -->|"Thất bại"| REFUND
            DONE --> DONE_INV("📑 Printable Invoice")
            DONE_INV --> DONE_WAR("🏷️ Gán Bảo Hành (warrantyUtils)")
            DONE_WAR --> POS_PAY("🔗 💳 Chuyển sang POS Thanh toán")
            %% Liên kết chuyển trang cho node Tìm Linh Kiện và POS
            click F call handleWorkflowClick("inventory") "Mở Sơ đồ Luồng Kho"
            click POS_PAY call handleWorkflowClick("pos-orders") "Mở Sơ đồ POS & Đơn hàng"
            click BUG_REP_001 call handleBugClick("BUG-REP-001") "Mở chi tiết"
            click BUG_REP_002 call handleBugClick("BUG-REP-002") "Mở chi tiết"
            click BUG_REP_003 call handleBugClick("BUG-REP-003") "Mở chi tiết"
            click BUG_REP_004 call handleBugClick("BUG-REP-004") "Mở chi tiết"
            click BUG_INV_006 call handleBugClick("BUG-INV-006") "Mở chi tiết"
            click BUG_REP_005 call handleBugClick("BUG-REP-005") "Mở chi tiết"
            click BUG_REP_006 call handleBugClick("BUG-REP-006") "Mở chi tiết"
            click BUG_REP_007 call handleBugClick("BUG-REP-007") "Mở chi tiết"
            click F_PROP call handleMasterNodeClick("F_PROP")
```
# 🚧 Kế hoạch nâng cấp workflow KTV và UI mobile

- **Status:** implemented-awaiting-role-qa
- **Plan:** [Workflow sửa chữa, phân công KTV và chuyển giao có xác nhận](../../ui/data/ai_plans/plan_repair_technician_handoff_mobile_20260612.md)
- **Tasks:** [Danh sách triển khai](../../ui/data/ai_plans/task_repair_technician_handoff_mobile_20260612.md)

## Quy tắc nghiệp vụ đã chốt

1. Phiếu mới luôn ở **Chờ tiếp nhận**; có thể gán KTV ngay hoặc sau bước kiểm tra lần đầu.
2. Không được chuyển sang bước tiếp theo nếu chưa có KTV phụ trách.
3. KTV chỉ thao tác phiếu được giao; nhân viên quản lý/Sale có thể can thiệp nhưng phải xác nhận, nhập lý do và được ghi log.
4. KTV hiện tại hoặc nhân viên quản lý/Sale có thể đề nghị chuyển sang KTV mới.
5. KTV mới phải bấm **Chấp nhận** thì assignment và trách nhiệm mới chính thức thay đổi. Từ chối hoặc hủy yêu cầu không làm đổi KTV hiện tại.
6. Trong thời gian chờ phản hồi, KTV cũ tiếp tục phụ trách và thao tác phiếu.
7. UI phải mobile-first; KTV, blocker, yêu cầu chuyển và hành động bắt buộc hiển thị trực tiếp trên thẻ phiếu, không cần mở chi tiết mới thấy.

```mermaid
flowchart TD
    A["Tạo phiếu: Chờ tiếp nhận"] --> B{"Đã gán KTV?"}
    B -->|"Chưa"| C["Hiển thị Cần gán KTV"]
    C --> D["Nhân viên quản lý/Sale gán KTV"]
    B -->|"Rồi"| E["Cho phép chuyển bước theo workflow Firebase"]
    D --> E
    E --> F["KTV hiện tại xử lý phiếu"]
    F --> G{"Có yêu cầu chuyển KTV?"}
    G -->|"Không"| F
    G -->|"Có"| H["KTV mới phản hồi"]
    H -->|"Chấp nhận"| I["Đổi KTV bằng transaction và ghi log"]
    H -->|"Từ chối"| F
    H -->|"Yêu cầu bị hủy"| F
    I --> J["KTV mới tiếp tục xử lý"]
```

# 🐛 Bugs
## BUG-REP-011: Thiếu chuyển KTV và audit log chống gian lận
- **Status:** fixed
- **Severity:** high
- **Module:** REP
- **Files:** src/app/admin/technician/page.tsx, src/app/api/repairs/technician/transfer/route.ts, src/lib/types.ts
### Cause
Trang KTV chỉ có nút phản hồi yêu cầu đến, không có thao tác tạo/hủy yêu cầu chuyển. API tin dữ liệu KTV từ client và log thiếu actor, lý do, KTV cũ/mới cùng mã đối soát.
### Solution
Đã merge vào `master` qua PR #9 luồng request/accept/reject/cancel bằng transaction; chỉ KTV hiện tại hoặc quản lý Sale được đề nghị và chỉ KTV nhận được chấp nhận. Còn chờ browser QA đủ ba vai trò trước khi đổi trạng thái sang fixed.

## BUG-REP-010: UI KTV khó thao tác trên mobile
- **Status:** fixed
- **Severity:** high
- **Module:** REP
- **Files:** src/app/admin/technician/page.tsx
### Cause
Thẻ phiếu dồn nhiều thông tin vào bố cục desktop, checklist bốn cột và các nút thao tác nhỏ; blocker theo workflow bị giấu trong chi tiết.
### Solution
Đã merge vào `master` qua PR #9 thẻ một cột trên mobile, blocker theo `allowedFeatures`, checklist hai cột, touch target 44px và nút chuyển KTV trực tiếp. Còn chờ QA bằng tài khoản KTV nhận và ma trận quyền trước khi đóng bug.

## BUG-REP-009: Staff nhìn thấy nút xóa phiếu
- **Status:** fixed
- **Severity:** high
- **Module:** REP
- **Files:** src/app/admin/repairs/page.tsx, firestore.rules
### Cause
UI hiển thị nút xóa cho mọi người có thể mở modal dù Firestore rules chỉ cho Admin xóa.
### Solution
Chỉ render nút xóa cho role admin, thêm guard trong handler và giữ rule delete admin-only.

## BUG-REP-003: Sản phẩm ma (Custom ID Mapping) — By-Design
- **Status:** fixed
- **Severity:** high
- **Module:** REP
- **Files:** 
### Cause
<b>Phân tích</b>: Cho phép nhập text tự do và tạo ID ngẫu nhiên không liên kết bảng chuẩn.
### Solution
<b>Giải pháp tối ưu</b>: Bắt buộc chọn từ danh sách. Nếu tạo mới phải vào trạng thái 'Chờ duyệt' (Pending).
### Code
```javascript
// Ràng buộc khi tạo linh kiện trong Repair
if (!validCategories.includes(inputCategory)) {
  category = 'pending_classification'; // Gán vào danh mục chờ xử lý
}
```
## BUG-REP-002: Ghi đè dữ liệu (Stale Overwrite)
- **Status:** fixed
- **Severity:** high
- **Module:** REP
- **Files:** 
### Cause
<b>Phân tích</b>: Đọc về client rồi ghi đè toàn bộ (updateDoc) mà không check version (Optimistic Locking).
### Solution
<b>Giải pháp đã áp dụng</b>: Dùng <code>runTransaction</code> + <code>version</code> field. Mỗi lần save sẽ increment version. Nếu version trên server > version lúc mở form → reject với thông báo lỗi.
### Code
```javascript
// ✅ Đã fix tại repairs/page.tsx handleSubmit
await runTransaction(db, async (transaction) => {
  const freshDoc = await transaction.get(ticketRef);
  if (freshDoc.data()?.version > editingTicket.version) {
    throw new Error('Phiếu đã được cập nhật bởi người khác!');
  }
  transaction.update(ticketRef, { ...ticketData, version: freshVersion + 1 });
});
```
## BUG-REP-001: Gọi tính hoa hồng ngoài Transaction (Repairs)
- **Status:** fixed
- **Severity:** high
- **Module:** REP
- **Files:** 
### Cause
<b>Phân tích</b>: Commission logic tách rời khỏi transaction nhưng có cơ chế bảo vệ riêng.
### Solution
<b>Giải pháp đã áp dụng</b>: Giữ commission ngoài transaction (thiết kế chấp nhận được vì commission có idempotency guard). Đã thêm guard check payment status trong <code>commissionUtils.ts</code>.
### Code
```javascript
// ✅ commissionUtils.ts đã có guard
if (ticket.payment?.status !== 'paid') return; // Chỉ tính khi đã thanh toán
```
## BUG-REP-004: Cập nhật trạng thái nhanh không dùng Transaction
- **Status:** fixed
- **Severity:** high
- **Module:** REP
- **Files:** 
### Cause
<b>Phân tích</b>: Sử dụng <code>updateDoc</code> cho các dữ liệu có tính cạnh tranh cao mà không có cơ chế khóa.
### Solution
<b>Giải pháp tối ưu</b>: Chuyển sang dùng <code>runTransaction</code> để đảm bảo tính nguyên tử và cô lập.
### Code
```javascript
// Giải pháp: Chuyển sang runTransaction
await runTransaction(db, async (transaction) => {
  const docSnap = await transaction.get(docRef);
  transaction.update(docRef, update);
});
```
## BUG-REP-005: Race Condition trong tổng hợp phiếu nhập
- **Status:** fixed
- **Severity:** high
- **Module:** REP
- **Files:** 
### Cause
<b>Phân tích</b>: Hàm <code>ensureConsolidatedImportReceiptForTicket</code> dùng <code>getDoc</code> rồi <code>updateDoc</code>/<code>setDoc</code> riêng rẽ thay vì dùng <code>runTransaction</code>.
### Solution
<b>Giải pháp tối ưu</b>: Chuyển toàn bộ logic đọc-ghi phiếu nhập tổng hợp vào trong một <code>runTransaction</code>.
### Code
```javascript
// Cần chuyển sang transaction
await runTransaction(db, async (transaction) => {
  const receiptDoc = await transaction.get(receiptRef);
  if (!receiptDoc.exists()) {
    transaction.set(receiptRef, newData);
  } else {
    transaction.update(receiptRef, updatedData);
  }
});
```
## BUG-REP-006: Missing Transaction trong handleNoteSubmit
- **Status:** fixed
- **Severity:** high
- **Module:** REP
- **Files:** 
### Cause
<b>Phân tích</b>: Hàm <code>handleSubmit</code> dùng <code>updateDoc</code> trực tiếp mà không kiểm tra version hoặc dùng transaction.
### Solution
<b>Giải pháp tối ưu</b>: Sử dụng <code>runTransaction</code> kết hợp với cơ chế Optimistic Locking (dùng trường <code>version</code> đã có).
### Code

## BUG-REP-009: Staff nhìn thấy nút xóa phiếu
- **Status:** fixed
- **Severity:** high
- **Module:** REP
- **Files:** src/app/admin/repairs/page.tsx, firestore.rules
### Cause
UI hiển thị nút xóa cho mọi người có thể mở modal dù Firestore rules chỉ cho Admin xóa.
### Solution
Chỉ render nút xóa cho role admin, thêm guard trong handler và giữ rule delete admin-only.

## BUG-INV-009: Lỗi hiển thị tồn kho ảo khi trùng lặp ID
- **Status:** fixed
- **Severity:** medium
- **Module:** INV
- **Files:** src/lib/inventory.ts
### Cause
<b>Phân tích</b>: Do trùng lặp Product ID trong kho, hàm tính tổng tồn bị đè key.
### Solution
<b>Giải pháp</b>: Làm sạch dữ liệu đầu vào, nhóm theo SKU trước khi cộng dồn.
### Fix 2026-06-30
- Changed files: `src/app/admin/inventory/stock/page.tsx`.
- Verification: roadmap path `src/lib/inventory.ts` is stale; the current stock view now groups products by `sku`/`productCode`/`barcode` before totals and falls back to document id only when no product code exists.

## BUG-REP-003: Sản phẩm ma (Custom ID Mapping) — By-Design
- **Status:** fixed
- **Severity:** high
- **Module:** REP
- **Files:** 
### Cause
<b>Phân tích</b>: Cho phép nhập text tự do và tạo ID ngẫu nhiên không liên kết bảng chuẩn.
### Solution
<b>Giải pháp tối ưu</b>: Bắt buộc chọn từ danh sách. Nếu tạo mới phải vào trạng thái 'Chờ duyệt' (Pending).
### Code
```javascript
// Ràng buộc khi tạo linh kiện trong Repair
if (!validCategories.includes(inputCategory)) {
  category = 'pending_classification'; // Gán vào danh mục chờ xử lý
}
```
## BUG-REP-002: Ghi đè dữ liệu (Stale Overwrite)
- **Status:** fixed
- **Severity:** high
- **Module:** REP
- **Files:** 
### Cause
<b>Phân tích</b>: Đọc về client rồi ghi đè toàn bộ (updateDoc) mà không check version (Optimistic Locking).
### Solution
<b>Giải pháp đã áp dụng</b>: Dùng <code>runTransaction</code> + <code>version</code> field. Mỗi lần save sẽ increment version. Nếu version trên server > version lúc mở form → reject với thông báo lỗi.
### Code
```javascript
// ✅ Đã fix tại repairs/page.tsx handleSubmit
await runTransaction(db, async (transaction) => {
  const freshDoc = await transaction.get(ticketRef);
  if (freshDoc.data()?.version > editingTicket.version) {
    throw new Error('Phiếu đã được cập nhật bởi người khác!');
  }
  transaction.update(ticketRef, { ...ticketData, version: freshVersion + 1 });
});
```
## BUG-REP-001: Gọi tính hoa hồng ngoài Transaction (Repairs)
- **Status:** fixed
- **Severity:** high
- **Module:** REP
- **Files:** 
### Cause
<b>Phân tích</b>: Commission logic tách rời khỏi transaction nhưng có cơ chế bảo vệ riêng.
### Solution
<b>Giải pháp đã áp dụng</b>: Giữ commission ngoài transaction (thiết kế chấp nhận được vì commission có idempotency guard). Đã thêm guard check payment status trong <code>commissionUtils.ts</code>.
### Code
```javascript
// ✅ commissionUtils.ts đã có guard
if (ticket.payment?.status !== 'paid') return; // Chỉ tính khi đã thanh toán
```
## BUG-REP-004: Cập nhật trạng thái nhanh không dùng Transaction
- **Status:** fixed
- **Severity:** high
- **Module:** REP
- **Files:** 
### Cause
<b>Phân tích</b>: Sử dụng <code>updateDoc</code> cho các dữ liệu có tính cạnh tranh cao mà không có cơ chế khóa.
### Solution
<b>Giải pháp tối ưu</b>: Chuyển sang dùng <code>runTransaction</code> để đảm bảo tính nguyên tử và cô lập.
### Code
```javascript
// Giải pháp: Chuyển sang runTransaction
await runTransaction(db, async (transaction) => {
  const docSnap = await transaction.get(docRef);
  transaction.update(docRef, update);
});
```
## BUG-REP-005: Race Condition trong tổng hợp phiếu nhập
- **Status:** fixed
- **Severity:** high
- **Module:** REP
- **Files:** 
### Cause
<b>Phân tích</b>: Hàm <code>ensureConsolidatedImportReceiptForTicket</code> dùng <code>getDoc</code> rồi <code>updateDoc</code>/<code>setDoc</code> riêng rẽ thay vì dùng <code>runTransaction</code>.
### Solution
<b>Giải pháp tối ưu</b>: Chuyển toàn bộ logic đọc-ghi phiếu nhập tổng hợp vào trong một <code>runTransaction</code>.
### Code
```javascript
// Cần chuyển sang transaction
await runTransaction(db, async (transaction) => {
  const receiptDoc = await transaction.get(receiptRef);
  if (!receiptDoc.exists()) {
    transaction.set(receiptRef, newData);
  } else {
    transaction.update(receiptRef, updatedData);
  }
});
```
## BUG-REP-006: Missing Transaction trong handleNoteSubmit
- **Status:** fixed
- **Severity:** high
- **Module:** REP
- **Files:** 
### Cause
<b>Phân tích</b>: Hàm <code>handleSubmit</code> dùng <code>updateDoc</code> trực tiếp mà không kiểm tra version hoặc dùng transaction.
### Solution
<b>Giải pháp tối ưu</b>: Sử dụng <code>runTransaction</code> kết hợp với cơ chế Optimistic Locking (dùng trường <code>version</code> đã có).
### Code
```javascript
// Cần dùng transaction + version check
await runTransaction(db, async (transaction) => {
  const ticketDoc = await transaction.get(ticketRef);
  if (ticketDoc.data().version !== currentVersion) {
    throw new Error("Stale data");
  }
  transaction.update(ticketRef, { ...data, version: currentVersion + 1 });
});
```

## BUG-REP-007: Held Counter Corruption trong handleHandover
- **Status:** fixed
- **Severity:** high
- **Module:** REP
- **Files:** 
### Cause
<b>Phân tích</b>: Trong <code>handleHandover</code> (khi action === 'done'), hệ thống trừ cả <code>stock</code> và <code>held</code>. Tuy nhiên, luồng sửa chữa không có bước tăng <code>held</code> khi gán linh kiện vào phiếu (ví dụ ở trạng thái <code>processing</code>).
### Solution
<b>Giải pháp tối ưu</b>: Bổ sung logic tăng <code>held</code> khi linh kiện được gán vào phiếu sửa chữa, HOẶC nếu không dùng cơ chế giữ chỗ cho sửa chữa thì không trừ <code>held</code> ở bước Handover.
### Code
```javascript
// Nếu dùng held cho sửa chữa:
// 1. Khi thêm linh kiện vào phiếu: tăng held
transaction.update(productRef, { held: increment(qty) });
// 2. Khi bàn giao (Done): giảm stock và held
transaction.update(productRef, { stock: increment(-qty), held: increment(-qty) });
```

## BUG-REP-012: Syntax Error cuối file repairs/page.tsx
- **Status:** fixed
- **Severity:** high
- **Module:** REP
- **Date:** 2026-06-13
- **Files:** `src/app/admin/repairs/page.tsx`
### Cause
<b>Phân tích</b>: Quá trình copy-paste logic trước đó tạo ra các dòng code thừa (props của component `Modal` và thẻ đóng bị lặp) nằm bên dưới thẻ đóng của Component gốc khiến Next.js ném lỗi `Syntax Error: Unexpected token`.
### Solution
<b>Giải pháp đã áp dụng</b>: Xóa bỏ toàn bộ phần rác (dangling JSX) sau dòng đóng `}` của component cuối cùng. Đảm bảo cấu trúc file hợp lệ.

## BUG-REP-013: Rò rỉ Tồn kho Giữ chỗ (Held Stock Leak) khi Hủy Phiếu Sửa Chữa
- **Status:** fixed
- **Severity:** critical
- **Module:** REP
- **Files:** `src/app/api/repairs/transition/route.ts`
### Cause
<b>Phân tích</b>: Khi phiếu sửa chữa chuyển sang trạng thái kết thúc không thành công (như `cancelled`), hệ thống không giải phóng số lượng tồn kho đã được giữ chỗ (`held`) cho các linh kiện trong phiếu. Điều này gây rò rỉ `held` vĩnh viễn, ngăn cản việc bán linh kiện đó cho khách hàng khác trừ khi chạy script rebuild.
### Solution
<b>Giải pháp đề xuất</b>: Trong `repairs/transition/route.ts`, nếu trạng thái đích là trạng thái hủy (terminal + cancelled), duyệt qua danh sách linh kiện (`parts`) và giảm trừ `held` tương ứng với số lượng đang chiếm giữ.
### Fix 2026-06-30
- Changed files: `src/app/api/repairs/transition/route.ts`.
- Verification: when a repair moves into a cancel/refund terminal status, reserved selected parts release product `held` and clear `reservedQuantity` in the same transaction.

## BUG-REP-014: Mất Hoa Hồng KTV (Lost Commission) khi Phiếu Sửa Chữa Thanh Toán Sau (Post-paid)
- **Status:** fixed
- **Severity:** critical
- **Module:** REP
- **Files:** `src/app/api/repairs/handover/route.ts`, `src/app/api/pos/checkout/route.ts`
### Cause
<b>Phân tích</b>: 
1. Nếu KTV bàn giao (`handover`) khi phiếu chưa thanh toán, hàm tính hoa hồng bị chặn (guard check `payment.status !== 'paid'`).
2. Khi khách hàng thanh toán phiếu này qua POS (`pos/checkout`), hệ thống POS chỉ tính hoa hồng cho **Đơn Hàng** (Order - thu ngân/sale) mà quên không gọi lại hàm tính hoa hồng cho **Phiếu Sửa Chữa** (Repair - KTV). KTV sẽ mất hoàn toàn hoa hồng.
### Solution
<b>Giải pháp đề xuất</b>: Trong `pos/checkout/route.ts`, khi ghi nhận thanh toán cho `repairRevenue`, cần gọi `calculateAndSaveCommissionsServer(tx, ..., 'repair', ...)` để cấp bù hoa hồng cho kỹ thuật viên dựa trên phiếu sửa chữa vừa được thanh toán.
### Fix 2026-06-30
- Changed files: `src/app/api/pos/checkout/route.ts`.
- Verification: POS repair-ticket payment now calls `calculateAndSaveCommissionsServer(..., 'repair', ...)` with paid server amount so KTV commission is created when post-paid repairs are collected through POS.

## BUG-REP-015: Lỗi Trừ Kho Đúp và Nhân Đôi Giao Dịch Khi Bàn Giao Nhiều Lần (Double Handover Vulnerability)
- **Status:** fixed
- **Severity:** critical
- **Module:** REP
- **Files:** `src/app/api/repairs/handover/route.ts`
### Cause
<b>Phân tích</b>: API bàn giao `/api/repairs/handover` không kiểm tra xem phiếu sửa chữa đã ở trạng thái kết thúc (terminal status) hay chưa. Nó chỉ kiểm tra xem trạng thái đích `targetStatus` có phải là trạng thái kết thúc hay không. Điều này cho phép một phiếu đã kết thúc (ví dụ: `hoan_tat`) được bàn giao lại sang một trạng thái kết thúc khác (ví dụ: `da_tra_may`), dẫn đến việc hệ thống chạy lại toàn bộ logic trừ kho linh kiện lần 2, ghi đúp lịch sử kho (`inventory_logs`), nhân đôi doanh thu tích lũy CRM, nhân đôi giao dịch sổ nợ khách hàng (`customer_ledger`), tính thêm hoa hồng lần 2 cho nhân viên và nhân đôi doanh số trong `revenue_daily_aggregates`.
### Solution
<b>Giải pháp đề xuất</b>: Thêm kiểm tra `isCurrentTerminal` của trạng thái hiện tại (`ticket.status`) tương tự như trong API `/api/repairs/transition`. Nếu trạng thái hiện tại của phiếu đã là terminal, chặn ngay lập tức và ném lỗi. (Bảo toàn nguyên tắc lũy đẳng của trạng thái terminal).
### Fix 2026-06-30
- Changed files: `src/app/api/repairs/handover/route.ts`.
- Verification: handover now detects current workflow/legacy terminal statuses and rejects repeat terminal handover attempts before stock, ledger, commission, or revenue writes.

## BUG-REP-016: Lỗ hổng thao túng doanh thu sửa chữa qua paymentHistory âm
- **Status:** fixed
- **Severity:** critical
- **Module:** REP
- **Files:** `src/app/api/repairs/create/route.ts`
### Cause
<b>Phân tích</b>: Khi tạo phiếu sửa chữa (Repair Ticket) qua API `/api/repairs/create/route.ts`, client được phép truyền vào mảng `paymentHistory`. Hệ thống tự động tính tổng doanh thu từ mảng này thông qua lệnh `reduce` (`sum + amount`). Tuy nhiên, không có validation nào ngăn cản việc truyền biến `amount` mang giá trị âm. Kẻ gian (hoặc nhân viên có quyền quản lý sửa chữa) có thể chủ đích gửi payload chứa `[{ amount: -5000000, type: "deposit" }]`. Điều này khiến biến `depositRevenue` trở thành số âm, dẫn tới việc gọi hàm `incrementRevenueAggregates(tx, db, { repairRevenue: -5000000 })`, trực tiếp làm giảm doanh thu sửa chữa trong báo cáo tài chính (`revenue_daily_aggregates`) mà hệ thống không hề nghi ngờ, tạo điều kiện cho hành vi rút ruột hoặc thao túng báo cáo doanh thu.
### Solution
<b>Giải pháp đề xuất</b>: Bên trong vòng lặp hoặc reduce của `paymentHistory`, bổ sung kiểm tra bắt buộc `if (amount < 0) throw new Error('Số tiền trong lịch sử thanh toán không được nhỏ hơn 0.');`. Tương tự, cần kiểm tra tính hợp lệ của mọi khoản tiền được truyền từ client trong tất cả các module sửa chữa.
### Fix 2026-06-30
- Changed files: `src/app/api/repairs/create/route.ts`.
- Verification: repair create now normalizes `paymentHistory`, rejects negative/non-finite amounts and invalid types, and computes deposit revenue only from validated entries.
