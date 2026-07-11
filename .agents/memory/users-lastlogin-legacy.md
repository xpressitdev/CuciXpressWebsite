---
name: users.last_login is legacy-only
description: Why users.last_login must not be used to measure current-app sign-ins
---

The `users.last_login` column is populated ONLY by the old legacy LiveQue app (legacy JWT login path). The current Lucia v3 customer login does NOT update it.

**Why:** Auth is mid-migration (legacy JWT + Lucia coexist). The 175 users with `last_login` are fully disjoint from users with Lucia `auth_sessions` rows — they are old-app logins, not customer-dashboard usage.

**How to apply:** To count who has used the current customer dashboard, use `auth_sessions WHERE user_type='customer'` (distinct user_id). The admin CRM "Registered" card = `customers.user_id IS NOT NULL` (account linked to a customer record), which is smaller because sign-ups without a car/order never get a customers row.
