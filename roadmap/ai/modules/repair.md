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
            F -->|"Đã đặt mua"| G("📦 Đã Đặt LK")
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
            DONE_WAR --> DONE_FIN("🔗 Ghi nhận Doanh Thu (Tài Chính)")
            %% Liên kết chuyển trang cho node Tìm Linh Kiện
            click F call handleWorkflowClick("inventory") "Mở Sơ đồ Luồng Kho"
            click DONE_FIN call handleWorkflowClick("finance-hr") "Mở Sơ đồ Tài Chính"
            click BUG_REP_001 call handleBugClick("BUG-REP-001") "Mở chi tiết"
            click BUG_REP_002 call handleBugClick("BUG-REP-002") "Mở chi tiết"
            click BUG_REP_003 call handleBugClick("BUG-REP-003") "Mở chi tiết"
            click BUG_REP_004 call handleBugClick("BUG-REP-004") "Mở chi tiết"
            click BUG_INV_006 call handleBugClick("BUG-INV-006") "Mở chi tiết"
            click BUG_REP_005 call handleBugClick("BUG-REP-005") "Mở chi tiết"
            click BUG_REP_006 call handleBugClick("BUG-REP-006") "Mở chi tiết"
            click BUG_REP_007 call handleBugClick("BUG-REP-007") "Mở chi tiết"
```
# 🐛 Bugs
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
## BUG-REP-008: Race Condition mảng statusTimeline trong handleQuickStatus
- **Status:** fixed
- **Severity:** high
- **Module:** REP
- **Files:** 
### Cause
<b>Phân tích</b>: Hàm <code>handleQuickStatus</code> không dùng Transaction để đọc dữ liệu mới nhất từ Firestore trước khi push phần tử mới vào mảng <code>statusTimeline</code>.
### Solution
<b>Giải pháp tối ưu</b>: Dùng <code>FieldValue.arrayUnion</code> để append phần tử mới vào mảng một cách atomic, hoặc đưa vào <code>runTransaction</code> nếu cần kiểm tra điều kiện phức tạp.
### Code
```javascript
// Giải pháp 1: Dùng arrayUnion (Atomic)
transaction.update(ticketRef, {
  statusTimeline: FieldValue.arrayUnion(newTimelineEntry)
});
```
