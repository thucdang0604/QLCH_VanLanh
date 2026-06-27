# Feature With AI Plan Workflow

Use this workflow for new features or multi-step implementation.

## Required Steps

1. Read `roadmap/ui/data/source_intelligence.json`.
2. Read relevant module docs.
3. Create new plan/task/walkthrough files in `roadmap/ui/data/ai_plans/` when the feature is large enough to need long-term tracking.
4. Do not overwrite previous plan files.
5. Register new plan files in `roadmap/ui/data/manifest.json`.
6. List implementation phases.
7. List files expected to change.
8. Implement incrementally.
9. Verify after each meaningful phase.
10. Update dashboard/module docs after completion when behavior or roadmap state changed.

## Naming

Use dated filenames:

- `plan_<task>_<yyyymmdd>_<shortid>.md`
- `task_<task>_<yyyymmdd>_<shortid>.md`
- `walkthrough_<task>_<yyyymmdd>_<shortid>.md`
