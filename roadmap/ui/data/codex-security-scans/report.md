# Security Scan Report - Chat Customer Data

## Target

- Repository: `M:\QLCH_VanLanh`
- Branch: `codex/chat-enhancements`
- Scope: working-tree omnichannel chat changes and directly affected authorization, datastore and order/repair handoff paths
- Date: 2026-05-25

## Executive Summary

The scan validated six security findings affecting customer PII, customer communications and provider credentials. All six are remediated in the current working tree. Release safety still depends on enabling Firebase Anonymous Authentication before applying locked RTDB rules and deploying code/rules together.

## Findings And Remediation Status

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| AP-005 | P1 | Any staff account could read/write CRM customer records through Firestore rules | Fixed |
| AP-002 | P2 | Public `guest_` RTDB room access exposed chat-linked PII | Fixed; requires Anonymous Auth before deploy |
| AP-001 | P2 | Privileged chat APIs did not enforce `chat_support` | Fixed |
| AP-003 | P2 | Chat-to-POS/Repair handoff placed name and phone in URLs | Fixed |
| AP-006 | P2 | Facebook access token was carried in Graph API URL | Fixed |
| AP-004 | P3 | Normalized messages also retained raw provider event fragments | Fixed for new writes |

## Residual Operational Risks

- Historical RTDB data written before this patch may still contain `rawLastEvent`; a deliberate one-time cleanup is required to remove old copies.
- Zalo deployments that must provide a secret through the webhook URL retain a log-exposure risk. Rotate that secret after accidental sharing and use header/signature authentication when supported by the provider configuration.
- Customer rules now exclude unrelated staff roles, but CRM v6 field-level write restrictions (`manage_customers` and aggregate-only sync) remain a separate defense-in-depth roadmap item.
- End-to-end verification with live Facebook/Zalo messages and production Firebase rules remains a deployment check, not a local build check.

## Verification Performed

- Static source-to-sink validation with threat model, discovery, validation and attack-path artifacts under `artifacts/`.
- Updated direct callers and imported helpers for chat, POS and Repair workflows.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed with pre-existing non-blocking warnings recorded in the fix report.
- `database.rules.json` JSON parse and `git diff --check`: passed.

## Release Gate

1. Enable Firebase Authentication `Anonymous` on the production Firebase project.
2. Deploy server application, Firestore rules and RTDB rules in one release.
3. Test anonymous website chat, Facebook message/media/reply, avatar CRM edit and POS/Repair handoff without PII in the URL.
