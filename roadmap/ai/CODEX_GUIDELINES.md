# 📜 CODEX CODE GUIDELINES (QUY TẮC PHÁT TRIỂN CHUẨN CODEX)

Tài liệu này tổng hợp toàn bộ phong cách lập trình, design patterns và quy tắc kỹ thuật đặc trưng được áp dụng bởi **Codex** trong dự án **QLCH_VanLanh**. Mọi lập trình viên (và các AI Agent tiếp theo) nên tuân thủ các quy tắc này để đảm bảo tính đồng nhất, an toàn và hiệu năng của hệ thống.

---

## 1. NGUYÊN TẮC THIẾT KẾ & TƯ DUY (KARPATHY PRINCIPLES)

*   **Think Before Coding:** Luôn trình bày rõ ràng các phương án đánh đổi trước khi viết code. Nếu yêu cầu có điểm mơ hồ, hãy dừng lại hỏi khách hàng thay vì tự đoán mò.
*   **Simplicity First:** Viết lượng code tối thiểu để giải quyết vấn đề. Tránh thêm các abstraction, generic class phức tạp hoặc tính năng speculative (dự phòng tương lai) không được yêu cầu.
*   **Surgical Changes:** Chỉ sửa đổi chính xác những dòng code cần thiết để thực hiện task. Giữ nguyên style code xung quanh, không refactor vô cớ các hàm lân cận nếu chúng không bị lỗi.
*   **Goal-Driven Execution:** Xác định rõ tiêu chí nghiệm thu và phương pháp test trước khi code. Chạy ESLint, Typecheck và Build local trước khi bàn giao.
*   **Incremental Development (Phát triển cuốn chiếu & Commit nhỏ):** Tuyệt đối tránh việc sửa đổi cùng lúc một lượng code quá lớn ở nhiều file khác nhau. Hãy chia nhỏ bài toán thành các phân đoạn cực kỳ nhỏ, tiến hành sửa đổi, kiểm thử độc lập (lint, typecheck) và commit/lưu checkpoint thường xuyên. Điều này đảm bảo hệ thống luôn có điểm khôi phục an toàn (safe revert point), phòng ngừa rủi ro làm hỏng code hàng loạt và phải viết lại từ đầu.

---

## 2. QUY TẮC FIRESTORE & TRANSACTION NÂNG CAO

Dự án QLCH_VanLanh sử dụng Firestore làm database chính với lượng ghi đọc lớn. Để tối ưu chi phí và tránh race condition, cần áp dụng các pattern sau:

### 2.1. Quy tắc "Đọc Trước Ghi Sau" (Read-Before-Write Strict Rule)
Trong mọi Firestore Transaction (Client & Server SDK), **bắt buộc** phải gom toàn bộ các lệnh đọc dữ liệu (`tx.get`) lên đầu tiên. Tuyệt đối không gọi `tx.get` sau khi đã gọi bất kỳ lệnh ghi nào (`tx.set`, `tx.update`, `tx.delete`).
*Vi phạm quy tắc này sẽ làm sập transaction của Firestore ngay lập tức.*

```typescript
// ❌ SAI: Gọi get sau set/update
await runTransaction(db, async (tx) => {
    tx.update(docRef, { status: 'processing' });
    const snap = await tx.get(counterRef); // Sẽ ném lỗi!
});

// ✅ ĐÚNG: Gom toàn bộ get lên đầu
await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const userSnap = await tx.get(userRef);
    
    // Thực hiện logic ghi ở dưới
    tx.update(docRef, { status: 'processing' });
});
```

### 2.2. Đồng bộ tồn kho (Double-Entry Balance)
Trạng thái tồn kho của sản phẩm có hai trường: `stock` (tồn thực tế) và `held` (tạm giữ cho đơn hàng pending hoặc phiếu sửa chữa).
*   Chỉ cập nhật hai trường này thông qua các atomic operation (`FieldValue.increment`) bên trong transaction.
*   Công thức kiểm tra khả dụng: `available = stock - held`. Luôn kiểm tra điều kiện này ở cả FE và BE trước khi cho phép xuất kho.

### 2.3. Sử dụng Server-Side Timestamps đúng cách
Không được sử dụng `FieldValue.serverTimestamp()` bên trong các mảng dữ liệu (ví dụ như khi đẩy log vào mảng `statusTimeline` qua `FieldValue.arrayUnion`).
*   **Giải pháp:** Sử dụng native Javascript `new Date()` hoặc `Date.now()` cho các phần tử mảng.
*   Chỉ sử dụng `FieldValue.serverTimestamp()` cho các root fields của document.

### 2.4. So khớp dữ liệu an toàn (Data Matching)
Khi so khớp dữ liệu string từ client gửi lên với các cấu hình hệ thống (ví dụ: so khớp tên linh kiện hoặc danh mục với các rule giảm giá/bảo hành):
*   **Luôn làm sạch chuỗi:** Sử dụng `.trim().toLowerCase()` ở cả hai phía để chống lỗi khoảng trắng thừa hoặc sai khác chữ hoa/thường.

---

## 3. CHUẨN HÓA MÃ CHỨNG TỪ & DOCUMENT ID

Tránh sử dụng document ID ngẫu nhiên (auto-generated ID của Firestore) cho các thực thể nghiệp vụ để thuận tiện cho việc truy vết dữ liệu (audit trail) và in ấn.

### 3.1. Phía Backend (Server-Side Sequential IDs)
Sử dụng các helper trong [serverDocumentIds.ts](file:///m:/QLCH_VanLanh/src/lib/serverDocumentIds.ts) để sinh ID tuần tự dạng `{PREFIX}-{YYMMDD}-{SEQUENCE}` (ví dụ: `DH-260623-0001`).

*   **Tối ưu hóa Bulk Reservation:** Khi cần tạo nhiều tài liệu có ID tuần tự cùng lúc, chỉ gọi `.commitCounter()` trên phần tử cuối cùng của mảng allocations để lưu sequence lớn nhất nhằm tiết kiệm số lần ghi Firestore.

```typescript
// ✅ ĐÚNG: Bulk allocation
const logAllocations = await reserveSequentialDocumentIds(tx, db, {
    collectionName: 'inventory_logs',
    prefix: 'IL',
    count: items.length,
});

items.forEach((item, index) => {
    tx.set(logAllocations[index].ref, { ...itemData });
});

// Chỉ commit counter trên phần tử cuối
logAllocations.at(-1)?.commitCounter();
```

### 3.2. Phía Client-Side (Client-Side Standard IDs)
*   **Khách hàng (CRM):** Sử dụng số điện thoại đã được chuẩn hóa (ví dụ: `0987654321`) làm Document ID trực tiếp cho collection `customers`.
*   **Nhà cung cấp:** Sử dụng hàm `reserveSupplierDocumentId` tạo ID theo dạng `NCC-{phone-or-name-slug}`.
*   **Các document tạo nhanh từ client:** Sử dụng helper `buildClientDocumentId` trong [clientDocumentIds.ts](file:///m:/QLCH_VanLanh/src/lib/clientDocumentIds.ts) để tạo ID dạng `{PREFIX}-{YYMMDD}-{RANDOM}-{SUFFIX}`.

---

## 4. TỔ CHỨC CẤU TRÚC FILE & CODE HYGIENE

*   **Tách biệt logic nghiệp vụ (Separation of Concerns):**
    *   Tránh viết các hàm tính toán phức tạp (như tính commission, discount stacking, FIFO allocation) trực tiếp trong các component page UI.
    *   Hãy tách các hàm này thành các pure functions và đặt trong thư mục `src/lib/` (ví dụ: `discountCalc.ts`, `commissionUtils.ts`, `inventoryFifo.ts`). Viết unit test đi kèm nếu cần thiết.
*   **Tránh dùng Any Types:**
    *   Định nghĩa type/interface rõ ràng trong `src/lib/types.ts` hoặc local types file. Không lạm dụng việc suppress lỗi bằng `any` hoặc `@ts-ignore` trừ khi có giới hạn bất khả kháng từ thư viện bên ngoài.
*   **Comment Tiếng Việt:**
    *   Viết comment giải thích nghiệp vụ ngắn gọn bằng Tiếng Việt trực tiếp trong mã nguồn đối với các đoạn logic phức tạp hoặc có tính chất rủi ro cao.

---

## 5. RÀO CẢN KỸ THUẬT CẦN TRÁNH TUYỆT ĐỐI

*   **Không đặt tên folder bắt đầu bằng dấu chấm:** Tránh tạo các thư mục/file như `.codex-scans` vì web server local (SPA Roadmap) chạy bằng Node.js static server sẽ chặn truy cập các file ẩn này (HTTP 404), dẫn đến hỏng UI. Hãy dùng tên thường như `codex-scans`.
*   **Mermaid Syntax:** Luôn đóng đầy đủ cú pháp 3 backticks cho Mermaid diagram và không lồng ghép heading markdown sát dưới diagram chưa đóng.
*   **Template Literals:** Tránh bọc template literals chứa mã JavaScript động một cách thô trong markdown, hãy dùng thẻ `<code>...</code>` để tránh lỗi parse màn hình SPA.
