# Threat Model: QLCH VanLanh

## Overview

QLCH VanLanh is a Next.js storefront and administration application for phone sales and repair operations. It handles customer identity and contact data, orders, repairs, appointments, live chat, external Facebook/Zalo messages, staff access, and integration credentials. Product code is primarily under `src/app`, `src/components`, and `src/lib`; Firebase Firestore and Realtime Database (RTDB) are the persistence and realtime authorization boundaries through `firestore.rules` and `database.rules.json`.

The highest-value assets are customer personally identifiable information (name, phone, address, conversation history, repair history and device details), staff/admin sessions and role assignments, external-channel tokens/secrets, and records that affect revenue or repair custody.

## Threat Model, Trust Boundaries, and Assumptions

Actors:

- Public customers and anonymous chat visitors control storefront form inputs, guest-chat messages and browser storage.
- Facebook and Zalo webhook senders control signed or token-authorized external event payloads.
- Authenticated staff are semi-trusted and must be constrained by granular permissions.
- Admins are privileged operators, but their browser must not receive long-lived provider credentials unnecessarily.
- Firebase Admin SDK code and Cloud Run/Functions runtime identities are privileged server components.

Trust boundaries:

1. Browser to public Next.js routes and Firebase client SDK calls.
2. Admin browser to middleware/UI permission gates, authenticated API handlers and Firebase client writes.
3. Meta/Zalo networks to webhook handlers and stored chat content/media metadata.
4. Server runtime to Firestore/RTDB through Admin SDK and runtime service-account IAM.
5. Server runtime to Graph/Zalo APIs using stored access tokens.
6. RTDB chat nodes to Firestore customer/repair/order records when staff links a conversation to CRM activity.

Security invariants:

- A staff member without the matching permission must not read or mutate chat, CRM, repair or order data through either UI or API.
- Integration tokens and webhook verification secrets stay server-side.
- Public or anonymous chat access must not expose other customers' identity or conversations.
- External payloads are authenticated, minimized before retention, and never trusted as HTML or privileged commands.
- PII is not leaked into URLs, logs, browser-persistent caches or broad realtime nodes without a necessary operational purpose.

Assumptions:

- Firebase project configuration, webhook secrets, and service-account IAM are deployed correctly.
- Admin SDK bypasses Firebase rules; therefore API authorization is a required independent control.
- Client-side route hiding is not an authorization boundary.

## Attack Surface, Mitigations, and Attacker Stories

Primary attack surfaces:

- Public chat widget and its direct RTDB operations in `src/components/ChatWidget.tsx` and `src/lib/realtimedb.ts`.
- Admin chat page and APIs under `src/app/admin/chat` and `src/app/api/admin/chat`.
- Facebook/Zalo webhook endpoints under `src/app/api/integrations`.
- Customer, order and repair Firestore access from admin pages.
- Session role synchronization in `src/app/api/auth/session/route.ts`.
- Secret storage and retrieval in `src/lib/chatIntegrationConfig.ts`.

Existing mitigations:

- Firestore `private_config` is denied to Firebase clients and is accessed through server APIs only.
- Integration settings API is restricted to admin users.
- Facebook webhook verifies an HMAC signature in production.
- RTDB admin room listing requires an active synchronized admin role and `chat_support` or admin status.
- Rendering uses React and controlled Next/Image or native media elements rather than inserting external HTML.

Realistic attacker stories:

- A staff account with an unrelated permission calls a chat server endpoint directly if API authorization only checks `staff`, bypassing UI route checks.
- A person who obtains or guesses an anonymous guest room identifier reads or writes conversation metadata when RTDB rules expose `guest_` paths directly.
- A provider webhook payload causes unnecessary personal metadata to be retained through raw-event logging or persistence.
- A staff workflow carries phone/name through query strings, leaking PII through browser history, copied URLs or request/referrer logs.

Less-relevant or out-of-scope stories:

- A malicious Firebase Admin runtime identity is already equivalent to a backend compromise and is not mitigated by client rules.
- XSS through plain chat text is lower risk while text remains rendered as React text; it becomes serious if later rendered as HTML.

## Severity Calibration

### Critical

- Public enumeration or unauthenticated bulk access to customer phone numbers, chat transcripts, repair/device data or integration secrets.
- Server API allowing unauthenticated mutation of orders, repairs, customer records or provider messages.

### High

- Staff permission bypass enabling unauthorized reading/sending of customer conversations or reading/writing CRM records.
- Exposure of Page/OA access tokens or webhook secrets to browser clients.
- Guest-chat authorization design that exposes PII-bearing conversations with only a guessable room identifier as protection.

### Medium

- PII placed in URLs or retained in unnecessary raw event copies.
- Overly broad browser persistence of customer identity details.
- Missing input bounds that causes data leakage or operational failure without broad unauthorized access.

### Low

- Diagnostic logging that reveals channel identifiers but no credentials or customer content in restricted operational logs.
- UI-only issues without an authorization, data-retention or integrity effect.
