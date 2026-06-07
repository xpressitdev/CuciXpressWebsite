---
name: neon driver — raw "= ANY(${jsArray})" fails
description: Why raw = ANY with a JS array throws "malformed array literal" and how to query an id list safely
---

Raw `WHERE col = ANY(${jsArray})` inside a drizzle `sql\`\`` template throws
Postgres `malformed array literal: "<value>"` under the neon serverless driver:
the JS array is sent as a bare scalar, not a Postgres array literal `{...}`.

**Symptom:** an endpoint 500s only when a list param is non-empty (e.g. POS
order creation failed exactly when add-ons were attached — and zero orders had
ever stored an add-on, so the path never worked).

**Fix:** build an IN-list of individually bound params:
`WHERE id IN (${sql.join(ids.map((x) => sql\`${x}\`), sql\`, \`)})`.
Guard with `ids.length > 0` so you never emit `IN ()`. Each value stays
parameterised, so it's injection-safe. Or use drizzle's `inArray()` when you
have the table object.

**Note:** comparing a scalar against a DB array *column* is fine the other way:
`${scalar} = ANY(p.branch_ids)` works (branch_ids is a real Postgres array).

**How to apply:** never write `= ANY(${jsArray})` in raw neon/drizzle SQL.
After fixing such a query, the deployed app needs a republish to pick it up.
