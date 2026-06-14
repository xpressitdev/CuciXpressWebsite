---
name: Dev server has no watch — restart for server edits
description: Why curl tests of just-edited Express routes return stale behavior, and how to avoid it
---

The `Start application` workflow runs `tsx server/index.ts` (no `tsx watch`). Editing
any `server/**` file does NOT hot-reload — the running process keeps the old code.

**Why:** This bit me when a freshly added route validation "didn't fire" during a
curl smoke test; the server was still running pre-edit code. Vite hot-reloads the
client, which masks the fact that the backend did not.

**How to apply:** After editing server-side code, `restart_workflow("Start application")`
before cur/integration-testing the change. Client-only (`client/**`) edits hot-reload
and don't need a restart.
