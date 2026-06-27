# AI Safety Checklist

Use this checklist before and after AI-assisted code changes.

## Before Editing

- [ ] Read `.agents/rules/qlch-vanlanh.md`.
- [ ] Read `.agents/workflows/coding-task.md`.
- [ ] Read `AGENTS.md`.
- [ ] Read `roadmap/ai/AI_readme.md`.
- [ ] Read `roadmap/ai/CODEX_GUIDELINES.md`.
- [ ] Check `roadmap/ui/data/source_intelligence.json` for schema/API context.
- [ ] Check `roadmap/ai/dashboard.md`.
- [ ] Check the relevant module file in `roadmap/ai/modules/`.
- [ ] Run `git status --short --untracked-files=all`.
- [ ] Check the current branch.
- [ ] Identify unrelated local changes that must be preserved.
- [ ] List files to edit.
- [ ] List files not to touch.
- [ ] Name the verification command.

## After Editing

- [ ] Run `git diff --name-status`.
- [ ] Run `git diff --stat`.
- [ ] Check whether files were deleted.
- [ ] Run relevant lint/typecheck/build/test commands.
- [ ] Update module docs when behavior, architecture, bug state, or roadmap status changed.
- [ ] Update `source_intelligence.json` when schema/API contracts changed.
- [ ] Add/register AI plan files for large implementation work.
- [ ] Summarize exact files changed and remaining risks.
