# Bugfix With Roadmap Update Workflow

Use this workflow for bug fixes.

## Required Steps

1. Identify the relevant module file in `roadmap/ai/modules/`.
2. Reproduce the bug or trace the exact failing path.
3. Create or update a `BUG-XXX` entry in the module file when the bug is product-relevant.
4. Propose the minimal fix.
5. Edit only task-related files.
6. Run targeted verification.
7. If the bug was recorded, change its status from `open` to `fixed` after verification.
8. Record root cause, files changed, verification command, and remaining risk.

## Stop Conditions

- The reported symptom cannot be reproduced or traced.
- The fix would require schema, permission, or deployment changes not requested.
- Verification fails and the root cause is outside the scoped task.
