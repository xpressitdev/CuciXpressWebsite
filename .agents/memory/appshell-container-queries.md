---
name: AppShell sidebar breaks viewport breakpoints
description: Why content shared between standalone and dashboard-shell views should use container queries, not viewport breakpoints
---

Pages that render BOTH standalone (marketing nav/footer) AND inside the logged-in
customer AppShell (which has a left sidebar) cannot rely on Tailwind viewport
breakpoints (`md:`/`lg:`) for multi-column grids or big fluid type.

**Why:** Viewport breakpoints fire on window width, but the AppShell sidebar
(~256px) shrinks the actual content width. So `lg:grid-cols-3` triggers at a
1024px viewport while the real column width is only ~240px — columns crowd and
fixed/oversized text (e.g. big plan prices) overflow and overlap.

**How to apply:** For such shared content, use CSS container queries instead:
put `container-type: inline-size` on a wrapper and switch `grid-template-columns`
via `@container (min-width: …)`. For headline/price text that must never
overflow its card, make each card its own container and size the text with a
`clamp(min, N cqw, max)` so it scales to the card, not the viewport. The
subscriptions plan grid (`client/src/pages/subscriptions.tsx` +
`.plan-cards`/`.plan-card`/`.plan-price` rules in `client/src/index.css`) is the
reference implementation.
