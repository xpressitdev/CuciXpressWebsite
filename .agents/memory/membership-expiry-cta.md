---
name: Membership near-expiry CTA
description: Active unlimited members must keep the wash-QR action until expires_at; Renew is additive, never a replacement.
---
Rule: any customer-facing surface for an ACTIVE unlimited membership must keep the "Show wash QR" action available right up to `expires_at`. Renewal prompts (Renew button, banners) are shown ALONGSIDE, never instead of, the QR.

**Why:** July 2026 complaint — a paid-up member (active until 2 Aug) saw only "Renew" and no QR in his final week because the dashboard hero swapped the QR button for Renew when ≤7 days from expiry. The backend checkin endpoint correctly allows QR until `expires_at`; the suppression was purely client-side.

**How to apply:** when adding renewal/expiry-urgency UI anywhere (dashboard hero, vehicles tab, emails linking to the dashboard), gate the renew prompt on `isExpiringSoon` but never let it hide or replace the wash-QR entry point while the membership is still active.
