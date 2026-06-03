# Plan: Live Chat Omnichannel - Facebook, Zalo, CRM và Chuyển đổi đơn hàng

**ID**: `plan-live-chat-omnichannel-v2`  
**Cập nhật**: 26.05.2026  
**Nhánh**: `codex/chat-enhancements`  
**Checkpoint nền**: `4d3c6fbd feat: add unified external chat integrations`  
**Trạng thái**: in-progress - tính năng và hardening đã build qua, chờ deploy đồng bộ code/rules và kiểm thử production

## Mục tiêu

Biến `/admin/chat` thành hộp thư vận hành thực tế cho ba nguồn `Web`, `Facebook` và `Zalo`, đồng thời nối hội thoại với CRM và quy trình bán hàng/sửa chữa hiện hữu.

## Phạm vi đã triển khai ở checkpoint nền

1. Inbox hợp nhất, phân biệt nguồn bằng `channel`, `source`, `sourceLabel`.
2. Trang `/admin/settings/integrations` để quản trị Facebook Page và Zalo OA trực tiếp trên web.
3. Lưu secret trong `private_config/chat_integrations`, chỉ trả trạng thái đã cấu hình.
4. Webhook Facebook/Zalo và API gửi trả lời ra kênh ngoài.
5. RTDB role sync cho admin/staff có quyền `chat_support`.
6. URL chính sách quyền riêng tư, điều khoản, xóa dữ liệu phục vụ tạo Meta app.

## Phạm vi nâng cấp hiện tại

### 1. Hồ sơ khách hàng ngay trong chat

- Bấm avatar phòng hoặc avatar đầu hội thoại mở `ChatCustomerProfileModal`.
- Tra cứu/lưu khách theo `customers/{phone}`.
- Ghi liên kết về RTDB room info: `customerId`, `customerName`, `customerPhone`, `phone`.
- Khi đã liên kết CRM, tên hiển thị ưu tiên tên khách đã lưu.
- Modal giới hạn tên CRM tối đa 100 ký tự và rút gọn `displayName` còn tối đa 50 ký tự để khớp RTDB validation.

### 2. Tên và avatar Facebook thật

- Webhook gọi Graph API bằng Page Access Token để lấy `first_name`, `last_name`, `profile_pic`.
- Phòng cũ còn tên tạm được làm mới khi admin mở hội thoại qua API:
  `POST /api/admin/chat/rooms/{roomId}/facebook-profile`.
- Lưu `profileSyncedAt` để ghi nhận thời điểm cập nhật profile.

Giới hạn bắt buộc:

- PSID/Messenger `externalUserId` không phải URL hồ sơ Facebook công khai.
- Không hiển thị link trang cá nhân nếu Meta không cung cấp URL đáng tin cậy.

### 3. Media Facebook

- Parse và lưu tối đa 5 attachment/tin nhắn gồm `image`, `sticker`, `audio`, `video`, `file`, `unknown`.
- Ghi message vao RTDB truoc; voi `image`, thu cache server-side vao Storage private sau do cap nhat attachment.
- Render anh qua endpoint co `chat_support`; `storage.rules` danh rieng namespace `private/` cho Admin SDK, khong mo download URL Storage public cho PII hinh anh.
- Neu anh cu/Meta URL khong con tai duoc, cung cap nut mo Meta Business Suite Inbox lam fallback.
- Cho phép CDN Facebook trong CSP: `*.fbcdn.net`, `*.fbsbx.com`.
- Mở rộng RTDB validation cho `messages.attachments`.

### 3.1. Meta Inbox va tra loi mau

- Room Facebook tao nut mo inbox Page tu `externalPageId` va `externalUserId`; PSID chi duoc dung de chon conversation, khong bien thanh URL profile.
- `private_config/chat_integrations.quickReplies[]` luu toi da 30 mau tra loi, text toi da 500 ky tu.
- Admin cau hinh mau tai `/admin/settings/integrations`; staff co `chat_support` chen mau tu `/admin/chat` bang nut hoac `/shortcut`.

### 4. Từ chat sang CRM, sửa chữa và POS

- Khi có đủ tên và số điện thoại, admin lưu khách vào Firestore ngay trong modal.
- `Tạo sửa chữa`: lưu handoff một lần trong `sessionStorage`, mở `/admin/repairs?source=chat` và prefill form; tạo phiếu qua flow sửa chữa chính thức.
- `Tạo bán lẻ`: lưu handoff một lần trong `sessionStorage`, mở `/admin/pos?source=chat` và prefill thông tin; thanh toán qua flow POS chính thức.
- Tạo repair mới gọi `upsertCustomerRecord` trong transaction để cập nhật thống kê CRM.
- Không đưa tên hoặc số điện thoại khách vào URL/history/referrer.

### 5. Hardening dữ liệu khách hàng và quyền chat

- Web chat sử dụng Firebase Anonymous Auth; room mới gắn với UID xác thực thay vì mở quyền public theo prefix `guest_`.
- API gửi tin và API refresh profile Facebook bắt buộc quyền `chat_support`, không chỉ kiểm tra vai trò staff.
- Collection `customers/{phone}` chỉ cho quyền nghiệp vụ cần CRM/chat thay vì mọi staff.
- Facebook Page Access Token đi qua header `Authorization: Bearer`, không xuất hiện trong Graph API URL.
- Bỏ lưu `rawEvent/rawLastEvent` mới trong RTDB; dữ liệu lịch sử cũ cần cleanup một lần nếu muốn giảm retention.
- Zalo webhook ưu tiên `x-webhook-token`/signature nếu cấu hình provider hỗ trợ; URL query secret chỉ dùng khi bắt buộc.

### 6. Lịch sử khách hàng và tác vụ đang mở

- `/admin/customers` mở `CustomerDetailDrawer` khi bấm tên khách, tải lịch sử đơn hàng và sửa chữa theo số điện thoại của khách đang xem.
- `/admin/chat` có panel tác vụ bên phải trên desktop và drawer trên màn hình nhỏ; chỉ tải dữ liệu khi room đã liên kết số điện thoại.
- Đơn hàng đang mở gồm `Pending`, `Confirmed`, `Shipping`; phiếu sửa chữa/bảo hành đang mở dựa trên `isTerminal` của workflow.
- Dữ liệu workflow cũ thiếu cờ terminal được bảo vệ bằng fallback cho `done`, `out`, `refund`, `bh_hoan_tat`, `bh_tu_choi`, `bh_refund`; cấu hình mặc định mới đánh dấu `done` là terminal.
- Deep-link nội bộ `/admin/orders?orderId=<id>` và `/admin/repairs?ticketId=<id>` mở modal chi tiết sẵn có, không tạo flow giao dịch riêng trong chat.
- RBAC giữ nguyên: `manage_orders` mới đọc/đi đến orders, `manage_repairs` mới đọc/đi đến repairs; tài khoản chỉ có `chat_support` không khởi tạo các query này.
- Lịch sử dùng Firebase client dưới rules hiện hành, không thêm Admin API hoặc nới rules cho tính năng chat.

## Data model bổ sung

### RTDB `chats/{roomId}/info`

- `avatarUrl?: string`
- `profileSyncedAt?: number`
- `customerId?: string`
- `customerName?: string`
- `customerPhone?: string`

### RTDB `chats/{roomId}/messages/{messageId}`

```ts
attachments?: Array<{
  type: 'image' | 'sticker' | 'audio' | 'video' | 'file' | 'unknown';
  url?: string;
  stickerId?: string;
  storagePath?: string;
  contentType?: string;
}>;
```

### Firestore

- `private_config/chat_integrations`: token/secret của Facebook/Zalo va `quickReplies[]`.
- `customers/{phone}`: hồ sơ CRM được liên kết từ hội thoại.

## Các sự cố đã gặp và kết luận kỹ thuật

| Sự cố | Nguyên nhân thực tế | Quyết định giữ lại |
| :--- | :--- | :--- |
| Meta nhận webhook nhưng chat không có tin mới | Function nhận payload nhưng Firebase Admin ghi RTDB timeout do runtime service account thiếu quyền/credential không hợp lệ | Luôn kiểm tra write RTDB sau webhook; cấp quyền cho đúng Cloud Run/Functions runtime identity |
| `/admin/chat` loading hoặc `RTDB role sync failed` | Client bị RTDB rules chặn khi backend không ghi được `admin_roles/{uid}` | Role sync server-side phải fail closed; không mở quyền đọc public |
| Phòng Facebook chỉ hiện tên tạm | Webhook trước đây chưa lấy Graph profile hoặc room cũ chưa được cập nhật | Lookup profile khi nhận tin và endpoint refresh room cũ |
| Anh Facebook khong hien/on dinh | URL media Meta tam thoi hoac browser bi chan tai CDN | Cache anh private + authenticated media endpoint; Inbox fallback khi nguon cu het han |
| Mong muốn link trang cá nhân Facebook | PSID là Page-scoped ID, không phải public profile link | Không tự dựng URL sai |
| Muốn tạo đơn ngay trong chat | Tạo tắt sẽ bỏ qua kiểm soát tồn kho/thanh toán/workflow sửa chữa | Chuyển dữ liệu sang POS/Repair hiện hữu và đồng bộ CRM |
| Deploy RTDB Rules lỗi `startsWith` | Rules language không hỗ trợ JavaScript `startsWith` | Chỉ dùng `beginsWith` trong `database.rules.json` |
| RTDB room `guest_` đọc/ghi public | Room có thể chứa tin nhắn, tên và số điện thoại khách | Dùng Firebase Anonymous Auth; khóa quyền theo UID |
| Staff không có quyền chat vẫn gọi được API privileged | API dùng Admin SDK nhưng chỉ kiểm tra vai trò | Bắt buộc `chat_support` tại API server |
| Handoff CRM đặt PII trong URL | Query string lưu vào history/log/referrer | Chuyển sang `sessionStorage` dùng một lần |
| Facebook token có trong URL outbound | Token có thể đi vào log của hạ tầng/provider | Dùng header `Authorization` |

## Nguyên tắc triển khai về sau

1. Secret kênh được thay đổi qua web và lưu server-side; env chỉ là fallback.
2. Mọi webhook cần xác minh ba điểm riêng: callback verify, event nhận được, dữ liệu hiển thị từ RTDB.
3. Mọi thay đổi Firebase Admin/SSR cần kiểm tra đúng runtime IAM, không suy diễn từ service account có tên `firebase-adminsdk`.
4. Media ngoài domain phải đi kèm cập nhật CSP và validation dữ liệu.
5. Luồng phát sinh tiền/tồn kho không được tạo rút gọn ở chat; tái sử dụng POS/Repair transaction hiện có.
6. Chạy `npm.cmd run typecheck` và `npm.cmd run build` trước deploy; cảnh báo không chặn phải được ghi rõ, không bị hiểu nhầm là test chưa chạy.
7. Không chạy công cụ đồng bộ làm ghi đè SPA shell của `roadmap_v2`; cập nhật data/AI plan theo hướng data-first.
8. Không đưa PII vào URL/localStorage; handoff nghiệp vụ dùng dữ liệu tạm theo tab và tiêu thụ một lần.
9. Không cho client hoặc API truy cập chat/CRM chỉ dựa trên route UI; rules và API đều phải kiểm tra quyền.

## Files đã sửa trong nhánh nâng cấp

| File | Vai trò |
| :--- | :--- |
| `src/app/admin/chat/page.tsx` | Modal profile, media rendering, refresh profile, CRM display name |
| `src/components/admin/chat/ChatCustomerProfileModal.tsx` | Lưu/xem CRM và chuyển workflow |
| `src/lib/chatServer.ts` | Facebook Graph profile, attachment persistence, room refresh |
| `src/app/api/integrations/facebook/webhook/route.ts` | Parse text/media và lấy profile |
| `src/app/api/admin/chat/rooms/[roomId]/facebook-profile/route.ts` | Làm mới profile phòng cũ |
| `src/app/api/admin/chat/rooms/[roomId]/media/[messageId]/[attachmentIndex]/route.ts` | Doc anh Facebook private co `chat_support` |
| `src/app/api/admin/chat/quick-replies/route.ts` | Doc mau tra loi dang bat cho nhan vien chat |
| `src/lib/realtimedb.ts`, `database.rules.json` | Schema/validation mới |
| `src/app/admin/repairs/page.tsx`, `src/app/admin/pos/page.tsx` | Prefill từ chat và CRM sync |
| `next.config.mjs`, `firebase.json` | CSP cho Facebook media |
| `src/lib/chatWorkflowHandoff.ts` | Handoff CRM sang POS/Repair không dùng URL chứa PII |
| `src/lib/useCustomerActivity.ts` | Realtime query lịch sử theo SDT, lọc tác vụ mở và fallback terminal legacy |
| `src/components/admin/customers/CustomerDetailDrawer.tsx` | Drawer lịch sử đơn/sửa chữa tại CRM |
| `src/components/admin/chat/ChatCustomerActivityPanel.tsx` | Panel tác vụ đang mở theo quyền module |
| `src/app/admin/orders/page.tsx`, `src/app/admin/repairs/page.tsx` | Deep-link mở modal chi tiết hiện hữu |
| `src/app/admin/settings/repairs/page.tsx` | Cấu hình mặc định `done` là terminal |
| `src/lib/apiAuth.ts`, `firestore.rules` | Permission gate cho API chat và CRM |
| `src/components/ChatWidget.tsx` | Firebase Anonymous Auth cho room chat web |
| `.codex-security-scans/working-tree_20260525_chat-data/` | Scan artifacts và báo cáo khắc phục tập trung |

## Cập nhật 26.05.2026 - Sửa lỗi lưu CRM từ chat

- Phát hiện modal chat ghi trực tiếp Firestore `customers/{phone}` và RTDB room info từ browser, nên RTDB role sync lỗi sẽ làm UI báo `PERMISSION_DENIED` khi lưu khách mới.
- Thêm API bảo vệ bởi quyền `chat_support`: `GET/POST /api/admin/chat/rooms/{roomId}/customer`.
- Modal chỉ gọi API bằng bearer token; không còn tự ghi Firestore/RTDB trong trình duyệt.
- Server ưu tiên lưu hồ sơ CRM, sau đó liên kết room với timeout. Nếu RTDB tạm không khả dụng, admin được thông báo CRM đã lưu nhưng liên kết room cần thử lại.
- API không trả chi tiết lỗi Firebase nội bộ cho browser; lỗi 500 được log ở server và phản hồi tổng quát.
- Guardrail mới: không triển khai lại kiểu ghi tách rời client-side cho luồng CRM từ chat.

## Cập nhật 26.05.2026 - Lịch sử CRM và hàng đợi xử lý

- Thêm drawer lịch sử tại `/admin/customers` và panel tác vụ realtime tại `/admin/chat`.
- Mỗi truy vấn được kích hoạt theo khách/phòng hiện tại, không subscribe lịch sử của toàn bộ khách hàng.
- Panel và drawer không đọc collection nghiệp vụ nếu user thiếu quyền tương ứng, tránh tái diễn lỗi phân quyền client.
- Link từ lịch sử/tác vụ đi vào modal orders/repairs hiện hữu bằng query param, giữ toàn bộ kiểm tra quyền và workflow tại trang nghiệp vụ.
- Giữ phạm vi hiện tại ở mua hàng và sửa chữa; appointments/tags/tier vẫn thuộc CRM mở rộng về sau.

## Verification

Đã chạy cục bộ:

- `npm.cmd run typecheck` - pass.
- `npm.cmd run build` - pass; còn cảnh báo `console` hiện hữu và trace `protobufjs` không chặn build.
- JSON parse/check cho `database.rules.json` và kiểm tra whitespace diff - pass.

Cần thực hiện sau deploy:

1. Nhắn Facebook text mới, sticker và ảnh; xác minh tên/avatar/media trên production admin chat.
2. Trả lời ngược từ admin chat về Facebook.
3. Mở room cũ hiện tên tạm để kiểm tra endpoint refresh.
4. Lưu CRM từ avatar, tạo thử repair/POS và xác nhận URL chỉ có `source=chat`, không có PII.
5. Trước khi áp dụng RTDB rules mới, bật Firebase Authentication provider `Anonymous`; kiểm thử chat web trong cửa sổ ẩn danh.
6. Kiểm thử Zalo khi OA/API đã được duyệt và token hợp lệ.
7. Mở drawer khách có cả order/repair, kiểm tra quyền từng tab và deep-link modal.
8. Chọn room đã liên kết SĐT; kiểm tra panel chỉ hiện phiếu chưa đóng và tài khoản chỉ có `chat_support` không query nghiệp vụ.
