# Báo cáo đánh giá Sub_AI MCP

## 1. Kết quả từ Sub_AI (`mcp_sub-ai_get_file_impact`)
Khi kiểm tra mức độ ảnh hưởng của file `src/lib/usePresence.ts`, Sub_AI đã báo cáo như sau:
- **Direct Impact (Ảnh hưởng trực tiếp):** `src/app/(customer)/layout.shell.tsx`
- **Transitive Impact (Ảnh hưởng gián tiếp):** `src/app/(customer)/layout.tsx`

**Nhận xét:** Sub_AI phát hiện **RẤT CHÍNH XÁC** các file import trực tiếp và gián tiếp React hook `usePresence()`. Về mặt dependency graph (cây phụ thuộc của TypeScript/React), nó đã hoàn thành tốt nhiệm vụ.

## 2. Những thiếu sót nguy hiểm của Sub_AI (Implicit Data Dependencies)
Sau khi tôi tự quét tay toàn bộ dự án (`grep_search`), tôi đã phát hiện một rủi ro cực kỳ lớn mà Sub_AI đã bỏ sót: **Sự phụ thuộc về mặt dữ liệu (Data Dependency) thông qua Firebase Firestore**.

File `src/lib/usePresence.ts` hiện tại có logic ghi dữ liệu vào Firestore:
```typescript
await setDoc(doc(db, 'analytics', todayStr), { visitors: increment(1) }, { merge: true });
```

Nếu chúng ta thay đổi logic này (như việc chuyển sang gọi API và đổi cấu trúc lưu trữ sang `analytics/YYYY-MM-DD/visits/device_xxx`), thì **bất kỳ file nào đang đọc dữ liệu từ `analytics` cũng sẽ bị lỗi hoặc hiển thị sai**.

Sub_AI hoàn toàn **KHÔNG THỂ** biết được file nào đang đọc dữ liệu này vì nó không có sự liên kết code (import/export) trực tiếp với `usePresence.ts`.

Thực tế, file **`src/app/admin/page.tsx`** đang trực tiếp đọc dữ liệu này để hiển thị trên Dashboard Admin:
```typescript
// src/app/admin/page.tsx (Dòng 113)
const analyticsDoc = await getDoc(doc(db, 'analytics', todayStr));
const dailyVisitors = analyticsDoc.exists() ? (analyticsDoc.data().visitors || 0) : 0;
```

## 3. Kết luận
- **Điểm mạnh của Sub_AI:** Rất giỏi trong việc tìm các dependency về mặt code (Imports/Exports/Component hierarchy). Giúp dev tìm nhanh file cần sửa khi thay đổi signature của một function.
- **Điểm yếu chí mạng:** Mù hoàn toàn với các **Implicit Data Dependencies** (Ví dụ: 2 file hoàn toàn độc lập về code nhưng giao tiếp với nhau qua chung 1 bảng Database, LocalStorage, hoặc Event Emitter).
- **Hành động khắc phục:** Không bao giờ được tin tưởng 100% vào Sub_AI khi thay đổi kiến trúc dữ liệu (Database Schema, API Payload). Luôn luôn phải kết hợp với việc `grep_search` các từ khóa liên quan đến "Tên bảng/Tên Collection" (ví dụ: tìm chữ `analytics`) trên toàn bộ codebase.
