# Finding Discovery Report

Target: current working-tree live-chat patch and directly supporting authorization/data flows.

## Candidates

### C-001: Chat APIs bypass the route permission gate for staff

- Locations: `src/app/api/admin/chat/rooms/[roomId]/facebook-profile/route.ts` (entrypoint), `src/app/api/admin/chat/send/route.ts` (sibling entrypoint), `src/lib/apiAuth.ts` (root control), `src/lib/chatServer.ts` (provider/RTDB sink).
- Source: bearer-authenticated user with role `staff` but without `chat_support`.
- Broken control: both chat actions call `requireAdminOrStaff`, while the UI and RTDB read path require `chat_support`.
- Impact: unauthorized staff can cause profile retrieval/update and, with a room ID, send provider messages on behalf of the business.
- Why plausible: API authorization is independent of client route filtering and Admin SDK calls bypass RTDB rules.
- Closest control: `ROUTE_PERMISSION_MAP['/admin/chat'] = 'chat_support'` applies only to page access.
- Validation recommended: yes.
- Relevant lines: newly added profile route calls the weak guard; chat UI newly invokes that route.
- Taxonomy: CWE-862, CWE-285.

### C-002: Newly linked CRM data can be placed in publicly addressable guest chat nodes

- Locations: `src/components/admin/chat/ChatCustomerProfileModal.tsx` (sink), `database.rules.json` (root control), `src/components/ChatWidget.tsx` (existing public-room producer).
- Source: public visitor-selected `guest_` room identifier and staff-entered customer name/phone.
- Broken control: RTDB allows reads and writes to any `$roomId.beginsWith('guest_')` without authentication; the patch adds `customerId`, `customerName`, and `customerPhone` to chat room info.
- Impact: disclosure or modification of chat-linked customer PII and message content when a room identifier is known or obtained.
- Why plausible: rules explicitly bypass `auth` for guest-prefix nodes and the new modal stores CRM identifiers in the same node.
- Closest control: random-looking localStorage room ID is not authentication.
- Validation recommended: yes.
- Relevant lines: new RTDB customer fields and new modal `updateRoomInfo()` write.
- Taxonomy: CWE-306, CWE-284, CWE-359.

### C-003: Chat-to-order and chat-to-repair handoff leaks PII through URL parameters

- Locations: `src/components/admin/chat/ChatCustomerProfileModal.tsx` (source/sink construction), `src/app/admin/pos/page.tsx` and `src/app/admin/repairs/page.tsx` (consumers).
- Source: staff-entered customer name and phone.
- Broken control: handoff serializes PII into `customerName` and `customerPhone` query parameters.
- Impact: phone/name retention in browser history, copied links, analytics or request logs.
- Why plausible: the new navigation path explicitly creates these URL values.
- Closest control: admin authentication does not prevent URL retention/disclosure.
- Validation recommended: yes.
- Relevant lines: all newly added prefill/navigation logic.
- Taxonomy: CWE-598, CWE-359.

### C-004: External webhook payload is retained as unnecessary raw event data

- Locations: `src/lib/chatServer.ts` (retention sink), provider webhook route call sites.
- Source: Meta/Zalo webhook message payload.
- Broken control: room info stores a serialized raw event in addition to normalized chat fields.
- Impact: unnecessary duplicate retention of provider identifiers/content/metadata available to chat readers and backups.
- Why plausible: `rawLastEvent` is written on every external inbound message but is not used by the frontend workflow.
- Closest control: string length cap reduces size only, not data minimization exposure.
- Validation recommended: yes.
- Taxonomy: CWE-359.

### C-005: Firestore CRM rules permit every staff account to read and write customer PII

- Locations: `firestore.rules` (root control), `src/components/admin/chat/ChatCustomerProfileModal.tsx`, `src/app/admin/customers/page.tsx`, `src/lib/customerSync.ts` (reachable consumers).
- Source: authenticated staff account without CRM/order/repair/chat permission.
- Broken control: `/customers/{phone}` uses `isStaff()` instead of the granular permission checks used for other sensitive records.
- Impact: unauthorized enumeration or modification of names, phones and spend/visit history.
- Why plausible: direct Firebase client calls are governed only by Firestore rules; hiding pages cannot restrict SDK queries.
- Closest control: admin layout permissions restrict visible routes only.
- Validation recommended: yes.
- Taxonomy: CWE-862, CWE-200.

### C-006: Facebook access token is transmitted in Graph API URLs

- Locations: `src/lib/chatServer.ts` profile lookup and message send helpers.
- Source: stored Facebook Page Access Token.
- Broken control: the token is embedded in outbound request query strings rather than an authorization header.
- Impact: credential exposure through URL-bearing diagnostics, intermediary request logging or error traces.
- Why plausible: both Graph requests build URLs with `access_token=...`.
- Closest control: the token is server-only at rest, but that does not prevent URL logging after use.
- Validation recommended: yes.
- Taxonomy: CWE-598, CWE-522.
