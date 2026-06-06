---
name: Lane queue ordering
description: How the POS "Up next" queue is ordered and the three places that must stay in lockstep.
---

# Lane queue ordering

The car-wash queue is ordered by `orders.queue_position ASC NULLS LAST, created_at ASC`
within a washing-first grouping. `queue_position` is a nullable manual sort key
(NULL = no manual position = plain FIFO by created_at; lower number = earlier).

**Rule:** any change to queue ordering must be applied in lockstep across all three
readers, or the cashier view and the public display will disagree:
1. Public queue snapshot SQL (`GET /api/queue/snapshot` in `server/routes.ts`).
2. POS `LaneControl` client-side sort (`client/src/pages/pos.tsx`).
3. `GET /api/pos/orders/today` must SELECT `queue_position` so the client can sort.

**Why:** cashiers can manually reorder the queue and pull a washing car back to
`queued` (front-inserted via `MIN(queue_position)-1`). Without consistent ordering,
a reorder would show one order to staff and a different order to customers.

**Reorder endpoint contract:** `PATCH /api/pos/queue/reorder` requires `order_ids`
to be an EXACT permutation of the branch's currently-queued IDs (locked FOR UPDATE);
a stale/partial list is rejected with 409 `queue_changed` so the client refetches
rather than committing a mixed ordering. Don't loosen this to "skip unknown IDs".
