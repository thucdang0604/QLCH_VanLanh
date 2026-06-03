# Walkthrough: Live Chat Omnichannel v2

## Kết quả hiện tại

Hệ thống chat được mở rộng từ web chat đơn kênh thành inbox vận hành cho Web, Facebook Messenger và Zalo OA. Phần nền tảng Facebook đã nhận được tin nhắn thật trên production; nhánh hiện tại bổ sung profile, media, chuyển đổi hội thoại thành khách hàng/đơn nghiệp vụ và hardening dữ liệu cá nhân.

## Luồng người dùng admin

1. Admin mở `/admin/chat`, danh sách phòng hiển thị rõ nguồn `Web`, `Facebook`, `Zalo`.
2. Với Facebook, webhook ghi tin nhắn vào RTDB; UI hiển thị tên/avatar, tai anh qua media API private va co nut mo Meta Inbox neu can doi chieu provider.
3. Admin bấm avatar để mở hồ sơ, nhập/bổ sung tên và số điện thoại.
4. Hệ thống lưu khách tại `customers/{phone}` và liên kết lại vào room RTDB.
5. Từ modal, admin chọn `Tạo sửa chữa` hoặc `Tạo bán lẻ`; dữ liệu được handoff qua `sessionStorage` dùng một lần, form chính thức được mở với thông tin đã điền sẵn nhưng URL không chứa tên/SDT.

## Luồng kỹ thuật chính

- Cấu hình kênh: `src/app/admin/settings/integrations/page.tsx` -> API admin -> `private_config/chat_integrations`.
- Tin vào Facebook: webhook -> Graph profile lookup -> `upsertExternalInboundMessage()` -> RTDB.
- Anh Facebook: message ghi RTDB truoc -> server cache Storage private -> API `chat_support` tai anh cho UI.
- Làm mới room cũ: admin chọn room -> endpoint authenticated -> Graph API -> update `room.info`.
- Tin ra: admin chat -> `/api/admin/chat/send` -> Facebook/Zalo API.
- CRM: modal chat -> Firestore `customers/{phone}` + RTDB `room.info`.
- Nghiệp vụ: modal chat -> `sessionStorage` một lần -> Repair/POS; transaction hiện hữu thực hiện tạo giao dịch.
- Web chat: Firebase Anonymous Auth -> room `chats/{uid}`; không còn quyền read/write public theo prefix `guest_`.
- Authorization: UI, API server và Firebase rules đều kiểm tra quyền tương ứng; API chat bắt buộc `chat_support`.
- Tra loi mau: admin cau hinh trong `private_config/chat_integrations`; nhan vien chen bang nut hoac `/shortcut`.

## Sự cố quan trọng cần nhớ

### Tin Facebook đến webhook nhưng không vào RTDB

Payload đã xuất hiện trong Cloud logs không đủ chứng minh tính năng hoạt động. Runtime function từng báo timeout ghi RTDB vì identity chạy thực tế thiếu quyền Firebase Realtime Database Admin. Lần sau phải xem cả log nhận event, kết quả ghi RTDB và UI subscriber.

### Admin không xem được chat

RTDB client read phụ thuộc `admin_roles/{uid}` được server sync. Thiếu Firebase Admin credentials hoặc IAM không đủ quyền sẽ khiến trang loading/permission denied. Không sửa bằng cách mở rules public.

### Tên Facebook và sticker bị mất

Webhook ban dau chi luu placeholder va ten fallback; ban tiep theo van phu thuoc URL CDN Meta. Phien ban moi ghi tin truoc, cache anh moi o Storage private va tai qua API co quyen chat; URL Meta chi con fallback cho du lieu cu.

### Liên kết trang cá nhân Facebook

PSID nhan tu Messenger la dinh danh theo Page. Nut Meta Inbox dung PSID de chon hoi thoai van hanh trong inbox Page, khong trinh bay no nhu link profile cong khai.

### Dữ liệu cá nhân và token tích hợp

Scan ngày 26.05.2026 xác nhận và sửa sáu vấn đề: quyền CRM quá rộng, room `guest_` public, API chat thiếu `chat_support`, PII nằm trong URL handoff, Facebook token nằm trong URL outbound và lưu raw webhook event không cần thiết. Các báo cáo nguồn được giữ tập trung trong `.codex-security-scans/working-tree_20260525_chat-data/` và có màn hình đọc trong `roadmap_v2`.

## Tệp tham khảo nhanh

- `docs/08_CHAT_INTEGRATIONS.md`: vận hành, schema, sự cố và checklist deploy.
- `src/app/admin/chat/page.tsx`: UI inbox, render media, mở modal.
- `src/components/admin/chat/ChatCustomerProfileModal.tsx`: CRM và chuyển workflow.
- `src/lib/chatServer.ts`: ghi RTDB, profile lookup, outbound.
- `src/app/api/integrations/facebook/webhook/route.ts`: Facebook inbound.
- `src/app/api/admin/chat/rooms/[roomId]/media/[messageId]/[attachmentIndex]/route.ts`: tai anh Facebook private.
- `src/app/api/admin/chat/quick-replies/route.ts`: tra loi mau dang bat.
- `database.rules.json`: RTDB access/schema rules.
- `firestore.rules`: quyền đọc/ghi CRM.
- `src/lib/chatWorkflowHandoff.ts`: chuyển thông tin từ chat sang workflow không qua URL.
- `.codex-security-scans/working-tree_20260525_chat-data/report.md`: kết luận scan và release gate.

## Trạng thái phát hành

- Code nhánh `codex/chat-enhancements` đã qua `typecheck` và `next build`.
- Chưa commit/push phần nâng cấp này tại thời điểm ghi walkthrough.
- Trước deploy rules phải bật Firebase Anonymous Auth; sau đó kiểm thử bằng chat web ẩn danh, tài khoản Facebook khác và Zalo OA khi có token hợp lệ.
