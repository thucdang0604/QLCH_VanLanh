# Plan: Live Chat Omnichannel - Facebook, Zalo, CRM vĂ  Chuyá»ƒn Ä‘á»•i Ä‘Æ¡n hĂ ng

**ID**: `plan-live-chat-omnichannel-v2`  
**Cáº­p nháº­t**: 26.05.2026  
**NhĂ¡nh**: `codex/chat-enhancements`  
**Checkpoint ná»n**: `4d3c6fbd feat: add unified external chat integrations`  
**Tráº¡ng thĂ¡i**: in-progress - tĂ­nh nÄƒng vĂ  hardening Ä‘Ă£ build qua, chá» deploy Ä‘á»“ng bá»™ code/rules vĂ  kiá»ƒm thá»­ production

## Má»¥c tiĂªu

Biáº¿n `/admin/chat` thĂ nh há»™p thÆ° váº­n hĂ nh thá»±c táº¿ cho ba nguá»“n `Web`, `Facebook` vĂ  `Zalo`, Ä‘á»“ng thá»i ná»‘i há»™i thoáº¡i vá»›i CRM vĂ  quy trĂ¬nh bĂ¡n hĂ ng/sá»­a chá»¯a hiá»‡n há»¯u.

## Pháº¡m vi Ä‘Ă£ triá»ƒn khai á»Ÿ checkpoint ná»n

1. Inbox há»£p nháº¥t, phĂ¢n biá»‡t nguá»“n báº±ng `channel`, `source`, `sourceLabel`.
2. Trang `/admin/settings/integrations` Ä‘á»ƒ quáº£n trá»‹ Facebook Page vĂ  Zalo OA trá»±c tiáº¿p trĂªn web.
3. LÆ°u secret trong `private_config/chat_integrations`, chá»‰ tráº£ tráº¡ng thĂ¡i Ä‘Ă£ cáº¥u hĂ¬nh.
4. Webhook Facebook/Zalo vĂ  API gá»­i tráº£ lá»i ra kĂªnh ngoĂ i.
5. RTDB role sync cho admin/staff cĂ³ quyá»n `chat_support`.
6. URL chĂ­nh sĂ¡ch quyá»n riĂªng tÆ°, Ä‘iá»u khoáº£n, xĂ³a dá»¯ liá»‡u phá»¥c vá»¥ táº¡o Meta app.

## Pháº¡m vi nĂ¢ng cáº¥p hiá»‡n táº¡i

### 1. Há»“ sÆ¡ khĂ¡ch hĂ ng ngay trong chat

- Báº¥m avatar phĂ²ng hoáº·c avatar Ä‘áº§u há»™i thoáº¡i má»Ÿ `ChatCustomerProfileModal`.
- Tra cá»©u/lÆ°u khĂ¡ch theo `customers/{phone}`.
- Ghi liĂªn káº¿t vá» RTDB room info: `customerId`, `customerName`, `customerPhone`, `phone`.
- Khi Ä‘Ă£ liĂªn káº¿t CRM, tĂªn hiá»ƒn thá»‹ Æ°u tiĂªn tĂªn khĂ¡ch Ä‘Ă£ lÆ°u.
- Modal giá»›i háº¡n tĂªn CRM tá»‘i Ä‘a 100 kĂ½ tá»± vĂ  rĂºt gá»n `displayName` cĂ²n tá»‘i Ä‘a 50 kĂ½ tá»± Ä‘á»ƒ khá»›p RTDB validation.

### 2. TĂªn vĂ  avatar Facebook tháº­t

- Webhook gá»i Graph API báº±ng Page Access Token Ä‘á»ƒ láº¥y `first_name`, `last_name`, `profile_pic`.
- PhĂ²ng cÅ© cĂ²n tĂªn táº¡m Ä‘Æ°á»£c lĂ m má»›i khi admin má»Ÿ há»™i thoáº¡i qua API:
  `POST /api/admin/chat/rooms/{roomId}/facebook-profile`.
- LÆ°u `profileSyncedAt` Ä‘á»ƒ ghi nháº­n thá»i Ä‘iá»ƒm cáº­p nháº­t profile.

Giá»›i háº¡n báº¯t buá»™c:

- PSID/Messenger `externalUserId` khĂ´ng pháº£i URL há»“ sÆ¡ Facebook cĂ´ng khai.
- KhĂ´ng hiá»ƒn thá»‹ link trang cĂ¡ nhĂ¢n náº¿u Meta khĂ´ng cung cáº¥p URL Ä‘Ă¡ng tin cáº­y.

### 3. Media Facebook

- Parse vĂ  lÆ°u tá»‘i Ä‘a 5 attachment/tin nháº¯n gá»“m `image`, `sticker`, `audio`, `video`, `file`, `unknown`.
- Ghi message vao RTDB truoc; voi `image`, thu cache server-side vao Storage private sau do cap nhat attachment.
- Render anh qua endpoint co `chat_support`; `storage.rules` danh rieng namespace `private/` cho Admin SDK, khong mo download URL Storage public cho PII hinh anh.
- Neu anh cu/Meta URL khong con tai duoc, cung cap nut mo Meta Business Suite Inbox lam fallback.
- Cho phĂ©p CDN Facebook trong CSP: `*.fbcdn.net`, `*.fbsbx.com`.
- Má»Ÿ rá»™ng RTDB validation cho `messages.attachments`.

### 3.1. Meta Inbox va tra loi mau

- Room Facebook tao nut mo inbox Page tu `externalPageId` va `externalUserId`; PSID chi duoc dung de chon conversation, khong bien thanh URL profile.
- `private_config/chat_integrations.quickReplies[]` luu toi da 30 mau tra loi, text toi da 500 ky tu.
- Admin cau hinh mau tai `/admin/settings/integrations`; staff co `chat_support` chen mau tu `/admin/chat` bang nut hoac `/shortcut`.

### 4. Tá»« chat sang CRM, sá»­a chá»¯a vĂ  POS

- Khi cĂ³ Ä‘á»§ tĂªn vĂ  sá»‘ Ä‘iá»‡n thoáº¡i, admin lÆ°u khĂ¡ch vĂ o Firestore ngay trong modal.
- `Táº¡o sá»­a chá»¯a`: lÆ°u handoff má»™t láº§n trong `sessionStorage`, má»Ÿ `/admin/repairs?source=chat` vĂ  prefill form; táº¡o phiáº¿u qua flow sá»­a chá»¯a chĂ­nh thá»©c.
- `Táº¡o bĂ¡n láº»`: lÆ°u handoff má»™t láº§n trong `sessionStorage`, má»Ÿ `/admin/pos?source=chat` vĂ  prefill thĂ´ng tin; thanh toĂ¡n qua flow POS chĂ­nh thá»©c.
- Táº¡o repair má»›i gá»i `upsertCustomerRecord` trong transaction Ä‘á»ƒ cáº­p nháº­t thá»‘ng kĂª CRM.
- KhĂ´ng Ä‘Æ°a tĂªn hoáº·c sá»‘ Ä‘iá»‡n thoáº¡i khĂ¡ch vĂ o URL/history/referrer.

### 5. Hardening dá»¯ liá»‡u khĂ¡ch hĂ ng vĂ  quyá»n chat

- Web chat sá»­ dá»¥ng Firebase Anonymous Auth; room má»›i gáº¯n vá»›i UID xĂ¡c thá»±c thay vĂ¬ má»Ÿ quyá»n public theo prefix `guest_`.
- API gá»­i tin vĂ  API refresh profile Facebook báº¯t buá»™c quyá»n `chat_support`, khĂ´ng chá»‰ kiá»ƒm tra vai trĂ² staff.
- Collection `customers/{phone}` chá»‰ cho quyá»n nghiá»‡p vá»¥ cáº§n CRM/chat thay vĂ¬ má»i staff.
- Facebook Page Access Token Ä‘i qua header `Authorization: Bearer`, khĂ´ng xuáº¥t hiá»‡n trong Graph API URL.
- Bá» lÆ°u `rawEvent/rawLastEvent` má»›i trong RTDB; dá»¯ liá»‡u lá»‹ch sá»­ cÅ© cáº§n cleanup má»™t láº§n náº¿u muá»‘n giáº£m retention.
- Zalo webhook Æ°u tiĂªn `x-webhook-token`/signature náº¿u cáº¥u hĂ¬nh provider há»— trá»£; URL query secret chá»‰ dĂ¹ng khi báº¯t buá»™c.

### 6. Lá»‹ch sá»­ khĂ¡ch hĂ ng vĂ  tĂ¡c vá»¥ Ä‘ang má»Ÿ

- `/admin/customers` má»Ÿ `CustomerDetailDrawer` khi báº¥m tĂªn khĂ¡ch, táº£i lá»‹ch sá»­ Ä‘Æ¡n hĂ ng vĂ  sá»­a chá»¯a theo sá»‘ Ä‘iá»‡n thoáº¡i cá»§a khĂ¡ch Ä‘ang xem.
- `/admin/chat` cĂ³ panel tĂ¡c vá»¥ bĂªn pháº£i trĂªn desktop vĂ  drawer trĂªn mĂ n hĂ¬nh nhá»; chá»‰ táº£i dá»¯ liá»‡u khi room Ä‘Ă£ liĂªn káº¿t sá»‘ Ä‘iá»‡n thoáº¡i.
- ÄÆ¡n hĂ ng Ä‘ang má»Ÿ gá»“m `Pending`, `Confirmed`, `Shipping`; phiáº¿u sá»­a chá»¯a/báº£o hĂ nh Ä‘ang má»Ÿ dá»±a trĂªn `isTerminal` cá»§a workflow.
- Dá»¯ liá»‡u workflow cÅ© thiáº¿u cá» terminal Ä‘Æ°á»£c báº£o vá»‡ báº±ng fallback cho `done`, `out`, `refund`, `bh_hoan_tat`, `bh_tu_choi`, `bh_refund`; cáº¥u hĂ¬nh máº·c Ä‘á»‹nh má»›i Ä‘Ă¡nh dáº¥u `done` lĂ  terminal.
- Deep-link ná»™i bá»™ `/admin/orders?orderId=<id>` vĂ  `/admin/repairs?ticketId=<id>` má»Ÿ modal chi tiáº¿t sáºµn cĂ³, khĂ´ng táº¡o flow giao dá»‹ch riĂªng trong chat.
- RBAC giá»¯ nguyĂªn: `manage_orders` má»›i Ä‘á»c/Ä‘i Ä‘áº¿n orders, `manage_repairs` má»›i Ä‘á»c/Ä‘i Ä‘áº¿n repairs; tĂ i khoáº£n chá»‰ cĂ³ `chat_support` khĂ´ng khá»Ÿi táº¡o cĂ¡c query nĂ y.
- Lá»‹ch sá»­ dĂ¹ng Firebase client dÆ°á»›i rules hiá»‡n hĂ nh, khĂ´ng thĂªm Admin API hoáº·c ná»›i rules cho tĂ­nh nÄƒng chat.

## Data model bá»• sung

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

- `private_config/chat_integrations`: token/secret cá»§a Facebook/Zalo va `quickReplies[]`.
- `customers/{phone}`: há»“ sÆ¡ CRM Ä‘Æ°á»£c liĂªn káº¿t tá»« há»™i thoáº¡i.

## CĂ¡c sá»± cá»‘ Ä‘Ă£ gáº·p vĂ  káº¿t luáº­n ká»¹ thuáº­t

| Sá»± cá»‘ | NguyĂªn nhĂ¢n thá»±c táº¿ | Quyáº¿t Ä‘á»‹nh giá»¯ láº¡i |
| :--- | :--- | :--- |
| Meta nháº­n webhook nhÆ°ng chat khĂ´ng cĂ³ tin má»›i | Function nháº­n payload nhÆ°ng Firebase Admin ghi RTDB timeout do runtime service account thiáº¿u quyá»n/credential khĂ´ng há»£p lá»‡ | LuĂ´n kiá»ƒm tra write RTDB sau webhook; cáº¥p quyá»n cho Ä‘Ăºng Cloud Run/Functions runtime identity |
| `/admin/chat` loading hoáº·c `RTDB role sync failed` | Client bá»‹ RTDB rules cháº·n khi backend khĂ´ng ghi Ä‘Æ°á»£c `admin_roles/{uid}` | Role sync server-side pháº£i fail closed; khĂ´ng má»Ÿ quyá»n Ä‘á»c public |
| PhĂ²ng Facebook chá»‰ hiá»‡n tĂªn táº¡m | Webhook trÆ°á»›c Ä‘Ă¢y chÆ°a láº¥y Graph profile hoáº·c room cÅ© chÆ°a Ä‘Æ°á»£c cáº­p nháº­t | Lookup profile khi nháº­n tin vĂ  endpoint refresh room cÅ© |
| Anh Facebook khong hien/on dinh | URL media Meta tam thoi hoac browser bi chan tai CDN | Cache anh private + authenticated media endpoint; Inbox fallback khi nguon cu het han |
| Mong muá»‘n link trang cĂ¡ nhĂ¢n Facebook | PSID lĂ  Page-scoped ID, khĂ´ng pháº£i public profile link | KhĂ´ng tá»± dá»±ng URL sai |
| Muá»‘n táº¡o Ä‘Æ¡n ngay trong chat | Táº¡o táº¯t sáº½ bá» qua kiá»ƒm soĂ¡t tá»“n kho/thanh toĂ¡n/workflow sá»­a chá»¯a | Chuyá»ƒn dá»¯ liá»‡u sang POS/Repair hiá»‡n há»¯u vĂ  Ä‘á»“ng bá»™ CRM |
| Deploy RTDB Rules lá»—i `startsWith` | Rules language khĂ´ng há»— trá»£ JavaScript `startsWith` | Chá»‰ dĂ¹ng `beginsWith` trong `database.rules.json` |
| RTDB room `guest_` Ä‘á»c/ghi public | Room cĂ³ thá»ƒ chá»©a tin nháº¯n, tĂªn vĂ  sá»‘ Ä‘iá»‡n thoáº¡i khĂ¡ch | DĂ¹ng Firebase Anonymous Auth; khĂ³a quyá»n theo UID |
| Staff khĂ´ng cĂ³ quyá»n chat váº«n gá»i Ä‘Æ°á»£c API privileged | API dĂ¹ng Admin SDK nhÆ°ng chá»‰ kiá»ƒm tra vai trĂ² | Báº¯t buá»™c `chat_support` táº¡i API server |
| Handoff CRM Ä‘áº·t PII trong URL | Query string lÆ°u vĂ o history/log/referrer | Chuyá»ƒn sang `sessionStorage` dĂ¹ng má»™t láº§n |
| Facebook token cĂ³ trong URL outbound | Token cĂ³ thá»ƒ Ä‘i vĂ o log cá»§a háº¡ táº§ng/provider | DĂ¹ng header `Authorization` |

## NguyĂªn táº¯c triá»ƒn khai vá» sau

1. Secret kĂªnh Ä‘Æ°á»£c thay Ä‘á»•i qua web vĂ  lÆ°u server-side; env chá»‰ lĂ  fallback.
2. Má»i webhook cáº§n xĂ¡c minh ba Ä‘iá»ƒm riĂªng: callback verify, event nháº­n Ä‘Æ°á»£c, dá»¯ liá»‡u hiá»ƒn thá»‹ tá»« RTDB.
3. Má»i thay Ä‘á»•i Firebase Admin/SSR cáº§n kiá»ƒm tra Ä‘Ăºng runtime IAM, khĂ´ng suy diá»…n tá»« service account cĂ³ tĂªn `firebase-adminsdk`.
4. Media ngoĂ i domain pháº£i Ä‘i kĂ¨m cáº­p nháº­t CSP vĂ  validation dá»¯ liá»‡u.
5. Luá»“ng phĂ¡t sinh tiá»n/tá»“n kho khĂ´ng Ä‘Æ°á»£c táº¡o rĂºt gá»n á»Ÿ chat; tĂ¡i sá»­ dá»¥ng POS/Repair transaction hiá»‡n cĂ³.
6. Cháº¡y `npm.cmd run typecheck` vĂ  `npm.cmd run build` trÆ°á»›c deploy; cáº£nh bĂ¡o khĂ´ng cháº·n pháº£i Ä‘Æ°á»£c ghi rĂµ, khĂ´ng bá»‹ hiá»ƒu nháº§m lĂ  test chÆ°a cháº¡y.
7. KhĂ´ng cháº¡y cĂ´ng cá»¥ Ä‘á»“ng bá»™ lĂ m ghi Ä‘Ă¨ SPA shell cá»§a `roadmap_v2`; cáº­p nháº­t data/AI plan theo hÆ°á»›ng data-first.
8. KhĂ´ng Ä‘Æ°a PII vĂ o URL/localStorage; handoff nghiá»‡p vá»¥ dĂ¹ng dá»¯ liá»‡u táº¡m theo tab vĂ  tiĂªu thá»¥ má»™t láº§n.
9. KhĂ´ng cho client hoáº·c API truy cáº­p chat/CRM chá»‰ dá»±a trĂªn route UI; rules vĂ  API Ä‘á»u pháº£i kiá»ƒm tra quyá»n.

## Files Ä‘Ă£ sá»­a trong nhĂ¡nh nĂ¢ng cáº¥p

| File | Vai trĂ² |
| :--- | :--- |
| `src/app/admin/chat/page.tsx` | Modal profile, media rendering, refresh profile, CRM display name |
| `src/components/admin/chat/ChatCustomerProfileModal.tsx` | LÆ°u/xem CRM vĂ  chuyá»ƒn workflow |
| `src/lib/chatServer.ts` | Facebook Graph profile, attachment persistence, room refresh |
| `src/app/api/integrations/facebook/webhook/route.ts` | Parse text/media vĂ  láº¥y profile |
| `src/app/api/admin/chat/rooms/[roomId]/facebook-profile/route.ts` | LĂ m má»›i profile phĂ²ng cÅ© |
| `src/app/api/admin/chat/rooms/[roomId]/media/[messageId]/[attachmentIndex]/route.ts` | Doc anh Facebook private co `chat_support` |
| `src/app/api/admin/chat/quick-replies/route.ts` | Doc mau tra loi dang bat cho nhan vien chat |
| `src/lib/realtimedb.ts`, `database.rules.json` | Schema/validation má»›i |
| `src/app/admin/repairs/page.tsx`, `src/app/admin/pos/page.tsx` | Prefill tá»« chat vĂ  CRM sync |
| `next.config.mjs`, `firebase.json` | CSP cho Facebook media |
| `src/lib/chatWorkflowHandoff.ts` | Handoff CRM sang POS/Repair khĂ´ng dĂ¹ng URL chá»©a PII |
| `src/lib/useCustomerActivity.ts` | Realtime query lá»‹ch sá»­ theo SDT, lá»c tĂ¡c vá»¥ má»Ÿ vĂ  fallback terminal legacy |
| `src/components/admin/customers/CustomerDetailDrawer.tsx` | Drawer lá»‹ch sá»­ Ä‘Æ¡n/sá»­a chá»¯a táº¡i CRM |
| `src/components/admin/chat/ChatCustomerActivityPanel.tsx` | Panel tĂ¡c vá»¥ Ä‘ang má»Ÿ theo quyá»n module |
| `src/app/admin/orders/page.tsx`, `src/app/admin/repairs/page.tsx` | Deep-link má»Ÿ modal chi tiáº¿t hiá»‡n há»¯u |
| `src/app/admin/settings/repairs/page.tsx` | Cáº¥u hĂ¬nh máº·c Ä‘á»‹nh `done` lĂ  terminal |
| `src/lib/apiAuth.ts`, `firestore.rules` | Permission gate cho API chat vĂ  CRM |
| `src/components/ChatWidget.tsx` | Firebase Anonymous Auth cho room chat web |
| `.codex-security-scans/working-tree_20260525_chat-data/` | Scan artifacts vĂ  bĂ¡o cĂ¡o kháº¯c phá»¥c táº­p trung |

## Cáº­p nháº­t 26.05.2026 - Sá»­a lá»—i lÆ°u CRM tá»« chat

- PhĂ¡t hiá»‡n modal chat ghi trá»±c tiáº¿p Firestore `customers/{phone}` vĂ  RTDB room info tá»« browser, nĂªn RTDB role sync lá»—i sáº½ lĂ m UI bĂ¡o `PERMISSION_DENIED` khi lÆ°u khĂ¡ch má»›i.
- ThĂªm API báº£o vá»‡ bá»Ÿi quyá»n `chat_support`: `GET/POST /api/admin/chat/rooms/{roomId}/customer`.
- Modal chá»‰ gá»i API báº±ng bearer token; khĂ´ng cĂ²n tá»± ghi Firestore/RTDB trong trĂ¬nh duyá»‡t.
- Server Æ°u tiĂªn lÆ°u há»“ sÆ¡ CRM, sau Ä‘Ă³ liĂªn káº¿t room vá»›i timeout. Náº¿u RTDB táº¡m khĂ´ng kháº£ dá»¥ng, admin Ä‘Æ°á»£c thĂ´ng bĂ¡o CRM Ä‘Ă£ lÆ°u nhÆ°ng liĂªn káº¿t room cáº§n thá»­ láº¡i.
- API khĂ´ng tráº£ chi tiáº¿t lá»—i Firebase ná»™i bá»™ cho browser; lá»—i 500 Ä‘Æ°á»£c log á»Ÿ server vĂ  pháº£n há»“i tá»•ng quĂ¡t.
- Guardrail má»›i: khĂ´ng triá»ƒn khai láº¡i kiá»ƒu ghi tĂ¡ch rá»i client-side cho luá»“ng CRM tá»« chat.

## Cáº­p nháº­t 26.05.2026 - Lá»‹ch sá»­ CRM vĂ  hĂ ng Ä‘á»£i xá»­ lĂ½

- ThĂªm drawer lá»‹ch sá»­ táº¡i `/admin/customers` vĂ  panel tĂ¡c vá»¥ realtime táº¡i `/admin/chat`.
- Má»—i truy váº¥n Ä‘Æ°á»£c kĂ­ch hoáº¡t theo khĂ¡ch/phĂ²ng hiá»‡n táº¡i, khĂ´ng subscribe lá»‹ch sá»­ cá»§a toĂ n bá»™ khĂ¡ch hĂ ng.
- Panel vĂ  drawer khĂ´ng Ä‘á»c collection nghiá»‡p vá»¥ náº¿u user thiáº¿u quyá»n tÆ°Æ¡ng á»©ng, trĂ¡nh tĂ¡i diá»…n lá»—i phĂ¢n quyá»n client.
- Link tá»« lá»‹ch sá»­/tĂ¡c vá»¥ Ä‘i vĂ o modal orders/repairs hiá»‡n há»¯u báº±ng query param, giá»¯ toĂ n bá»™ kiá»ƒm tra quyá»n vĂ  workflow táº¡i trang nghiá»‡p vá»¥.
- Giá»¯ pháº¡m vi hiá»‡n táº¡i á»Ÿ mua hĂ ng vĂ  sá»­a chá»¯a; appointments/tags/tier váº«n thuá»™c CRM má»Ÿ rá»™ng vá» sau.

## Verification

ÄĂ£ cháº¡y cá»¥c bá»™:

- `npm.cmd run typecheck` - pass.
- `npm.cmd run build` - pass; cĂ²n cáº£nh bĂ¡o `console` hiá»‡n há»¯u vĂ  trace `protobufjs` khĂ´ng cháº·n build.
- JSON parse/check cho `database.rules.json` vĂ  kiá»ƒm tra whitespace diff - pass.

Cáº§n thá»±c hiá»‡n sau deploy:

1. Nháº¯n Facebook text má»›i, sticker vĂ  áº£nh; xĂ¡c minh tĂªn/avatar/media trĂªn production admin chat.
2. Tráº£ lá»i ngÆ°á»£c tá»« admin chat vá» Facebook.
3. Má»Ÿ room cÅ© hiá»‡n tĂªn táº¡m Ä‘á»ƒ kiá»ƒm tra endpoint refresh.
4. LÆ°u CRM tá»« avatar, táº¡o thá»­ repair/POS vĂ  xĂ¡c nháº­n URL chá»‰ cĂ³ `source=chat`, khĂ´ng cĂ³ PII.
5. TrÆ°á»›c khi Ă¡p dá»¥ng RTDB rules má»›i, báº­t Firebase Authentication provider `Anonymous`; kiá»ƒm thá»­ chat web trong cá»­a sá»• áº©n danh.
6. Kiá»ƒm thá»­ Zalo khi OA/API Ä‘Ă£ Ä‘Æ°á»£c duyá»‡t vĂ  token há»£p lá»‡.
7. Má»Ÿ drawer khĂ¡ch cĂ³ cáº£ order/repair, kiá»ƒm tra quyá»n tá»«ng tab vĂ  deep-link modal.
8. Chá»n room Ä‘Ă£ liĂªn káº¿t SÄT; kiá»ƒm tra panel chá»‰ hiá»‡n phiáº¿u chÆ°a Ä‘Ă³ng vĂ  tĂ i khoáº£n chá»‰ cĂ³ `chat_support` khĂ´ng query nghiá»‡p vá»¥.
