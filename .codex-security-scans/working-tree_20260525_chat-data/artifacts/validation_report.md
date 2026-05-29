# Validation Report

## Validation Rubric

For each candidate, validation checks:

1. An actor outside the intended permission/data boundary can provide or select the input.
2. A runtime-reachable code path carries that input to a sensitive read, write, send or retention sink.
3. The nearest applicable authorization or data-minimization control is absent or weaker than the intended policy.
4. The impact concerns customer PII, customer communications or business-owned channel activity.
5. No inspected sibling control defeats the path before the sink.

Dynamic authorization reproduction was not run against production Firebase data because it would require exercising live customer/channel records. The evidence below is a static source-to-sink trace through the actual runtime code and deployed-rule sources; repair verification will be performed by build/typecheck and rule/code inspection.

## V-001: Chat APIs bypass the `chat_support` permission gate

- Candidate: C-001
- Root control: `src/lib/apiAuth.ts:38`
- Affected locations: `src/app/api/admin/chat/send/route.ts:9` (entrypoint), `src/app/api/admin/chat/rooms/[roomId]/facebook-profile/route.ts:12` (entrypoint), `src/lib/chatServer.ts:102` and `src/lib/chatServer.ts:268` (sinks)
- Confidence: high
- Validation method: code trace of bearer role authorization to Admin SDK/provider sinks.
- Rubric:
  - [x] A `staff` user without `chat_support` passes `requireAdminOrStaff`.
  - [x] Routes directly invoke provider/RTDB sensitive actions after that check.
  - [x] UI and RTDB sibling controls demonstrate the intended permission is `chat_support`.
  - [x] Impact is unauthorized customer communication/profile operation.
  - [x] No server-side permission check intervenes.
- Evidence: `ROUTE_PERMISSION_MAP` protects `/admin/chat`, while API routes only require role and use server Admin SDK which bypasses RTDB client rules.
- Remaining uncertainty: a room identifier is required for direct misuse, but staff can acquire one through operational exposure or previously held access.
- Disposition: reportable.

## V-002: Guest RTDB rooms expose chat-linked PII without authentication

- Candidate: C-002
- Root control: `database.rules.json:10-11`
- Affected locations: `src/components/admin/chat/ChatCustomerProfileModal.tsx:115-121` (new PII sink), `src/components/ChatWidget.tsx:19-22` (room identifier producer)
- Confidence: high
- Validation method: Firebase rules trace.
- Rubric:
  - [x] Any unauthenticated client may address a `guest_` node.
  - [x] Rules explicitly grant unauthenticated read and write to such nodes.
  - [x] Patch adds customer name/phone/id into the readable node.
  - [x] Impact is PII and conversation exposure/modification.
  - [x] Random room naming is not an authorization check.
- Evidence: the rule expression ends in `|| $roomId.beginsWith('guest_')`; the modal writes full normalized phone and customer name to room info.
- Remaining uncertainty: discovery probability of an arbitrary existing ID varies, but disclosure after an ID is shared, leaked or observed is unconditional.
- Disposition: reportable.

## V-003: PII enters navigation URLs during chat workflow handoff

- Candidate: C-003
- Root control: `src/components/admin/chat/ChatCustomerProfileModal.tsx:144-150`
- Affected locations: `src/app/admin/pos/page.tsx:111-119`, `src/app/admin/repairs/page.tsx:429-444`
- Confidence: high
- Validation method: direct construction/consumption trace.
- Rubric:
  - [x] Name and phone originate in staff-maintained customer data.
  - [x] Values are serialized to a URL query.
  - [x] Destination pages consume the URL values.
  - [x] URL persistence creates a PII leakage channel.
  - [x] No redaction/removal step exists.
- Evidence: `URLSearchParams` includes `customerName` and `customerPhone`; both destination pages call `searchParams.get(...)`.
- Remaining uncertainty: actual external collection of history/referrer depends on environment, but URL retention itself is deterministic.
- Disposition: reportable.

## V-004: Raw provider events are retained in RTDB without operational need

- Candidate: C-004
- Root control: `src/lib/chatServer.ts:201`
- Affected locations: provider webhook call sites passing `rawEvent`.
- Confidence: medium-high
- Validation method: retention trace and usage search.
- Rubric:
  - [x] Webhook bodies are externally sourced and may contain user/provider metadata.
  - [x] The raw object is serialized into a chat-readable room record.
  - [x] Normalized message fields already support the visible product workflow.
  - [x] Retention increases user data footprint.
  - [x] No frontend or operational read use was found for `rawLastEvent`.
- Evidence: only schema/write occurrences were found for `rawLastEvent`.
- Remaining uncertainty: operators may have intended temporary diagnostics, but no bounded diagnostic policy exists in code.
- Disposition: reportable.

## V-005: CRM Firestore rules authorize all staff instead of business permissions

- Candidate: C-005
- Root control: `firestore.rules:116-117`
- Affected locations: `src/components/admin/chat/ChatCustomerProfileModal.tsx`, `src/app/admin/customers/page.tsx`, `src/lib/customerSync.ts`
- Confidence: high
- Validation method: Firestore rules and client-call trace.
- Rubric:
  - [x] A staff Firebase-authenticated browser can issue client SDK reads/writes.
  - [x] `/customers/{phone}` accepts any staff role.
  - [x] UI permissions distinguish chat, order and repair responsibilities.
  - [x] Customer records contain names, phones and commercial history.
  - [x] Client route blocking cannot constrain direct SDK calls.
- Evidence: customers rule uses `isStaff()` while operational routes use `manage_orders`, `manage_repairs` and `chat_support`.
- Remaining uncertainty: none material for authorization scope.
- Disposition: reportable.

## V-006: Facebook access token enters outbound request URLs

- Candidate: C-006
- Root control: `src/lib/chatServer.ts` Graph URL construction in profile lookup and message send.
- Confidence: high
- Validation method: direct secret-to-URL construction trace.
- Rubric:
  - [x] The value is a privileged provider access token.
  - [x] Runtime code concatenates it into URL query strings.
  - [x] Provider requests are a production path.
  - [x] URL-bearing logs/traces are a standard credential disclosure surface.
  - [x] No redaction is applied before URL creation.
- Evidence: both helper URLs included `access_token=` before remediation.
- Remaining uncertainty: whether any particular intermediary currently records full URLs is deployment-dependent.
- Disposition: reportable.
