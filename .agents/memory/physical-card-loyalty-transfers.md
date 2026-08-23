---
name: Physical-card loyalty transfers
description: Business rule and audit invariant for moving a qualifying digital wash to a physical loyalty card.
---

A qualifying paid B$12 wash can belong to exactly one loyalty path. Digital is
the default; moving a receipt to a physical card must create an order-level
audit record rather than changing `loyalty_consumed_in`, which exclusively
means a digital reward consumed the order.

**Why:** Reusing a printed receipt on a physical card while it remains digital
creates two free washes from one sale. The original sale must remain intact for
sales history and auditing.

**How to apply:** All digital count and redemption readers exclude active
physical-card transfers. Transfer and digital redemption must lock/re-check the
same order. Only an unused physical entry can be reversed; once physical use is
recorded, it remains permanently outside digital loyalty. Manual historic
receipt credits must not recreate a receipt already represented by a system
order. Historic manual receipt references are globally one-use across all
plates, so both their lock and duplicate check must key on the canonical
receipt reference alone.