---
name: Outbox draining under Neon HTTP
description: Why queue/outbox workers double-deliver on this stack and the atomic-claim pattern that fixes it.
---

# Outbox / queue draining under Neon HTTP

**Rule:** To drain a work queue (e.g. `sharepoint_outbox`) safely, CLAIM rows in a
single atomic `UPDATE ... WHERE id IN (SELECT id ... FOR UPDATE SKIP LOCKED) RETURNING id`
statement that also "leases" them (push a future timestamp into `next_attempt_at`).
Then carry that lease value back into every write-back as an ownership token
(`... WHERE id = $id AND next_attempt_at = $lease`).

**Why:** Under Neon's **HTTP driver every `db.execute()` auto-commits on its own**.
So a standalone `SELECT ... FOR UPDATE SKIP LOCKED` releases its row locks the
instant the SELECT returns — it gives **zero** protection across the later
processing step. Two drainers running at once then both pick the same pending
rows and deliver each item twice. Symptom seen: every order appended to the
SharePoint Excel master **exactly twice**, and the duplicate pair shared the
**same CX-N** (proves it was the same outbox row delivered twice, not a
double-enqueue — the enqueue trigger is one row per order).

**Two drainers run at once because:**
- **dev + prod share `DATABASE_URL`**, AND the **dev workspace also runs the
  background workers** (`startSharePointOutboxWorker` fires in dev too when the
  SHAREPOINT_* env is present). Both drain the same shared queue to the same
  shared external file. This is the usual culprit on this repl, not autoscale.
- The 30s timer tick overlapping a manual `/drain` ("Sync now") — the in-process
  `draining` flag only guards `tick()`, not the route's direct `drainOnce()` call.

**How to apply:**
- Keep claim + lease in ONE statement; never split lock and mutate across two
  `db.execute()` calls on Neon HTTP.
- Lease must comfortably exceed the time to process one full batch
  (`LEASE_SECONDS=300` vs `BATCH_SIZE=20`); a crashed send self-recovers when the
  lease lapses.
- Manual retry must not reset an actively-leased row (only `failed`, or
  `pending AND next_attempt_at <= now()`).
- Residual at-least-once window only if one row's send exceeds the lease (e.g.
  Graph outage with many slow failures); the lease-token guard prevents a stale
  worker from clobbering the newer worker's state, but a true duplicate is still
  theoretically possible — acceptable, since the Excel append API has no
  idempotency key.
- Separate concern (not yet changed): because dev also drains to the **real**
  Excel file, dev test orders land in the production/dummy sheet. If unwanted,
  point dev at a different file or leave SHAREPOINT_* unset in dev.
