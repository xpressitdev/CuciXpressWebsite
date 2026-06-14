---
name: Email delivery (SendGrid + Gmail fallback)
description: How outbound mail (OTP codes, receipts, etc.) is sent and why; the deliverability gotcha behind missed OTPs.
---

All outbound email goes through one helper in `server/email.ts` that tries
**SendGrid first, then falls back to Gmail SMTP**. SendGrid is the reliable path;
Gmail is the legacy fallback so mail keeps flowing if SendGrid can't send.

**Why:** Customers (esp. Outlook/Hotmail/Yahoo) weren't receiving OTP codes. It was
never a code bug — logs showed sends succeeding. Root cause was deliverability:
sending OTPs via Gmail SMTP from a personal `@gmail.com` address (no domain auth)
gets spam-foldered and is capped (~500/day). The fix is a transactional provider
sending from an authenticated domain, not anything in the OTP logic.

**How to apply:**
- The "from" identity is `noreply@cucixpress.com`, overridable via the `MAIL_FROM`
  env var. SendGrid will only accept a "from" on an **authenticated/validated**
  domain (or a verified single sender).
- SendGrid deliverability depends on **domain authentication** for `cucixpress.com`:
  3 CNAME records (mail/em-subdomain + 2 DKIM `s1`/`s2._domainkey`) must exist in
  DNS and the domain must show `valid: true` in SendGrid. Until then SendGrid
  returns 403 and every send silently falls back to Gmail (so no outage, but also
  no deliverability win). Check status via SendGrid API `/v3/whitelabel/domains`.
- `SENDGRID_API_KEY` and `GMAIL_APP_PASSWORD` are both secrets that exist. The
  code_execution JS sandbox does NOT expose process.env — to call SendGrid's API
  with the key, run a one-off `node` script via bash (the app env has the secrets),
  and never print the key.
- If OTP/email "stops working" after this, first check whether SendGrid's "from"
  domain/sender is still verified before touching the OTP flow.
