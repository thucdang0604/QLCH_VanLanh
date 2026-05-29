# Task: Live Chat Omnichannel v2

**NhĂ¡nh**: `codex/chat-enhancements`  
**Cáº­p nháº­t**: 26.05.2026

## Ná»n táº£ng Ä‘Ă£ hoĂ n thĂ nh á»Ÿ checkpoint `4d3c6fbd`

- [x] Inbox thá»‘ng nháº¥t Web / Facebook / Zalo táº¡i `/admin/chat`.
- [x] MĂ n hĂ¬nh cáº¥u hĂ¬nh `/admin/settings/integrations`.
- [x] Secret lÆ°u server-side táº¡i `private_config/chat_integrations`.
- [x] Webhook Facebook/Zalo vĂ  API gá»­i tráº£ lá»i ngoĂ i há»‡ thá»‘ng.
- [x] RTDB schema/rules nháº­n biáº¿t nguá»“n kĂªnh vĂ  admin role sync.
- [x] Facebook production webhook Ä‘Ă£ nháº­n vĂ  lÆ°u tin sau khi sá»­a IAM/runtime RTDB access.

## NĂ¢ng cáº¥p hiá»‡n táº¡i

- [x] ThĂªm modal há»“ sÆ¡ khĂ¡ch hĂ ng khi báº¥m avatar.
- [x] LÆ°u/liĂªn káº¿t `customers/{phone}` tá»« phĂ²ng chat.
- [x] Æ¯u tiĂªn tĂªn CRM khi phĂ²ng Ä‘Ă£ liĂªn káº¿t khĂ¡ch.
- [x] Fetch vĂ  lÆ°u tĂªn/avatar Facebook tá»« Graph API.
- [x] ThĂªm endpoint refresh profile cho phĂ²ng Facebook cÅ©.
- [x] Parse/lÆ°u/render sticker, áº£nh, audio, video, file Facebook.
- [x] Má»Ÿ rá»™ng CSP cho media/avatar Facebook CDN.
- [x] Má»Ÿ rá»™ng RTDB rule cho profile/CRM/attachments.
- [x] NĂºt táº¡o sá»­a chá»¯a vĂ  táº¡o bĂ¡n láº» tá»« modal chat.
- [x] Prefill tĂªn/SDT cho `/admin/repairs` vĂ  `/admin/pos`.
- [x] Äá»“ng bá»™ CRM khi táº¡o phiáº¿u sá»­a chá»¯a má»›i.
- [x] Cháº·n lá»—i tĂªn CRM vÆ°á»£t giá»›i háº¡n RTDB: tĂªn khĂ¡ch tá»‘i Ä‘a 100 kĂ½ tá»±, `displayName` rĂºt gá»n tá»‘i Ä‘a 50 kĂ½ tá»±.
- [x] Chuyá»ƒn handoff CRM sang `sessionStorage` dĂ¹ng má»™t láº§n, khĂ´ng cĂ²n PII trong URL.
- [x] KhĂ³a RTDB public `guest_`; web chat láº¥y identity báº±ng Firebase Anonymous Auth.
- [x] Báº¯t buá»™c `chat_support` táº¡i API gá»­i tin vĂ  refresh profile Facebook.
- [x] Giá»›i háº¡n quyá»n Firestore `customers/{phone}` theo nghiá»‡p vá»¥.
- [x] Chuyá»ƒn Facebook token sang header vĂ  dá»«ng lÆ°u raw webhook event má»›i.
- [x] Ghi bĂ¡o cĂ¡o scan táº­p trung vĂ  hiá»ƒn thá»‹ danh má»¥c artifact trong roadmap_v2.
- [x] ThĂªm `useCustomerActivity` Ä‘á»ƒ táº£i realtime lá»‹ch sá»­ theo má»™t SDT, gá»“m order legacy fallback.
- [x] ThĂªm drawer lá»‹ch sá»­ táº¡i `/admin/customers` vá»›i tab ÄÆ¡n hĂ ng/Sá»­a chá»¯a theo quyá»n.
- [x] ThĂªm panel tĂ¡c vá»¥ Ä‘ang má»Ÿ táº¡i `/admin/chat`, responsive desktop/mobile vĂ  khĂ´ng query module thiáº¿u quyá»n.
- [x] ThĂªm deep-link modal `/admin/orders?orderId=` vĂ  `/admin/repairs?ticketId=`.
- [x] Nháº­n diá»‡n terminal repair legacy vĂ  Ä‘Ă¡nh dáº¥u máº·c Ä‘á»‹nh `done` lĂ  terminal.
- [x] áº¨n hĂ nh Ä‘á»™ng táº¡o POS/Repair trong modal chat náº¿u user thiáº¿u quyá»n module tÆ°Æ¡ng á»©ng.
- [x] Lá»c chá»‰ sá»‘ tá»•ng há»£p API há»“ sÆ¡ chat theo `manage_orders`/`manage_repairs`, khĂ´ng lá»™ qua `chat_support` Ä‘Æ¡n thuáº§n.
- [x] Sá»­a deep-link order cÅ© ngoĂ i trang Ä‘áº§u váº«n cáº­p nháº­t tráº¡ng thĂ¡i tá»« modal Ä‘Æ°á»£c.
- [x] Cache anh Facebook moi vao Storage private va tai qua API co `chat_support`, ghi RTDB truoc de khong chan text.
- [x] Lazy-cache anh cu khi URL Meta van con tai duoc; anh da het han dung Meta Inbox fallback.
- [x] Them nut mo Meta Business Suite Inbox cho room Facebook lam fallback van hanh, khong dung lam link profile.
- [x] Them cau hinh tra loi mau va `/shortcut` tai trang tich hop/chat.
- [x] Giu dinh dang xuong dong cua cau tra loi dai khi gui kenh ngoai.
- [x] Dong bo API cau hinh tich hop theo quyen `manage_settings` cua route, khong gioi han sai chi cho admin.

## Verification cá»¥c bá»™

- [x] `npm.cmd run typecheck`.
- [x] `npm.cmd run build`.
- [x] Parse JSON config/rules vĂ  kiá»ƒm tra whitespace diff.

## Chá» deploy/xĂ¡c minh thá»±c táº¿

- [x] Báº­t Firebase Authentication provider `Anonymous` trĂªn production.
- [x] Deploy SSR function/Hosting, Firestore Rules, Realtime Database Rules va Storage Rules cung phien ban.
- [x] Web chat: táº¡o room an danh má»›i vĂ  nháº­n/gá»­i tin sau khi rules Ä‘Ă£ khĂ³a.
- [x] Facebook: nháº­n text tá»« tĂ i khoáº£n má»›i vĂ  hiá»ƒn thá»‹ Ä‘Ăºng tĂªn/avatar.
- [x] Facebook: nháº­n sticker/áº£nh; anh moi render qua media API private va van xem duoc sau reload.
- [x] Facebook: admin reply gá»­i trá»Ÿ láº¡i Messenger.
- [x] CRM: lÆ°u khĂ¡ch tá»« avatar vĂ  kiá»ƒm tra `customers/{phone}`.
- [x] Repair/POS: má»Ÿ form Ä‘Ă£ prefill, URL khĂ´ng chá»©a tĂªn/SDT vĂ  hoĂ n táº¥t giao dá»‹ch thá»­.
- [x] Zalo: kiá»ƒm thá»­ nháº­n/gá»­i sau khi OA API Ä‘Æ°á»£c phĂª duyá»‡t/cĂ³ access token.
- [x] CRM history: khĂ¡ch cĂ³ cáº£ order/repair má»Ÿ drawer, click tá»«ng dĂ²ng vĂ  xĂ¡c minh modal Ä‘Ăºng.
- [x] RBAC: staff chá»‰ `manage_orders` khĂ´ng Ä‘á»c repair; staff chá»‰ `chat_support` khĂ´ng phĂ¡t sinh `PERMISSION_DENIED` táº¡i panel.
- [x] Chat work queue: tráº¡ng thĂ¡i hoĂ n thĂ nh/há»§y/terminal khĂ´ng xuáº¥t hiá»‡n; tráº¡ng thĂ¡i Ä‘ang xá»­ lĂ½ cáº­p nháº­t realtime.

## Sá»­a lá»—i phĂ¡t sinh 26.05.2026

- [x] XĂ¡c Ä‘á»‹nh `PERMISSION_DENIED` khi lÆ°u khĂ¡ch má»›i Ä‘áº¿n tá»« modal ghi trá»±c tiáº¿p Firestore vĂ  RTDB vá»›i hai boundary quyá»n khĂ¡c nhau.
- [x] ThĂªm API `GET/POST /api/admin/chat/rooms/{roomId}/customer` cĂ³ kiá»ƒm tra `chat_support`.
- [x] Chuyá»ƒn modal profile sang Ä‘á»c/lÆ°u qua API, khĂ´ng cĂ²n ghi Firebase client cho CRM linkage.
- [x] TĂ¡ch tráº¡ng thĂ¡i CRM Ä‘Ă£ lÆ°u khá»i tráº¡ng thĂ¡i room link RTDB; timeout/link failure khĂ´ng lĂ m máº¥t thao tĂ¡c táº¡o khĂ¡ch.
- [x] Kiá»ƒm thá»­ trĂªn `/admin/chat`: lÆ°u khĂ¡ch má»›i, táº£i láº¡i room, vĂ  thá»­ láº¡i khi RTDB role sync hoáº¡t Ä‘á»™ng.

## Má»Ÿ rá»™ng lá»‹ch sá»­ vĂ  tĂ¡c vá»¥ Ä‘ang má»Ÿ 26.05.2026

- [x] Chá»‘t quyá»n: giá»¯ route/RBAC hiá»‡n táº¡i, khĂ´ng cáº¥p thĂªm quyá»n order/repair cho `chat_support`.
- [x] Chá»‘t Ä‘á»‹nh nghÄ©a má»Ÿ: order `Pending|Confirmed|Shipping`; repair/warranty chÆ°a terminal theo workflow.
- [x] Chá»‰ query dá»¯ liá»‡u theo khĂ¡ch/phĂ²ng Ä‘ang má»Ÿ, dĂ¹ng listener realtime trong panel chat.
- [x] TÆ°Æ¡ng thĂ­ch order cÅ© dĂ¹ng `customer.phone` vĂ  repair config cÅ© thiáº¿u terminal flag.
- [x] Cáº­p nháº­t tĂ i liá»‡u/roadmap hiá»‡n cĂ³, khĂ´ng táº¡o tĂ i liá»‡u rá»i.

## Guardrails báº¯t buá»™c

- [x] KhĂ´ng coi webhook verified lĂ  Ä‘Ă£ ghi RTDB thĂ nh cĂ´ng.
- [x] KhĂ´ng má»Ÿ RTDB public Ä‘á»ƒ nĂ© lá»—i role sync/IAM.
- [x] KhĂ´ng táº¡o URL profile Facebook tá»« PSID.
- [x] KhĂ´ng máº¥t attachment payload thĂ nh placeholder.
- [x] KhĂ´ng táº¡o Ä‘Æ¡n hoáº·c cáº­p nháº­t kho trá»±c tiáº¿p trong chat.
- [x] KhĂ´ng dĂ¹ng `startsWith` trong Firebase RTDB Rules; dĂ¹ng `beginsWith`.
- [x] KhĂ´ng ghi Ä‘Ă¨ SPA shell `roadmap_v2` khi cáº­p nháº­t dá»¯ liá»‡u lá»‹ch sá»­.
- [x] KhĂ´ng lÆ°u PII chat vĂ o URL/localStorage hoáº·c raw webhook event dÆ° thá»«a.
- [x] KhĂ´ng gá»i provider API vá»›i access token trong query URL.
- [x] KhĂ´ng query/hiá»ƒn thá»‹ lá»‹ch sá»­ order hoáº·c repair tá»« chat náº¿u user thiáº¿u quyá»n module tÆ°Æ¡ng á»©ng.
- [x] Khong cong khai anh khach gui trong Storage; chi tai private media qua API co `chat_support`.
- [x] Danh rieng namespace Storage `private/` cho Admin SDK; anh `private/chat/` chi doc qua media API co quyen.
- [x] Nut Meta Inbox chi la fallback hoi thoai Page, khong duoc gan nhan la trang ca nhan.
