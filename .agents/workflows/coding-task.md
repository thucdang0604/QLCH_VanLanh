---
description: Coding task workflow for QLCH_VanLanh agents.
---

# Coding Task Workflow

Use this workflow for every code or configuration change.

## Step 1: Inspect

- Read `.agents/rules/qlch-vanlanh.md`.
- Read `AGENTS.md`.
- Select the context level from `AGENTS.md`.
- Read directly related files.
- Read `roadmap/ai/AI_SAFETY_CHECKLIST.md` only for large, risky, roadmap-backed, or multi-file work.
- For roadmap tasks, read the matching roadmap module before editing.
- For specialized tasks, use the relevant workflow in `roadmap/ai/workflows/`.
- Identify existing patterns and risk areas.
- Do not edit yet unless the change is trivial and fully scoped.

## Step 2: Plan

- Summarize the goal in one or two sentences.
- List files that may change.
- List checks that will prove the change works.
- If requirements are ambiguous or conflict with rules, stop and ask.

## Step 3: Implement

- Make the smallest change that satisfies the task.
- Keep unrelated files untouched.
- Preserve public API, data schema, permissions, and business-state transitions unless intentionally changing them.
- Add or adjust tests only where they reduce real risk.

## Step 4: Verify

- Run targeted lint/type/test commands for touched files when available.
- Run `pnpm verify` before final completion when feasible.
- If verification fails, fix root causes instead of suppressing warnings or claiming success.
- If a check cannot run, report the exact command and reason.

## Step 5: Report

- List changed files.
- Explain why each change was needed.
- Report commands run and results.
- Call out unresolved risks or follow-up work.
