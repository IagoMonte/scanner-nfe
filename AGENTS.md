# AGENTS.md

These rules apply to every task in this project unless explicitly overridden.
Bias: caution over speed on non-trivial work.

## Rule 0 — Ask Me
If you don't understand why or how it works, ASK-ME.

## Rule 1 — Think Before Coding
State assumptions explicitly. Ask rather than guess.
Push back when a simpler approach exists. Stop when confused.

## Rule 2 — Simplicity First (KISS)
Minimum code that solves the problem. Nothing speculative.
No abstractions for single-use code. Don't add patterns, layers, or complexity unless they solve a proven problem.

## Rule 3 — Surgical Changes
Touch only what you must. Don't improve adjacent code.
Match existing style. Don't refactor what isn't broken.

## Rule 4 — Goal-Driven Execution
Define success criteria. Loop until verified.
Strong success criteria let you work independently.

## Rule 5 — Surface Conflicts, Don't Average Them
If two patterns contradict, pick one (more recent / more tested).
Explain why. Flag the other for cleanup.

## Rule 6 — Never Delete Tests
Tests exist for a reason. Do not delete them under any circumstance.

## Rule 7 — Tests Verify Intent, Not Just Behavior
Tests must encode WHY behavior matters, not just WHAT it does.
A test that can't fail when business logic changes is wrong.

## Rule 8 — Match the Codebase's Conventions, Even If You Disagree
Conformance > taste inside the codebase.
If you think a convention is harmful, surface it. Don't fork silently.

## Rule 9 — Fail Loud
"Completed" is wrong if anything was skipped silently.
"Tests pass" is wrong if any were skipped.
Default to surfacing uncertainty, not hiding it.

## Rule 10 — No TypeScript
Never introduce TypeScript. Never use TypeScript.

## Rule 11 — The Incremental Plan Is the Source of Truth
Each project keeps an incremental plan (`incrementalPlan.md` at the repo root) as the source of truth for scope.
At session start, read `incrementalPlan.md` before any work. If it does not exist and there is scoped work to do, create it first.
Pick the next open task; only one task in-progress at a time.
When a commit is APPROVED, update the plan: mark it done, move learnings to "ready", push new needs to the backlog.
Prefer the project progress file for session state and checkpoints.

## Rule 12 — Never Commit Without Explicit Order
Only commit when explicitly asked.
Before committing: run the tests, screenshot if UI, and write a short report. Inspect status/diff/log, stage only intended files, never commit secrets.

## Rule 13 — visual.md Is the UI Source of Truth
Every project with a frontend keeps a `visual.md` at the repo root.
It is the single source of truth for UI: colors, typography, spacing, components, motion.
ALL UI work must follow `visual.md`. If it conflicts with existing UI or taste, follow `visual.md` and surface the conflict per Rule 5.
If the project has no `visual.md` yet and UI work starts, create one first.

## Rule 14 — UI Is Verified by Screenshot
Testing UI = take a screenshot and validate it visually, not just check the DOM.

## Rule 15 — Report After Every Execution
After every task, produce a short, direct report. No preamble, no postamble.

## Rule 16 — Browser Automation Discipline
dev-browser always `--headless`.
Slice polls (<30s) — the daemon kills scripts around 30s.
`alert()` blocks headless: avoid it or dismiss it.
`pkill -f "vite preview"` kills your own shell — use a narrow pattern (`preview.*PORT`) and run it in parts.

## Rule 17 — Skills
Skills provide specialized instructions and workflows for specific tasks.
Use the skill tool to load a skill when a task matches its description.
