# Safe Code Edit Workflow

Use this workflow whenever editing code or configuration.

## Phase 1: Context Load

Read:

1. `.agents/rules/qlch-vanlanh.md`
2. `AGENTS.md`
3. `roadmap/ai/AI_readme.md`
4. `roadmap/ai/CODEX_GUIDELINES.md`
5. `roadmap/ui/data/source_intelligence.json`
6. `roadmap/ai/dashboard.md`
7. The relevant module file

## Phase 2: Git Safety

Run:

- `git status --short --untracked-files=all`
- `git branch --show-current`

Confirm:

- Which local changes are unrelated and must be preserved.
- Whether the current branch is safe for the task.
- Whether broad edits or commits need explicit approval.

## Phase 3: Preflight

Before large or risky edits, report:

- Goal
- Assumptions
- Files inspected
- Files to edit
- Files not to touch
- Verification command

## Phase 4: Edit

Rules:

- Touch only task-related files.
- Do not delete or rename files unless the task requires it.
- Do not edit unrelated files.
- Do not change `package.json`, `pnpm-lock.yaml`, `.env*`, Firebase config, Firestore rules, deployment config, or `source_intelligence.json` without naming the reason.
- Keep generated output out of commits.

## Phase 5: Verification

Run:

- `git diff --name-status`
- `git diff --stat`
- Relevant lint/typecheck/build/test command

Report:

- Changed files
- Deleted files
- Verification result
- Docs updated or not needed
