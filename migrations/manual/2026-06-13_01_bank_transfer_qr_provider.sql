-- Distinguish the two configured Bank Transfer payment methods so the Order
-- Report can show the owner's names ("Bank Transfer BIBD" / "Bank Transfer
-- Baiduri") instead of a generic "Bank Transfer". Both rows previously had
-- method='bank_transfer' with qr_provider NULL, making orders indistinguishable.
--
-- Assigning a qr_provider slug makes (method, qr_provider) unique per config
-- row and lets POS orders record which bank was used going forward. Existing
-- bank-transfer orders keep qr_provider NULL and still fall back to the generic
-- label (their bank is unrecoverable). Idempotent — re-running is a no-op.
UPDATE payment_methods SET qr_provider = 'bibd'
 WHERE id = 'pm_bank_transfer' AND method = 'bank_transfer';

UPDATE payment_methods SET qr_provider = 'baiduri'
 WHERE id = 'pm_mq3ttobw_o8t65z' AND method = 'bank_transfer';
