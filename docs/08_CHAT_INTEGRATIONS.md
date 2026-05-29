# Live Chat Omnichannel - Web, Facebook va Zalo

## Trang thai trien khai

Cap nhat gan nhat: `27.05.2026`

| Pham vi | Trang thai | Ghi chu |
| :--- | :--- | :--- |
| Hop thu hop nhat Web / Facebook / Zalo tai `/admin/chat` | Da trien khai | Moi phong va tin nhan co `channel`, `source`, `sourceLabel` |
| Cau hinh token tren web tai `/admin/settings/integrations` | Da trien khai | Secret luu server-side, khong tra nguoc ve browser |
| Facebook webhook nhan va phan hoi tin nhan | Da xac minh tren production | Webhook da nhan event va ghi vao RTDB sau khi sua quyen runtime |
| Dong bo ten va avatar Facebook | Da code, can deploy/xac minh | Lay profile qua Graph API khi nhan tin va khi admin mo phong cu |
| Anh, sticker, audio, video va file Facebook | Da nang cap, can deploy/xac minh | Anh moi cache private va tai qua API chat; can deploy `storage.rules` |
| Mo Meta Inbox va tra loi mau | Da code, can deploy/xac minh | Nut mo hoi thoai Facebook fallback; cau hinh `/shortcut` tren web |
| Lien ket CRM va tao phieu sua chua/ban le tu chat | Da code, can deploy/xac minh | Luu `customers/{phone}`; handoff ten/SDT qua `sessionStorage`, khong nam tren URL |
| Lich su khach va tac vu dang mo | Da code, can deploy/xac minh | `/admin/customers` co drawer; `/admin/chat` co panel order/repair theo quyen nghiep vu |
| Bao mat du lieu chat web | Da code, can bat Firebase Anonymous Auth va deploy rules | Room web gan voi UID anonymous; khong con node `guest_` doc/ghi public |
| Zalo OA webhook | Da co code cau hinh | Van phu thuoc OA/API approval va access token cua Zalo |

## Kien truc hien tai

```mermaid
flowchart LR
    Web[Khach chat tren website] --> Anon[Firebase Anonymous Auth]
    Anon --> RTDB[(RTDB chats)]
    FB[Facebook Messenger] --> FBHook[/api/integrations/facebook/webhook]
    Zalo[Zalo OA] --> ZHook[/api/integrations/zalo/webhook]
    FBHook --> RTDB
    FBHook --> PrivateMedia[(Private Facebook image cache)]
    ZHook --> RTDB
    RTDB --> Admin[/admin/chat]
    PrivateMedia --> MediaAPI[/api/admin/chat/rooms/:roomId/media/...]
    MediaAPI --> Admin
    Admin --> Send[/api/admin/chat/send]
    Send --> FB
    Send --> Zalo
    Admin --> CustomerAPI[/api/admin/chat/rooms/:roomId/customer]
    CustomerAPI --> Customer[(Firestore customers)]
    CustomerAPI --> RTDB
    Admin --> Repair[/admin/repairs]
    Admin --> POS[/admin/pos]
```

### Duong dan chinh

- Web chat dang nhap Firebase Anonymous Auth, sau do ghi vao `chats/{uid}` trong Firebase Realtime Database; rules chi cho UID do va staff co `chat_support` truy cap.
- Facebook Messenger goi `POST /api/integrations/facebook/webhook`.
- Zalo OA goi `POST /api/integrations/zalo/webhook`.
- Admin gui tra loi ra kenh ngoai bang `POST /api/admin/chat/send`.
- Admin dong bo lai ho so Facebook cu bang `POST /api/admin/chat/rooms/{roomId}/facebook-profile`.
- Admin tai anh Facebook bang `GET /api/admin/chat/rooms/{roomId}/media/{messageId}/{attachmentIndex}`; route bat buoc `chat_support`.
- Admin chat doc cac cau tra loi mau dang bat bang `GET /api/admin/chat/quick-replies`; quan tri mau tai trang cau hinh.
- Admin doc/luu ho so CRM va lien ket room bang `GET/POST /api/admin/chat/rooms/{roomId}/customer`; route yeu cau `chat_support`.
- Lich su/phiếu dang mo duoc browser doc truc tiep tu Firestore theo mot SDT dang chon va chi khi user co `manage_orders` hoac `manage_repairs`; `chat_support` khong duoc mo rong quyen nghiep vu.

## Cau hinh tren trang quan tri

Duong dan uu tien: `/admin/settings/integrations`.

### Facebook Messenger

Nhap mot lan va co the doi lai tren web:

- Facebook Page ID.
- Page Access Token.
- App Secret.
- Webhook Verify Token.
- Graph API version, hien tai mac dinh `v25.0`.
- Danh sach tra loi mau gom ten mau, `/shortcut` va noi dung gui (toi da 500 ky tu).

Webhook production:

```text
https://fixphone.vn/api/integrations/facebook/webhook
```

Thong tin Meta app cho domain hien tai:

- App domain: `fixphone.vn`
- Website URL: `https://fixphone.vn`
- Privacy Policy URL: `https://fixphone.vn/info/chinh-sach-bao-mat`
- Terms of Service URL: `https://fixphone.vn/info/dieu-khoan-dich-vu`
- User Data Deletion URL: `https://fixphone.vn/info/xoa-du-lieu-nguoi-dung`

Can dang ky Messenger webhook event phu hop cho Page, it nhat la `messages`. Verify Token tren Meta phai trung tuyet doi voi token da luu tren trang cau hinh.

### Zalo Official Account

Nhap:

- OA ID.
- OA Access Token.
- Webhook Secret.

Webhook production:

```text
https://fixphone.vn/api/integrations/zalo/webhook?secret=<ZALO_WEBHOOK_SECRET>
```

Zalo nhan/gui tin OA khong the thay the bang viec nhung Zalo Web dang nhap trong trang admin. Luong chinh thuc can Zalo OA va quyen Official Account API theo chinh sach Zalo tai thoi diem cau hinh.

Endpoint Zalo cung chap nhan header `x-webhook-token`. Neu dashboard/provider cho phep xac thuc bang header hoac chu ky, uu tien cach do de secret khong nam trong URL/log. Neu buoc phai dung `?secret=...`, can doi secret neu URL webhook bi chia se hoac xuat hien trong log khong kiem soat.

### Noi luu secret

- Cau hinh tu giao dien duoc luu server-side tai Firestore document `private_config/chat_integrations`.
- API trang quan tri chi tra ve trang thai da co secret, khong tra ve gia tri token/secret cu.
- Bo trong o secret khi luu se giu gia tri dang co.
- Bien moi truong chi la fallback cho qua trinh chuyen doi/van hanh khan cap, khong phai cach quan ly tai khoan chinh.

Fallback variables:

- `FACEBOOK_WEBHOOK_VERIFY_TOKEN` hoac `META_WEBHOOK_VERIFY_TOKEN`
- `FACEBOOK_APP_SECRET` hoac `META_APP_SECRET`
- `FACEBOOK_PAGE_ACCESS_TOKEN` hoac `META_PAGE_ACCESS_TOKEN`
- `FACEBOOK_PAGE_ID` hoac `META_PAGE_ID`
- `FACEBOOK_GRAPH_VERSION` hoac `META_GRAPH_VERSION`
- `ZALO_WEBHOOK_SECRET` hoac `ZALO_WEBHOOK_TOKEN`
- `ZALO_OA_ACCESS_TOKEN`

## Mo hinh du lieu chat

### RTDB `chats/{roomId}/info`

| Field | Y nghia |
| :--- | :--- |
| `channel`, `source`, `sourceLabel` | Phan biet `web`, `facebook`, `zalo` |
| `externalUserId`, `externalPageId` | Dinh danh nguoi gui/kenh ben ngoai |
| `displayName`, `avatarUrl`, `profileSyncedAt` | Profile Facebook lay tu Graph API hoac ten khach da lien ket |
| `customerId`, `customerName`, `customerPhone`, `phone` | Lien ket den CRM theo SDT |
| `lastMessage`, `lastMessageTime`, `hasUnreadAdmin` | Trang thai inbox |

### RTDB `chats/{roomId}/messages/{messageId}`

- Tin nhan luu `text`, `senderId`, `senderType`, `timestamp` va metadata kenh.
- Tin nhan Facebook co the luu `attachments[]` voi `type` la `image`, `sticker`, `audio`, `video`, `file` hoac `unknown`, kem `url`/`stickerId`; anh cache thanh cong co them `storagePath` va `contentType`.
- Anh Facebook moi duoc ghi RTDB truoc, sau do server tai vao Storage prefix private `private/chat/facebook/`; cach nay khong lam cham viec hien tin text neu CDN Meta loi.
- UI tai anh thong qua API co xac thuc `chat_support`; `storage.rules` danh rieng namespace `private/` cho Admin SDK va chan doc/ghi client, khong cong khai anh khach hang bang download URL Storage.
- Anh cu chua co cache se thu proxy URL Meta con han va tu cache private khi tai thanh cong; neu Meta da het han, nhan vien dung nut `Mo tren Meta Inbox`.

### Meta Inbox va tra loi mau

- Room Facebook co nut mo `Meta Business Suite Inbox` bang Page ID va PSID cua chinh hoi thoai. Day la link van hanh den inbox Page, khong phai link trang ca nhan khach.
- Meta khong cong bo URL deep-link nay nhu mot API on dinh; can xac minh sau deploy, va trong truong hop Meta thay doi giao dien nut van mo Inbox de nhan vien tim hoi thoai.
- `/admin/settings/integrations` yeu cau `manage_settings` va cho phep luu toi da 30 cau tra loi mau server-side; `/admin/chat` cho chen mau bang nut hoac go `/shortcut`, noi dung nhieu dong duoc giu khi gui.
- Chi mau `enabled` duoc tra cho nguoi dung co `chat_support`; moi tin gui van di qua API/rules kenh hien co.

### CRM va nghiep vu tu chat

- Bam avatar trong `/admin/chat` mo ho so khach da luu trong Firestore `customers/{phone}` qua API chat duoc xac thuc.
- Khi co du ten va SDT, API server luu khach truoc, sau do gan ho so vao phong chat; neu RTDB tam loi, UI bao ro ho so da luu nhung room chua duoc lien ket.
- Firestore `customers` chi cho admin hoac staff co `chat_support`, `manage_orders`, `manage_repairs` doc/ghi.
- API ho so chat chi tra cac chi so tong hop theo quyen: `totalOrders`/`totalSpent` can `manage_orders`, `totalRepairs` can `manage_repairs`; `chat_support` don thuan chi nhan profile lien ket.
- `customerName` gioi han 100 ky tu; `displayName` trong RTDB duoc rut gon toi da 50 ky tu de khop validation cua inbox.
- Nut `Tao sua chua` mo `/admin/repairs?source=chat` va doc ten/SDT tu handoff `sessionStorage` dung mot lan; viec tao phieu van theo workflow sua chua chinh.
- Nut `Tao ban le` mo `/admin/pos?source=chat` va doc ten/SDT tu handoff `sessionStorage` dung mot lan; viec ban hang van qua POS de xu ly ton kho va thanh toan dung cach.
- Hai nut tao nghiep vu chi hien khi user co `manage_repairs` hoac `manage_orders` tuong ung; `chat_support` don thuan chi luu/lien ket ho so.
- Khong tao don hang hoac tru kho truc tiep trong chat; dieu nay tranh lap lai loi transaction va sai lech kho.

### Lich su khach va tac vu dang mo

- `/admin/customers`: bam ten khach mo drawer tong quan voi tab `Don hang` va `Sua chua`; moi tab query theo SDT khi drawer mo.
- Tab sua chua chi khoi tao query khi user la admin hoac co `manage_repairs`; khong co quyen thi UI hien thong bao, khong doc Firestore.
- `/admin/chat`: panel ben phai chi tai tac vu khi room da co `customerPhone`/`phone`; room chua lien ket yeu cau nhap ho so truoc.
- Order dang mo gom `Pending`, `Confirmed`, `Shipping`.
- Repair/warranty dang mo la phiếu co status khong terminal trong `system_config/repairs`; co fallback cho du lieu legacy `done`, `out`, `refund`, `bh_hoan_tat`, `bh_tu_choi`, `bh_refund`.
- Link noi bo dung `/admin/orders?orderId=<id>` va `/admin/repairs?ticketId=<id>` de mo modal chi tiet hien co. Link chi xuat hien voi nhom du lieu user duoc quyen doc.
- Modal don hang mo tu deep-link van dung du lieu don da tai de cap nhat trang thai, ke ca khi don nam ngoai 50 dong moi nhat cua danh sach.
- Khong them Firebase Admin API va khong noi `firestore.rules` cho `chat_support` trong tinh nang lich su; quyet dinh nay giu boundary RBAC nghiep vu.

## Lich su trien khai va su co da gap

### 23-25.05.2026 - Unified Inbox va cau hinh kenh

- Them inbox Web/Facebook/Zalo tai `/admin/chat`.
- Them trang cau hinh kenh va secret server-side tai `/admin/settings/integrations`.
- Them webhook Facebook/Zalo, gui tra loi ra kenh ngoai, badge nhan biet nguon tin.
- Them public privacy/terms/data deletion URL can cho Meta app.

### 24-25.05.2026 - Facebook webhook nhan event nhung khong hien trong chat

Trieu chung:

- Meta webhook da gui duoc message; Cloud Run logs thay body va text.
- Ghi RTDB bi timeout: `External chat message write timed out after 8000ms`.
- Log Firebase bao authentication credentials cua app admin khong hop le/khong du quyen.

Nguyen nhan:

- SSR tren Firebase Hosting chay bang Cloud Run/Functions runtime identity, khong phai mac dinh service account dang duoc xem tren console hoac credentials local.
- Runtime identity thuc te chua co quyen Firebase Realtime Database Admin.

Cach xu ly da dung:

- Cap quyen RTDB phu hop cho service account dang chay function.
- Kiem tra lai webhook: event den va tin nhan duoc ghi RTDB.

### 25.05.2026 - Admin chat khong doc duoc RTDB

Trieu chung:

- `/admin/chat` xoay loading hoac bao `RTDB role sync failed`.
- Local co thong bao Firebase Admin credentials chua cau hinh; production co the bao `PERMISSION_DENIED`.

Nguyen nhan:

- Client chi duoc doc `chats` neu `admin_roles/{uid}` trong RTDB da duoc backend dong bo.
- Dong bo role phu thuoc Firebase Admin credentials/IAM cua moi truong chay.

Quyet dinh:

- Giu co che role sync server-side va fail closed khi khong dong bo duoc.
- Khong mo rong RTDB rules thanh doc public de ne loi cau hinh.

### 25.05.2026 - Ten, avatar va attachment Facebook

Trieu chung:

- Phong chat chi hien `Facebook xxxxxx`.
- Sticker/anh chi hien placeholder text.

Cach khac phuc:

- Goi Graph API de lay `first_name`, `last_name`, `profile_pic`.
- Them endpoint dong bo lai phong cu khi admin mo hoi thoai.
- Luu attachment payload co cau truc va render media trong giao dien.
- Mo rong CSP cho Facebook CDN.

Gioi han:

- `externalUserId`/PSID cua Messenger khong phai URL profile ca nhan cong khai. Khong tao link gia den trang Facebook cua khach.

### 25.05.2026 - Hardening du lieu nguoi dung va RBAC

Van de phat hien:

- RTDB cho phep doc/ghi cong khai cac room co prefix `guest_`, trong khi room co the chua ten va SDT.
- Hai API chat server chi kiem tra vai tro `staff`, khong kiem tra quyen `chat_support`.
- Luong chat sang POS/Repair dua ten va SDT vao query string.
- Webhook luu lai `rawLastEvent` du thua trong RTDB; rules `customers` cho moi staff doc/ghi.

Cach khac phuc:

- Chuyen web chat sang Firebase Anonymous Auth va khoa quyen public theo prefix `guest_`.
- Bat buoc `chat_support` o API gui tin va dong bo profile Facebook.
- Chuyen handoff CRM sang `sessionStorage` dung mot lan; URL chi con `source=chat`.
- Dung luu raw webhook event; gioi han `customers` theo quyen nghiep vu.
- Gui Facebook Page Access Token trong header `Authorization`, khong dua token vao Graph API URL.

### 26.05.2026 - Luu CRM tu chat bao `PERMISSION_DENIED`

Trieu chung:

- Bam luu khach trong modal chat bao `PERMISSION_DENIED: Permission denied`.
- Thao tac client phai ghi ca Firestore `customers/{phone}` va RTDB `chats/{roomId}/info`.

Nguyen nhan:

- Modal ghi truc tiep tu browser vao hai database co co che phan quyen rieng.
- RTDB can `admin_roles/{uid}` da dong bo; khi role sync/credential tam loi, buoc lien ket room bi tu choi va UI coi nhu toan bo viec luu that bai.

Cach khac phuc:

- Chuyen doc/luu CRM sang API `GET/POST /api/admin/chat/rooms/{roomId}/customer`, bat buoc `chat_support`.
- API dung Firebase Admin de ghi Firestore va lien ket RTDB; buoc lien ket co timeout.
- Neu chi lien ket RTDB loi, API van xac nhan CRM da luu va UI hien canh bao de admin thu lien ket lai, khong bat nhap lai khach.

### 26.05.2026 - Lich su CRM va tac vu tu chat

- Them drawer chi tiet tai `/admin/customers` de tra cuu don hang va sua chua theo SDT.
- Them panel tac vu realtime tai `/admin/chat`, co giao dien drawer tren man hinh nho.
- Deep-link den modal san co cua orders/repairs thay vi tao luong xu ly rut gon.
- Truy van duoc gate rieng boi `manage_orders` va `manage_repairs`; staff chi co `chat_support` khong doc du lieu nghiep vu va khong phat sinh `PERMISSION_DENIED`.

### 27.05.2026 - Anh Facebook, Meta Inbox va tra loi mau

- Thay render URL Meta truc tiep bang cache anh private va API tai anh co quyen `chat_support`; khoa namespace `private/` trong Storage Rules.
- Ghi tin nhan RTDB truoc khi thu cache anh de CDN loi khong chan tin text.
- Them nut mo hoi thoai trong Meta Business Suite Inbox lam fallback xem media/thong tin provider.
- Them cau hinh tra loi mau va `/shortcut` tai trang tich hop.

Dieu kien van hanh moi:

- Truoc khi deploy rules moi, bat `Firebase Authentication > Sign-in method > Anonymous`.
- Room web `guest_` cu khong con duoc khach doc sau khi khoa rules; admin van co the tra cuu neu co quyen chat.
- Cac field `rawLastEvent` da ton tai tu phien ban cu khong tu bi xoa; can lap ke hoach xoa mot lan neu muon giam du lieu luu tru lich su.

## Nguyen tac khong lap lai loi

1. Khong danh gia webhook hoat dong chi dua vao viec Meta verify URL hoac log da nhan payload; bat buoc xac minh du lieu da ghi vao RTDB va admin doc duoc.
2. Khong gan quyen Firebase theo suy doan service account; phai xac dinh runtime identity cua Cloud Function/Cloud Run dang xu ly webhook.
3. Khong mo RTDB thanh public de giai quyet loi quyen admin; giu `admin_roles` va sua credentials/IAM dung nguon.
4. Khong hardcode token kenh vao UI hoac chi vao `.env`; secret chinh phai thay doi duoc qua `private_config/chat_integrations`.
5. Khong coi Messenger PSID la link trang ca nhan Facebook.
6. Khong bien media thanh placeholder vinh vien; luu payload co cau truc va cap nhat CSP khi render tai admin.
7. Khong tao don hang, cap nhat ton kho hoac tao phieu sua chua rut gon truc tiep trong chat; chuyen sang workflow POS/Repair da co transaction va validation.
8. Firebase RTDB Rules dung `beginsWith`, khong dung JavaScript `startsWith`.
9. Moi thay doi lien quan route/server Firebase phai chay `npm.cmd run typecheck` va `npm.cmd run build`, khong chi dung lint.
10. Khong luu PII cua khach chat vao URL hoac `localStorage`; web chat phai co Firebase identity truoc khi doc/ghi RTDB.
11. Khong dung route UI de thay cho authorization o API; moi API chat thao tac Admin SDK phai kiem tra `chat_support`.
12. Khong dua provider access token vao query URL cua request outbound; dung authorization header.
13. Khong ghi CRM va RTDB linkage truc tiep tu modal chat; cac thao tac nay phai di qua API co kiem tra `chat_support` va xu ly trang thai luu mot phan.
14. Khong luu anh khach gui vao Storage public; media cache private phai duoc doc qua API co quyen chat.
15. Khong hieu nut Meta Inbox la URL profile ca nhan; day chi la fallback van hanh cua Page.

## Checklist deploy va xac minh

1. Bat Firebase Authentication provider `Anonymous` cho project production.
2. Deploy SSR Hosting/Functions, Firestore Rules, Realtime Database Rules va Storage Rules cung phien ban.
3. Tai `/admin/settings/integrations`, xac minh cau hinh Facebook/Zalo van o trang thai da luu.
4. Mo website bang cua so an danh, chat web va xac minh khach gui/nhan duoc tin sau khi room moi duoc tao.
5. Tren Facebook, gui text moi, anh va sticker tu mot tai khoan khac vao Page.
6. Mo `/admin/chat`, xac minh:
   - Phong co badge Facebook.
   - Ten/avatar hien dung hoac co log Graph API neu Meta khong cap profile.
   - Anh/sticker hien trong bubble, khong bi CSP block.
   - Anh moi co the mo lai sau reload; neu proxy/cache loi thi nut `Mo tren Meta Inbox` mo dung inbox Page.
   - Tin tra loi tu admin di nguoc lai Messenger.
7. Bam avatar, nhap ten/SDT, luu ho so va thu hai nut `Tao sua chua`, `Tao ban le`; URL khong chua ten/SDT.
8. Tam thoi chan RTDB role sync hoac dung moi truong local chua truy cap duoc RTDB; xac minh CRM van luu va UI bao room chua lien ket thay vi bao mat du lieu.
9. Neu Zalo duoc phe duyet OA API, lap lai quy trinh nhan/gui voi webhook Zalo.
10. Tao hai cau tra loi mau tai trang tich hop, thu chen bang nut va `/shortcut`, gui tren Web va Facebook.
