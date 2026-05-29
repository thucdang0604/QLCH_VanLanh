# Walkthrough: Live Chat Omnichannel v2

## Káº¿t quáº£ hiá»‡n táº¡i

Há»‡ thá»‘ng chat Ä‘Æ°á»£c má»Ÿ rá»™ng tá»« web chat Ä‘Æ¡n kĂªnh thĂ nh inbox váº­n hĂ nh cho Web, Facebook Messenger vĂ  Zalo OA. Pháº§n ná»n táº£ng Facebook Ä‘Ă£ nháº­n Ä‘Æ°á»£c tin nháº¯n tháº­t trĂªn production; nhĂ¡nh hiá»‡n táº¡i bá»• sung profile, media, chuyá»ƒn Ä‘á»•i há»™i thoáº¡i thĂ nh khĂ¡ch hĂ ng/Ä‘Æ¡n nghiá»‡p vá»¥ vĂ  hardening dá»¯ liá»‡u cĂ¡ nhĂ¢n.

## Luá»“ng ngÆ°á»i dĂ¹ng admin

1. Admin má»Ÿ `/admin/chat`, danh sĂ¡ch phĂ²ng hiá»ƒn thá»‹ rĂµ nguá»“n `Web`, `Facebook`, `Zalo`.
2. Vá»›i Facebook, webhook ghi tin nháº¯n vĂ o RTDB; UI hiá»ƒn thá»‹ tĂªn/avatar, tai anh qua media API private va co nut mo Meta Inbox neu can doi chieu provider.
3. Admin báº¥m avatar Ä‘á»ƒ má»Ÿ há»“ sÆ¡, nháº­p/bá»• sung tĂªn vĂ  sá»‘ Ä‘iá»‡n thoáº¡i.
4. Há»‡ thá»‘ng lÆ°u khĂ¡ch táº¡i `customers/{phone}` vĂ  liĂªn káº¿t láº¡i vĂ o room RTDB.
5. Tá»« modal, admin chá»n `Táº¡o sá»­a chá»¯a` hoáº·c `Táº¡o bĂ¡n láº»`; dá»¯ liá»‡u Ä‘Æ°á»£c handoff qua `sessionStorage` dĂ¹ng má»™t láº§n, form chĂ­nh thá»©c Ä‘Æ°á»£c má»Ÿ vá»›i thĂ´ng tin Ä‘Ă£ Ä‘iá»n sáºµn nhÆ°ng URL khĂ´ng chá»©a tĂªn/SDT.

## Luá»“ng ká»¹ thuáº­t chĂ­nh

- Cáº¥u hĂ¬nh kĂªnh: `src/app/admin/settings/integrations/page.tsx` -> API admin -> `private_config/chat_integrations`.
- Tin vĂ o Facebook: webhook -> Graph profile lookup -> `upsertExternalInboundMessage()` -> RTDB.
- Anh Facebook: message ghi RTDB truoc -> server cache Storage private -> API `chat_support` tai anh cho UI.
- LĂ m má»›i room cÅ©: admin chá»n room -> endpoint authenticated -> Graph API -> update `room.info`.
- Tin ra: admin chat -> `/api/admin/chat/send` -> Facebook/Zalo API.
- CRM: modal chat -> Firestore `customers/{phone}` + RTDB `room.info`.
- Nghiá»‡p vá»¥: modal chat -> `sessionStorage` má»™t láº§n -> Repair/POS; transaction hiá»‡n há»¯u thá»±c hiá»‡n táº¡o giao dá»‹ch.
- Web chat: Firebase Anonymous Auth -> room `chats/{uid}`; khĂ´ng cĂ²n quyá»n read/write public theo prefix `guest_`.
- Authorization: UI, API server vĂ  Firebase rules Ä‘á»u kiá»ƒm tra quyá»n tÆ°Æ¡ng á»©ng; API chat báº¯t buá»™c `chat_support`.
- Tra loi mau: admin cau hinh trong `private_config/chat_integrations`; nhan vien chen bang nut hoac `/shortcut`.

## Sá»± cá»‘ quan trá»ng cáº§n nhá»›

### Tin Facebook Ä‘áº¿n webhook nhÆ°ng khĂ´ng vĂ o RTDB

Payload Ä‘Ă£ xuáº¥t hiá»‡n trong Cloud logs khĂ´ng Ä‘á»§ chá»©ng minh tĂ­nh nÄƒng hoáº¡t Ä‘á»™ng. Runtime function tá»«ng bĂ¡o timeout ghi RTDB vĂ¬ identity cháº¡y thá»±c táº¿ thiáº¿u quyá»n Firebase Realtime Database Admin. Láº§n sau pháº£i xem cáº£ log nháº­n event, káº¿t quáº£ ghi RTDB vĂ  UI subscriber.

### Admin khĂ´ng xem Ä‘Æ°á»£c chat

RTDB client read phá»¥ thuá»™c `admin_roles/{uid}` Ä‘Æ°á»£c server sync. Thiáº¿u Firebase Admin credentials hoáº·c IAM khĂ´ng Ä‘á»§ quyá»n sáº½ khiáº¿n trang loading/permission denied. KhĂ´ng sá»­a báº±ng cĂ¡ch má»Ÿ rules public.

### TĂªn Facebook vĂ  sticker bá»‹ máº¥t

Webhook ban dau chi luu placeholder va ten fallback; ban tiep theo van phu thuoc URL CDN Meta. Phien ban moi ghi tin truoc, cache anh moi o Storage private va tai qua API co quyen chat; URL Meta chi con fallback cho du lieu cu.

### LiĂªn káº¿t trang cĂ¡ nhĂ¢n Facebook

PSID nhan tu Messenger la dinh danh theo Page. Nut Meta Inbox dung PSID de chon hoi thoai van hanh trong inbox Page, khong trinh bay no nhu link profile cong khai.

### Dá»¯ liá»‡u cĂ¡ nhĂ¢n vĂ  token tĂ­ch há»£p

Scan ngĂ y 26.05.2026 xĂ¡c nháº­n vĂ  sá»­a sĂ¡u váº¥n Ä‘á»: quyá»n CRM quĂ¡ rá»™ng, room `guest_` public, API chat thiáº¿u `chat_support`, PII náº±m trong URL handoff, Facebook token náº±m trong URL outbound vĂ  lÆ°u raw webhook event khĂ´ng cáº§n thiáº¿t. CĂ¡c bĂ¡o cĂ¡o nguá»“n Ä‘Æ°á»£c giá»¯ táº­p trung trong `.codex-security-scans/working-tree_20260525_chat-data/` vĂ  cĂ³ mĂ n hĂ¬nh Ä‘á»c trong `roadmap_v2`.

## Tá»‡p tham kháº£o nhanh

- `docs/08_CHAT_INTEGRATIONS.md`: váº­n hĂ nh, schema, sá»± cá»‘ vĂ  checklist deploy.
- `src/app/admin/chat/page.tsx`: UI inbox, render media, má»Ÿ modal.
- `src/components/admin/chat/ChatCustomerProfileModal.tsx`: CRM vĂ  chuyá»ƒn workflow.
- `src/lib/chatServer.ts`: ghi RTDB, profile lookup, outbound.
- `src/app/api/integrations/facebook/webhook/route.ts`: Facebook inbound.
- `src/app/api/admin/chat/rooms/[roomId]/media/[messageId]/[attachmentIndex]/route.ts`: tai anh Facebook private.
- `src/app/api/admin/chat/quick-replies/route.ts`: tra loi mau dang bat.
- `database.rules.json`: RTDB access/schema rules.
- `firestore.rules`: quyá»n Ä‘á»c/ghi CRM.
- `src/lib/chatWorkflowHandoff.ts`: chuyá»ƒn thĂ´ng tin tá»« chat sang workflow khĂ´ng qua URL.
- `.codex-security-scans/working-tree_20260525_chat-data/report.md`: káº¿t luáº­n scan vĂ  release gate.

## Tráº¡ng thĂ¡i phĂ¡t hĂ nh

- Code nhĂ¡nh `codex/chat-enhancements` Ä‘Ă£ qua `typecheck` vĂ  `next build`.
- ChÆ°a commit/push pháº§n nĂ¢ng cáº¥p nĂ y táº¡i thá»i Ä‘iá»ƒm ghi walkthrough.
- TrÆ°á»›c deploy rules pháº£i báº­t Firebase Anonymous Auth; sau Ä‘Ă³ kiá»ƒm thá»­ báº±ng chat web áº©n danh, tĂ i khoáº£n Facebook khĂ¡c vĂ  Zalo OA khi cĂ³ token há»£p lá»‡.
