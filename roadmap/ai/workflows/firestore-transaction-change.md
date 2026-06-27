# Firestore Transaction Change Workflow

Use this workflow whenever changing Firestore transaction logic, inventory, checkout, POS, repair handover, or held-stock behavior.

## Mandatory Rules

1. All transaction reads must happen before writes.
2. Do not call `tx.get` after `tx.set`, `tx.update`, or `tx.delete`.
3. `stock` and `held` must remain balanced.
4. `available = stock - held`.
5. Check availability on both frontend and backend where relevant.
6. Do not use `FieldValue.serverTimestamp()` inside `arrayUnion`.
7. Use `new Date()` or `Date.now()` inside array elements.
8. Use `.trim().toLowerCase()` for config/string matching.

## Before Editing

Report:

- Affected collection
- Affected API route
- Affected business rule
- Read-before-write plan
- Rollback risk
- Verification command
