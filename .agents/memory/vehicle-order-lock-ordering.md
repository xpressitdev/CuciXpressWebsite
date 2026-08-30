---
name: Vehicle/order lock ordering
description: Transaction lock order for workflows that move or consume vehicle-attributed orders.
---

Lock all known car rows first in ascending car ID order, then lock the affected
order rows. Revalidate the expected vehicle and plate only after those locks are
held.

**Why:** Loyalty redemption locks a car before its eligible orders. A correction
that locks an order before its car creates a car→order / order→car deadlock when
both operations race. Sorting multiple car IDs also prevents opposite-direction
vehicle moves from deadlocking each other.

**How to apply:** Any transactional workflow that changes order-to-car
attribution or consumes car-scoped order state must use car-first, sorted locks,
then lock/re-read the orders and reject stale source attribution.