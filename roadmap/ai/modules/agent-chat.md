# 💬 Agent Chat

# 🐛 Bugs
## BUG-CHAT-001: Rò rỉ Handoff Session (Cross-Tab Contamination)
- **Status:** fixed
- **Severity:** high
- **Module:** CHAT
- **Files:** `src/lib/chatWorkflowHandoff.ts`, `src/components/admin/chat/ChatCustomerProfileModal.tsx`, `src/app/admin/pos/page.tsx`
### Cause
<b>Phân tích</b>: Lưu thông tin khách từ Chat sang POS/Repairs bằng `sessionStorage`. Nếu nhân viên tư vấn mở nhiều tab chat với nhiều khách khác nhau, và bấm "Tạo đơn" ở tab A rồi chưa thực hiện mà qua tab B bấm "Tạo đơn", dữ liệu trong `sessionStorage` bị ghi đè chéo. Hậu quả là thông tin Khách A bị tráo thành Khách B ở màn hình POS.
### Solution
<b>Giải pháp đề xuất</b>: Truyền dữ liệu qua query string của URL (ví dụ: `/admin/pos?handoff=roomId`) thay vì dùng biến `sessionStorage`, để đảm bảo cô lập state giữa các tab.
### Fix 2026-06-30
- Root cause: `sessionStorage` chia sẻ giữa các tab cùng window → bấm "Tạo đơn" ở tab B ghi đè data tab A.
- Changed files: `src/lib/chatWorkflowHandoff.ts`, `src/components/admin/chat/ChatCustomerProfileModal.tsx`, `src/app/admin/pos/page.tsx`.
- Fix: Rewrite handoff module hoàn toàn:
  - `storeChatWorkflowHandoff()` → `buildHandoffUrl()` trả URL path có query params (`handoffRoom`, `handoffName`, `handoffPhone`).
  - `consumeChatWorkflowHandoff()` → nhận `URLSearchParams` thay vì đọc sessionStorage.
  - Caller `ChatCustomerProfileModal.startWorkflow()` → navigate tới URL có handoff params.
  - Consumer `POS page` → đọc handoff từ URL search params.
- Mỗi tab giữ URL riêng → cô lập hoàn toàn. Input sanitized (roomId cắt 220 chars, name 100 chars, phone chỉ số).
- Verification: sessionStorage không còn được dùng trong handoff flow; lint + typecheck pass.

## BUG-CHAT-002: Truy vấn RAG N-Plus (Tải OOM & Bùng nổ chi phí Firestore)
- **Status:** fixed
- **Severity:** high
- **Module:** CHAT
- **Files:** `src/app/api/ai/route.ts`
### Cause
<b>Phân tích</b>: Khi AI chatbot hoạt động, nếu phát hiện khách hàng hỏi về giá/sản phẩm, hệ thống gọi `getAdminDb().collection('products').where('status', '==', 'active').limit(250).get()` TRỰC TIẾP TRONG API ROUTE cho **mỗi tin nhắn**. Điều này có nghĩa là mỗi tin nhắn hỏi giá sẽ tải 250 bản ghi từ Firestore về RAM của server Node.js. N lượng tin nhắn đồng thời sẽ gây OOM (Out Of Memory) và tốn hàng chục ngàn lượt read Firestore một cách lãng phí (Cost Explosion).
### Solution
<b>Giải pháp đề xuất</b>: Sử dụng In-Memory Cache (ví dụ `lru-cache`) trên Node.js hoặc Redis để cache danh sách 250 sản phẩm này trong 15-30 phút thay vì query trực tiếp database cho mỗi tin nhắn. Hoặc tốt hơn là dùng Vector Search (như Vertex AI Search / Pinecone) nếu danh mục sản phẩm lớn.
### Fix 2026-06-30
- Root cause: Mỗi tin nhắn AI gọi `limit(250).get()` trực tiếp → N×250 Firestore reads/phút.
- Changed files: `src/app/api/ai/route.ts`.
- Fix: Thêm `getRAGProducts()` function với in-memory cache singleton (TTL = 15 phút). Giảm limit 250→200 và thêm `.select('name', 'price', 'stock')` để giảm payload. Reads giảm từ N×250/phút xuống ≤1×200/15 phút.
- Verification: Cache logic verified; lint + typecheck pass.
