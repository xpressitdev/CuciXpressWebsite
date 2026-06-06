-- 2026-06-06_01: Lane-control manual queue ordering.
-- Adds a nullable manual sort key to orders so POS cashiers can reorder
-- the "Up next" queue. NULL = no manual position → callers fall back to
-- created_at (FIFO). Lower number = earlier in the queue.
-- Idempotent: safe to re-run.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS queue_position integer;
