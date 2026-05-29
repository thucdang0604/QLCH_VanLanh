# Attack Path Analysis Report

## AP-001: Staff can invoke chat operations without `chat_support`

- Candidate: C-001 / V-001
- Affected locations: `src/lib/apiAuth.ts:38` (root control), `src/app/api/admin/chat/send/route.ts:9` and `src/app/api/admin/chat/rooms/[roomId]/facebook-profile/route.ts:12` (entrypoints), `src/lib/chatServer.ts:102` and `src/lib/chatServer.ts:268` (sinks).

Attack path:

1. An authenticated staff member holds a valid Firebase ID token but lacks `chat_support`.
2. They send a bearer-authenticated POST to a chat API with a known room ID.
3. `requireAdminOrStaff` approves the role without checking chat permission.
4. Server code uses privileged Admin SDK/provider credentials to fetch/update profile data or send a message.

Attack-path facts: This is an in-scope production admin API and crosses the staff-permission to customer-communication boundary. Vector is remote authenticated staff. Impact is provider message integrity and customer-chat access; target reach is individual conversations. Existing UI/RTDB permission gates are counterevidence only for normal UI use and do not protect Admin SDK APIs. Confidence is high.

Severity: impact high, likelihood medium due requiring staff credentials and a room ID; final severity `medium` (`P2`). Final policy decision: report and fix.

## AP-002: Guest RTDB prefix permits unauthenticated access to PII-bearing rooms

- Candidate: C-002 / V-002
- Affected locations: `database.rules.json:10-11` (root control), `src/components/ChatWidget.tsx:19-22` (room production), `src/components/admin/chat/ChatCustomerProfileModal.tsx:115-121` (new CRM sink).

Attack path:

1. An unauthenticated remote actor obtains or discovers a `guest_` room ID.
2. They read or write `chats/<guest_id>` directly through the Firebase RTDB client/REST surface.
3. The suffix rule bypasses authentication for all such nodes.
4. The room exposes messages and, after CRM linkage, customer name and phone.

Attack-path facts: This is public storefront functionality and crosses an anonymous-user to other-customer PII boundary. Vector is remote public, with the precondition of obtaining one room ID. The random identifier lowers broad enumeration likelihood but does not authorize possession or prevent leaked/shared identifiers. Confidence is high on access once an ID is known.

Severity: impact high, likelihood medium due ID precondition; final severity `medium` (`P2`). Final policy decision: report and fix by authenticated anonymous rooms.

## AP-003: Chat workflow places PII in navigation URLs

- Candidate: C-003 / V-003
- Affected locations: `src/components/admin/chat/ChatCustomerProfileModal.tsx:144-150` (root control), `src/app/admin/pos/page.tsx:111-119` and `src/app/admin/repairs/page.tsx:429-444` (consumers).

Attack path:

1. Staff saves a customer name and phone from the chat modal.
2. The UI builds a URL containing both values.
3. Browser history, copied URLs and any configured request/referrer collection can retain those values.

Attack-path facts: In-scope admin workflow; data crosses from protected customer records into a durable browser/navigation channel. Vector is normal authorized use rather than an attacker invoking a bypass; leakage likelihood is high and impact medium. No URL clearing exists. Confidence is high.

Severity: impact medium, likelihood high; final severity `medium` (`P2`). Final policy decision: report and fix using session-scoped handoff without URL PII.

## AP-004: Raw webhook events expand retained customer/provider data

- Candidate: C-004 / V-004
- Affected locations: `src/lib/chatServer.ts:201` (retention sink), Facebook and Zalo webhook callers (sources).

Attack path:

1. Provider sends an authenticated message event.
2. Server extracts normalized fields needed for chat but also stores a serialized copy of the event.
3. Any later permitted chat read, database export or operational incident includes unnecessary provider metadata.

Attack-path facts: In-scope data-retention path; it does not itself bypass authorization. Impact concerns minimization and breach surface rather than new unauthorized reach. Existing length bounds reduce volume only. Confidence is medium-high.

Severity: impact medium, likelihood medium; final severity `low` (`P3`). Final policy decision: report and fix because removal is narrow.

## AP-005: All staff can directly query and modify CRM records

- Candidate: C-005 / V-005
- Affected locations: `firestore.rules:116-117` (root control), client CRM/chat/POS/repair callers (concrete consumers).

Attack path:

1. A staff user with any unrelated permission authenticates to Firebase.
2. They use Firebase client SDK calls against `customers`, without visiting a restricted page.
3. Firestore rules authorize by staff role alone.
4. They enumerate or modify customer phone, identity and commercial-history records.

Attack-path facts: In-scope production data store and a real lower-privileged staff boundary. Vector is remote authenticated staff; no additional object-ID prerequisite exists because collection reads are permitted. Client route checks are not dispositive because Firestore independently evaluates SDK calls. Confidence is high.

Severity: impact high, likelihood high for a compromised or malicious staff account; final severity `high` (`P1`). Final policy decision: report and fix with permission-based customer rules.

## AP-006: Provider token placed in outbound Graph request URLs

- Candidate: C-006 / V-006
- Affected locations: `src/lib/chatServer.ts` profile and send request URL construction (root control/sink).

Attack path:

1. The server loads the stored Facebook Page Access Token for a normal chat operation.
2. It constructs an outbound URL containing the token in `access_token`.
3. Any full-URL request diagnostic, trace or intermediary log can retain a usable provider credential.

Attack-path facts: This is an in-scope server secret-use path. Exposure depends on logging infrastructure rather than an unauthenticated application endpoint; however, leaked token impact includes Page messaging ability. Existing server-only storage does not protect the token once placed in a URL. Confidence is high on the unsafe construction and medium on external collection.

Severity: impact high, likelihood medium; final severity `medium` (`P2`). Final policy decision: report and fix by using the authorization header.
