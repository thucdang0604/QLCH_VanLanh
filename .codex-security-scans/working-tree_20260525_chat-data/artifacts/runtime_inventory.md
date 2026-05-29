# Runtime Inventory

Scan target: uncommitted live-chat enhancement patch plus immediate authorization and data-flow siblings.

| Surface | Runtime files | Sensitive operation |
| --- | --- | --- |
| Web guest chat | `src/components/ChatWidget.tsx`, `src/lib/realtimedb.ts`, `database.rules.json` | Customer metadata and realtime messages |
| Admin chat UI | `src/app/admin/chat/page.tsx`, `src/components/admin/chat/ChatCustomerProfileModal.tsx` | Read chat, link customer, open POS/repair |
| Chat server API | `src/app/api/admin/chat/send/route.ts`, `src/app/api/admin/chat/rooms/[roomId]/facebook-profile/route.ts`, `src/lib/chatServer.ts` | Send provider message, fetch profile, update RTDB |
| Provider ingress | `src/app/api/integrations/facebook/webhook/route.ts`, `src/app/api/integrations/zalo/webhook/route.ts` | Accept external user payload and media metadata |
| CRM workflows | `src/app/admin/pos/page.tsx`, `src/app/admin/repairs/page.tsx`, `src/app/admin/customers/page.tsx`, `src/lib/customerSync.ts`, `firestore.rules` | PII records, orders and repairs |
| Authentication/RBAC | `src/lib/apiAuth.ts`, `src/middleware.ts`, `src/app/api/auth/session/route.ts`, `src/lib/permissions.ts` | Role and permission enforcement |
| Provider secrets | `src/lib/chatIntegrationConfig.ts`, `src/app/api/admin/chat/integrations/route.ts`, `firestore.rules` | Token and webhook secret storage |

Negative controls observed:

- `private_config` client read/write is denied in `firestore.rules`.
- Integration configuration routes require admin rather than general staff.
- Facebook production ingress verifies the provider signature before message processing.
