# Live Chat Integrations

Unified inbox path:

- Web chat writes directly to `chats/{roomId}` in Firebase Realtime Database.
- Facebook Messenger webhook writes inbound messages to `/api/integrations/facebook/webhook`.
- Zalo OA webhook writes inbound messages to `/api/integrations/zalo/webhook`.
- Admin replies to external channels go through `/api/admin/chat/send`.

## Admin web configuration

Preferred path:

1. Open `/admin/settings/integrations`.
2. Paste the Facebook Page / Zalo OA tokens.
3. Copy the generated webhook URLs into Meta Developers and Zalo Developers.
4. Use the test buttons to verify the stored configuration.

Secrets are stored server-side in `private_config/chat_integrations` and are not returned to the browser after saving. Leaving a secret input empty keeps the existing value.

## Environment variables fallback

Facebook:

- `FACEBOOK_WEBHOOK_VERIFY_TOKEN` or `META_WEBHOOK_VERIFY_TOKEN`
- `FACEBOOK_APP_SECRET` or `META_APP_SECRET` for `x-hub-signature-256` verification
- `FACEBOOK_PAGE_ACCESS_TOKEN` or `META_PAGE_ACCESS_TOKEN`
- `FACEBOOK_PAGE_ID` or `META_PAGE_ID`
- `FACEBOOK_GRAPH_VERSION` or `META_GRAPH_VERSION` (default: `v25.0`)

Zalo:

- `ZALO_WEBHOOK_SECRET` or `ZALO_WEBHOOK_TOKEN`
- `ZALO_OA_ACCESS_TOKEN`

## Webhook URLs

Production domain: `https://fixphone.vn`

Use the deployed site URL, not localhost:

- Facebook: `https://fixphone.vn/api/integrations/facebook/webhook`
- Zalo: `https://fixphone.vn/api/integrations/zalo/webhook?secret=<ZALO_WEBHOOK_SECRET>`

In Meta Developers, set the app domain to `fixphone.vn` and use the Facebook webhook URL above as the Messenger callback URL. The verify token must match the value saved in `/admin/settings/integrations`.

Useful Meta app URLs for this site:

- App domain: `fixphone.vn`
- Website URL: `https://fixphone.vn`
- Privacy Policy URL: `https://fixphone.vn/info/chinh-sach-bao-mat`
- Terms of Service URL: `https://fixphone.vn/info/dieu-khoan-dich-vu`
- User Data Deletion URL: `https://fixphone.vn/info/xoa-du-lieu-nguoi-dung`

Every room and message stores `channel`, `source`, and `sourceLabel` so the admin chat can distinguish `Web`, `Zalo`, and `Facebook`.
