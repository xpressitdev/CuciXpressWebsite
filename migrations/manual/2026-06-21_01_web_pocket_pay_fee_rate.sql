-- 2026-06-21_01_web_pocket_pay_fee_rate.sql
-- Seed the MDR fee rate for the automated website Pocket Pay QR gateway.
--
-- Website self-checkout orders are stored with qr_provider='pocket_pay' — a
-- reserved slug tied to the Pocket Pay callback idempotency index, so it can
-- never exist as an owner-created payment_methods row and the Payment Setup fee
-- picker (which lists only those rows) could not target it. As a result
-- mdrRateFor('qr_code','pocket_pay') returned 0 and every website sale logged
-- NO MDR, while the owner's intended "Website cucixpress.com (Web Pocket QR)"
-- rate sat mis-bound on 'pocket_pay_invoice'. This row applies that intended
-- rate (3.50% = 350 bps) to the real web slug.
--
-- Idempotent on the NULL-safe unique key
-- (payment_method, COALESCE(qr_provider, '')). Apply to BOTH $DATABASE_URL and
-- $STAGING_DATABASE_URL.
INSERT INTO payment_fee_rates (id, label, payment_method, qr_provider, mdr_bps)
VALUES ('fee_web_pocket_pay', 'Website cucixpress.com (Web Pocket QR)', 'qr_code', 'pocket_pay', 350)
ON CONFLICT (payment_method, COALESCE(qr_provider, '')) DO NOTHING;
