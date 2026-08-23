---
name: Lucia multi-instance typing
description: How to keep distinct user attribute shapes when one process has multiple Lucia v3 instances.
---

Lucia v3 has one module-level `Register`, so its database user attribute type is global even when the process creates separate Lucia instances with different runtime attribute shapes. Keep the secondary instance's shape explicit and isolate the unavoidable conversion at its adapter boundary; do not add a second module augmentation.

**Why:** A second augmentation collides with the primary instance, while relying on inferred Lucia methods exposes the primary user shape or private internals instead of the secondary shape.

**How to apply:** Whenever a secondary Lucia adapter or its public user type changes, update one shared local attribute contract and keep all assertions confined to the adapter/configuration boundary.