---
name: Tailwind dynamic class names from runtime data
description: Why class strings returned by the API/DB render as unstyled, and how to fix
---

Tailwind's JIT compiler only generates CSS for class names it can find as literal
strings in the source files at build time. Class names that arrive at runtime
(from an API response, DB column, or constructed by string concatenation of dynamic
parts) are NOT compiled — the elements render unstyled (e.g. avatar circles show up
white/transparent instead of colored).

**Why:** The backend `/api/reviews` returns a `bgColor` like
`bg-gradient-to-br from-purple-500 to-purple-600` per review. Binding that directly
to `className` produced colorless avatars because those exact strings never appear
in client source.

**How to apply:** Define the palette/variants as literal class strings in the
component source (e.g. a `const AVATAR_COLORS = ["bg-purple-500", ...]`) and index
into it. Never feed API-provided Tailwind class strings straight into `className`.
A fully-literal string like `bg-gradient-to-br from-blue-500 to-blue-600` written
in the component IS fine — the problem is only runtime-sourced/concatenated classes.
