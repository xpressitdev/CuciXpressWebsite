-- ============================================================
-- Phase 3: License plate recognition (LPR) audit log.
--
-- Staff snap a photo of an arriving car at the gate; the server
-- forwards it to Google Gemini Vision, gets back a plate string +
-- confidence, and (if there's a matching vehicle in `cars`) auto-
-- selects it on POS. To allow tuning false positives and to give
-- the owner an audit trail without indefinite image hoarding, we
-- log every attempt for **30 days only** (lazy DELETE sweep on
-- read, mirroring the membership-expiry pattern from Phase 2.1).
--
-- Image bytes are stored inline as bytea — Cuci Xpress volume is
-- low enough (a few hundred photos / day, ~150-300KB JPEG each)
-- that an external object store isn't worth the complexity yet.
-- A 30-day window at that rate is well under 1GB.
--
-- All FK columns match the same conventions as `orders`:
--   * staff(id)    — text PK (POS auth, separate from users)
--   * branches(id) — integer
--   * cars(id)     — integer, nullable (no match found is fine)
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS lpr_attempts (
  id                  text        PRIMARY KEY,
  staff_id            text        NOT NULL REFERENCES staff(id),
  branch_id           integer     NOT NULL REFERENCES branches(id),
  recognized_plate    text,                       -- normalised UPPER, no spaces; NULL if Gemini returned nothing
  confidence          numeric(4,3),               -- 0.000 to 1.000
  matched_vehicle_id  integer     REFERENCES cars(id),  -- NULL when no row in `cars` matches
  raw_response        text,                       -- Gemini's full text reply, for debugging
  image_bytes         bytea       NOT NULL,
  image_mime          text        NOT NULL,
  image_size_bytes    integer     NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lpr_confidence_valid
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CONSTRAINT lpr_image_size_positive
    CHECK (image_size_bytes > 0)
);

-- Sweep index: 30-day retention DELETE runs `WHERE created_at < ...`,
-- so a btree on created_at makes that cheap.
CREATE INDEX IF NOT EXISTS idx_lpr_attempts_created_at
  ON lpr_attempts (created_at);

-- Tuning lookup: "show me the recent attempts for branch X" / dashboard.
CREATE INDEX IF NOT EXISTS idx_lpr_attempts_branch_created
  ON lpr_attempts (branch_id, created_at DESC);

-- Audit lookup by staff member.
CREATE INDEX IF NOT EXISTS idx_lpr_attempts_staff_created
  ON lpr_attempts (staff_id, created_at DESC);

COMMIT;
