---
name: Vitest UI component tests
description: How to run React component (.test.tsx) tests alongside the node DB integration tests
---

UI component tests live in `tests/*.test.tsx` with a `// @vitest-environment jsdom` pragma (default env stays node for DB tests).

**Why:** Vitest 4 bundles rolldown-vite, which ignores the classic `esbuild.jsx` option and respects tsconfig `jsx: "preserve"` — so JSX in tests/components fails import-analysis unless `oxc: { jsx: { runtime: "automatic" } }` is set in vitest.config.ts. `@vitejs/plugin-react` in the vitest config also does NOT fix it. `environmentMatchGlobs` was removed in Vitest 4 — use the per-file pragma.

**How to apply:** keep the `oxc.jsx` block and `@`/`@assets` aliases in vitest.config.ts; new UI tests = `.test.tsx` + jsdom pragma + render under a fresh QueryClientProvider.

Also: `tests/membership-wash.test.ts` "rejects one-tap POS order with no package" fails on clean trees as of Aug 2026 (server returns cash_amount_required before package_required) — pre-existing, not caused by unrelated changes.
