---
name: POS first-timer car capture
description: Why POS captures car brand/model (not customer name/phone) for new plates, and how it survives plate-claim.
---
# POS first-time walk-in capture

At the drive-thru POS, a brand-new plate (no matched car) requires the cashier to
record the car's **brand + model** — NOT customer name/phone. We don't know the
walk-in's identity, so asking for it is noise.

**Why brand/model and not customer info:** the car (keyed by normalised plate) is
the durable identity at the lane. Brand/model entered at POS lives on the `cars`
row.

**Retention rule:** when the customer later registers/logs in and claims that plate,
the claim flow attaches ownership (`user_id`/`customer_id`) via COALESCE and does
NOT touch brand/model — so POS-captured details survive and the customer can edit
them afterward. Any code that "claims"/links a plate must preserve existing
brand/model (COALESCE, never overwrite).

**How to apply:** the "required" rule is enforced both client-side (canSubmit gate)
AND server-side in `POST /api/pos/orders` — only on the brand-new-plate INSERT path
(no vehicle_id + no existing row). Existing-plate upsert fills brand/model only when
blank (COALESCE) and never clobbers. Normalise blank strings to NULL before persist.
