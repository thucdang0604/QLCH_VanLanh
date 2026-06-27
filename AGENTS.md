# QLCH_VanLanh AI Context Router

This is the first file AI agents should read in this repository. Use the user's prompt to choose the smallest context bundle that can safely handle the task.

## Always Apply

- Read the user's prompt carefully and classify the task before opening many files.
- Prefer the smallest sufficient context.
- Preserve unrelated local changes.
- Make surgical changes only.
- Do not edit generated output such as `.next/`, `.firebase/`, `node_modules/`, or `tsconfig.tsbuildinfo`.
- Do not modify secrets or `.env*` files unless explicitly requested.
- Report exact commands run and their results.

## Context Levels

### Level 0: No Code Change

Use for explanations, file meaning, status checks, or planning-only questions.

Read:

1. The file or command output directly relevant to the question.
2. Related roadmap/module docs only if the question asks for project context.

Do not edit files.

### Level 1: Tiny Edit

Use for typo fixes, copy changes, one-line UI text changes, CSS tweaks, comments, or obvious local fixes.

Read:

1. `AGENTS.md`
2. `.agents/rules/qlch-vanlanh.md`
3. The directly affected file(s)

Skip broad roadmap files unless behavior, schema, API, permission, or business logic changes.

### Level 2: Normal Code Task

Use for contained bug fixes, component changes, route fixes, validation changes, or small multi-file edits.

Read:

1. `AGENTS.md`
2. `.agents/rules/qlch-vanlanh.md`
3. `.agents/workflows/coding-task.md`
4. Directly related source files
5. Relevant types/helpers/tests

Add `roadmap/ai/CODEX_GUIDELINES.md` when the change touches shared patterns, Firestore, inventory, IDs, permissions, or type hygiene.

### Level 3: Business Logic, Bug, Or Data Contract

Use for POS, orders, inventory, repair, CRM, voucher, permissions, Firestore, API contracts, schema, or user-visible behavior bugs.

Read:

1. Level 2 files
2. `roadmap/ui/data/source_intelligence.json`
3. Relevant module file in `roadmap/ai/modules/`
4. Relevant workflow in `roadmap/ai/workflows/`

Required workflow selection:

- Bug fix: `roadmap/ai/workflows/bugfix-with-roadmap-update.md`
- Firestore, stock, held, POS, checkout, repair handover: `roadmap/ai/workflows/firestore-transaction-change.md`
- Docs-only roadmap changes: `roadmap/ai/workflows/roadmap-docs-update.md`

### Level 4: Feature, Architecture, Or Roadmap Work

Use for new features, architecture changes, schema/API changes, large refactors, deployment changes, or roadmap-backed implementation plans.

Read:

1. Level 3 files
2. `roadmap/ai/AI_readme.md`
3. `roadmap/ai/dashboard.md`
4. `roadmap/ai/AI_SAFETY_CHECKLIST.md`
5. `roadmap/ai/workflows/feature-with-ai-plan.md` when implementation planning is needed

Create or update AI plan files only when the task is large enough to need long-term tracking.

## Before Editing

For Level 1, proceed once the affected file is understood.

For Level 2 or higher, report:

- Context level selected
- Files inspected
- Applicable rules/workflow
- Task understanding
- Files planned for editing
- Files not to touch
- Verification command

## Verification

- Level 1: run a targeted check when available.
- Level 2: run targeted lint/type/test where relevant.
- Level 3: run targeted checks plus roadmap/source contract checks where relevant.
- Level 4: run broader verification, usually `pnpm verify` when feasible.
- Before committing, run `node scripts/ai-guard.mjs --staged` when available.
