-- Forward-only repair for databases where the BAY4522 correction was applied
-- before the physical-card transfer record included its already-used state.
--
-- The B$0 20 August wash proves this particular physical entry was used, so it
-- must never be reversible back into the digital loyalty card. If any active
-- transfer exists for the exact paid order, mark it used. If the original
-- correction was reversed during the rollout window, preserve that reversed
-- audit row and add a new terminal used repair row.

UPDATE loyalty_physical_card_transfers pct
   SET used_at = free_wash.created_at,
       used_by_staff_id = free_wash.staff_id,
       use_note = 'Physical free wash processed on 20 Aug 2026.'
  FROM orders free_wash
 WHERE pct.order_id = 'ord_mraihlht_y3f4u3'
   AND pct.used_at IS NULL
   AND pct.reversed_at IS NULL
   AND free_wash.id = 'ord_mt1cf2ax_0297c2'
   AND free_wash.staff_id IS NOT NULL
   AND free_wash.vehicle_id = 9694
   AND REGEXP_REPLACE(UPPER(free_wash.plate), '\s+', '', 'g') = 'BAY4522'
   AND free_wash.total_cents = 0
   AND free_wash.status IN ('paid', 'queued', 'washing', 'done');

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
  'lpct_bay4522_20260707_used_repair',
  paid.id,
  free_wash.created_at,
  free_wash.staff_id,
  'Terminal repair: the physical-receipt route was already used for the 20 Aug 2026 free wash.',
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
  AND EXISTS (
    SELECT 1
      FROM loyalty_physical_card_transfers legacy
     WHERE legacy.id = 'lpct_bay4522_20260707'
       AND legacy.order_id = paid.id
       AND legacy.reversed_at IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1
      FROM loyalty_physical_card_transfers active
     WHERE active.order_id = paid.id
       AND active.reversed_at IS NULL
  )
ON CONFLICT (id) DO NOTHING;