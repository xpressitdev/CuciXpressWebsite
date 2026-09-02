---
name: Entitlement granularity guards
description: Keeping benefit issuance and duplicate-claim protection aligned when entitlement scope changes.
---

When a benefit changes granularity (for example, one per subscription cycle becomes one per covered vehicle per cycle), update every downstream uniqueness, overlap, and duplicate-claim guard to use the same identity key.

**Why:** A subscription-level claim guard can silently negate valid per-vehicle entitlements even when issuance and booking logic are correct. Application tests may miss this if fixtures bypass database guards.

**How to apply:** Review both entitlement constraints and booking/redemption safeguards whenever benefit scope changes. Include non-exempt database tests proving same-key duplicates fail while different keys in the same period succeed.