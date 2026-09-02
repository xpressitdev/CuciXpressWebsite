-- Interior Refresh promotional check-ins create a visible B$0 queued order so
-- staff and customers can follow its progress. They are not POS sales and must
-- never be exported to the SharePoint sales workbook (including on a later
-- status/claim update).
BEGIN;

-- A defensive cleanup for any promotional rows queued before this migration.
-- Sent rows remain audit records; only unsent rows are prevented from export.
DELETE FROM sharepoint_outbox sob
USING orders o
WHERE o.id = sob.order_id
  AND sob.status = 'pending'
  AND (
    COALESCE(o.order_type, '') = 'interior_refresh_promo'
    OR o.qr_provider = 'interior_refresh'
  );

DROP TRIGGER IF EXISTS sharepoint_outbox_trg ON orders;
CREATE TRIGGER sharepoint_outbox_trg
  AFTER INSERT OR UPDATE OF status, claimed_at ON orders
  FOR EACH ROW
  WHEN (
    COALESCE(NEW.order_type, '') <> 'interior_refresh_promo'
    AND COALESCE(NEW.qr_provider, '') <> 'interior_refresh'
  )
  EXECUTE FUNCTION sharepoint_outbox_enqueue();

COMMIT;