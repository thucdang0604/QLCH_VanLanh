---
trigger: always_on
---

# QLCH VanLanh Agent Rules

These rules are mandatory for every coding task in this repository.

## Before Editing

1. Read the task and identify the smallest useful scope.
2. Inspect the relevant source files before proposing or applying changes.
3. Read `AGENTS.md` first and follow its context level routing.
4. For roadmap-backed, business-logic, schema, API, permission, or architecture work, read the relevant roadmap/source-intelligence files selected by `AGENTS.md`.
5. Use `roadmap/ui/data/source_intelligence.json` as the first reference for database schema and API inventory, then verify live code when exact behavior matters.
6. State the files inspected, applicable rules, and short plan before large or risky edits.

## Editing Rules

1. Make surgical changes only in files required by the task.
2. Preserve existing architecture, naming, permissions, business logic, and route contracts unless the task explicitly changes them.
3. Do not refactor unrelated code.
4. Do not hide errors with broad fallbacks, warning suppression, or fake success states.
5. Do not edit generated/build output such as `.next/`, `.firebase/`, `node_modules/`, or `tsconfig.tsbuildinfo`.
6. Do not change secrets or `.env*` values unless the user explicitly asks.
7. Keep Vietnamese text valid UTF-8. If text shows mojibake or double-encoded characters, stop and fix encoding manually instead of bulk replacing.

## Verification Rules

1. Prefer targeted checks while developing.
2. Before reporting completion, run:
   - `pnpm verify`
3. If full verification is too slow or blocked, run the strongest relevant subset and report the exact blocker.
4. Always report exact commands run and whether they passed or failed.
5. If a rule conflicts with the user request, stop and explain the conflict before editing.
6. Before committing, run `node scripts/ai-guard.mjs --staged` when the script is available.

## Roadmap And Bug Tracking

1. Store new implementation plans, task lists, and walkthroughs in `roadmap/ui/data/ai_plans/`.
2. Register new AI plan files in `roadmap/ui/data/manifest.json`.
3. For new product bugs, record the bug in the relevant `roadmap/ai/modules/` file.
4. After fixing a recorded bug, update its status and include root cause, changed files, and verification.
