# Fix Report

## Scope

Security hardening for omnichannel chat, CRM linkage and workflow handoff in the current working tree on branch `codex/chat-enhancements`.

## Remediated Findings

| Finding | Severity | Remediation |
| --- | --- | --- |
| Customer collection readable/writable by every staff role | P1 | `firestore.rules` now requires business permissions through `canManageCustomerData()`; `/admin/customers` maps to `manage_orders`. |
| Public `guest_` RTDB rooms can expose chat and linked PII | P2 | Removed prefix-based anonymous RTDB grants; `ChatWidget` now signs guests into Firebase Anonymous Auth and uses the authenticated UID as room ID. |
| Server chat API accepts staff without `chat_support` | P2 | Added `requirePermission()` and applied `chat_support` checks to send and Facebook profile synchronization APIs. |
| Customer name and phone propagated through navigation URL | P2 | Added one-time per-tab `sessionStorage` handoff; POS and Repair pages consume it while URLs carry only `source=chat`. |
| Facebook Page Access Token sent in Graph API query URL | P2 | Provider requests now send access tokens through the `Authorization: Bearer` header. |
| Raw webhook event retained in RTDB without a product need | P3 | Removed the `rawEvent` input and `rawLastEvent` write/validation path. |
| Chat CRM save failed when browser RTDB role write was unavailable | Reliability / auth boundary | Moved CRM lookup/save and room linkage to a `chat_support`-protected server API; RTDB linkage failure is reported separately after CRM persistence. |
| Chat support panel could over-read business history if implemented without module gates | P1 prevention | Customer activity listeners are enabled separately by `manage_orders` and `manage_repairs`; a `chat_support`-only user does not issue those Firestore reads. |
| Chat profile modal exposed business workflow commands without module permission | RBAC / UX | POS and Repair actions are now rendered only for users holding `manage_orders` or `manage_repairs` respectively. |
| Chat profile API exposed business aggregate metrics to `chat_support` alone | P2 | Customer API now omits order/spend and repair totals unless the caller holds the corresponding module permission. |
| Facebook customer images relied on external temporary CDN URLs | Privacy / reliability | New inbound images are cached under `private/chat/`; the Storage `private/` namespace is reserved for Admin SDK and denied to clients; images are served only through a `chat_support`-protected media endpoint; RTDB write is performed before cache work. |
| Integration settings route and API had inconsistent authorization | Access consistency | Integration API now accepts the same `manage_settings` permission required by the admin route, while chat-only staff still cannot change provider secrets/templates. |

## Adjacent Impact Check

- Inspected and updated all import/export consumers introduced by the chat workflow: modal producer, POS consumer, Repair consumer, API authorization helper, API routes, server provider adapter, RTDB schema/rules and customer Firestore rules.
- Removed direct customer/room writes from `ChatCustomerProfileModal`; it now uses `GET/POST /api/admin/chat/rooms/{roomId}/customer` with the logged-in bearer token.
- The new customer API logs internal Firebase failures on the server and returns a generic 500 response instead of exposing credential or transport details to the browser.
- Verified no remaining source occurrence of `access_token=` outbound construction, `rawLastEvent`, `rawEvent`, public `guest_` rules, PII query-string consumers or legacy local-storage PII writes.
- The new CRM drawer and chat task panel reuse Firestore client rules and do not add Admin reads or widen `chat_support`; deep-links enter the existing protected order/repair pages.
- Order deep-links now keep status transitions functional even when the opened order is outside the list page's first 50 loaded records.
- Meta Inbox fallback links identify a Page inbox conversation and are not presented as customer public profile links; quick replies contain no provider secrets and are read only through the chat API.

## Operational Requirements

- Enable Firebase Authentication provider `Anonymous` before deploying the new RTDB rules.
- Deploy application code, Firestore rules, RTDB rules and Storage rules as the same release.
- Existing historical `rawLastEvent` values are no longer written but require one-time deletion if retention must be reduced.
- The Zalo webhook still supports URL query secret for provider compatibility; prefer `x-webhook-token` or a platform signature when Zalo setup supports it, because URL secrets can appear in logs.
- The current CRM rule removes access for unrelated staff roles; finer field-level restrictions planned in CRM v6 are not implemented by this hardening patch.

## Verification

- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed; existing non-blocking `no-console` and Firebase/protobuf dynamic dependency warnings remain.
- JSON parse check for `database.rules.json`: passed.
- `git diff --check`: passed.
