-- Correct the known BAY4522 double-path loyalty case without changing sales.
--
-- The paid 7 July wash was used toward the customer's physical-card route when
-- the B$0 free wash was processed on 20 August. Record that same staff member as
-- the actor and move only the exact paid order out of the digital card.
--
-- Exact IDs and eligibility guards make this safe to run on databases where the
-- case does not exist and safe to re-run after it has been corrected.

INSERT INTO loyalty_physical_card_transfers (
  id,
  order_id,
  transferred_at,
  transferred_by_staff_id,
  note,
  physical_card_reference,
  used_at,
  used_by_staff_id,
  use_note
)
SELECT
  'lpct_bay4522_20260707',
  paid.id,
  free_wash.created_at,
  free_wash.staff_id,
  'Existing physical-receipt route recorded after the physical free wash on 20 Aug 2026.',
  COALESCE(
    paid.original_receipt_no,
    paid.kedaipos_order_number,
    paid.ticket_code,
    paid.payment_ref,
    paid.id
  ),
  free_wash.created_at,
  free_wash.staff_id,
  'Physical free wash processed on 20 Aug 2026.'
FROM orders paid
JOIN orders free_wash
  ON free_wash.id = 'ord_mt1cf2ax_0297c2'
 AND free_wash.staff_id IS NOT NULL
 AND free_wash.vehicle_id = 9694
 AND REGEXP_REPLACE(UPPER(free_wash.plate), '\s+', '', 'g') = 'BAY4522'
 AND free_wash.total_cents = 0
 AND free_wash.status IN ('paid', 'queued', 'washing', 'done')
WHERE paid.id = 'ord_mraihlht_y3f4u3'
  AND paid.vehicle_id = 9694
  AND REGEXP_REPLACE(UPPER(paid.plate), '\s+', '', 'g') = 'BAY4522'
  AND paid.package_id = 'pkg_basic_tyre_wax'
  AND paid.status IN ('paid', 'queued', 'washing', 'done')
  AND paid.total_cents > 0
  AND paid.loyalty_consumed_in IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM membership_redemptions mr WHERE mr.order_id = paid.id
  )
  AND NOT EXISTS (
    SELECT 1
      FROM loyalty_physical_card_transfers pct
     WHERE pct.order_id = paid.id
       AND pct.reversed_at IS NULL
  )
ON CONFLICT (id) DO NOTHING;