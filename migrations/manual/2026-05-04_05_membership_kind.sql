-- ============================================================
-- Phase 2.1: Membership kind — packs vs unlimited.
--
-- The original Phase 2 schema only modelled prepaid wash-packs
-- (N washes, decrement per use). Cuci Xpress also sells a
-- time-bound "unlimited washes for 1 month" product. Same
-- conceptual entity (a customer paid up front, redeems at the
-- counter), but the gate is *time*, not *count*.
--
-- We add a `kind` column ∈ {'pack', 'unlimited'}:
--   * 'pack'      — total_washes > 0; remaining_washes decrements
--                   per redemption; status flips to 'exhausted'
--                   when remaining hits 0.
--   * 'unlimited' — total_washes/remaining_washes irrelevant
--                   (stored as 0); expires_at MUST be set; status
--                   flips to 'expired' once the date passes
--                   (server-side check on every redemption).
--
-- Existing rows: zero in both DBs at the time this lands, so no
-- data migration is needed. New rows default to 'pack' to keep
-- the existing endpoints' behaviour stable.
-- ============================================================

BEGIN;

-- 1. Add the column (default 'pack' so any pre-existing rows are
--    classified correctly — though we expect zero).
ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'pack';

-- 2. Replace the blanket "total_washes > 0" check with kind-aware
--    constraints. Unlimited packs can legitimately store
--    total_washes = 0 (the field is unused for that kind).
ALTER TABLE memberships
  DROP CONSTRAINT IF EXISTS memberships_total_positive;

ALTER TABLE memberships
  ADD CONSTRAINT memberships_kind_valid
    CHECK (kind IN ('pack', 'unlimited'));

ALTER TABLE memberships
  ADD CONSTRAINT memberships_pack_has_washes
    CHECK (kind <> 'pack' OR total_washes > 0);

ALTER TABLE memberships
  ADD CONSTRAINT memberships_unlimited_has_expiry
    CHECK (kind <> 'unlimited' OR expires_at IS NOT NULL);

-- The existing checks remain intact:
--   * memberships_remaining_nonneg     (remaining_washes >= 0)
--   * memberships_remaining_le_total   (remaining_washes <= total_washes)
--   * memberships_status_valid         (status IN active/exhausted/expired/cancelled)
-- All three hold for unlimited rows too (0 <= 0 <= 0).

COMMIT;
