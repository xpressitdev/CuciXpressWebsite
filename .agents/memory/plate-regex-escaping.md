---
name: Plate normalization regex escaping in sql template literals
description: Why '\s' must be '\\s' inside drizzle `sql` template literals when normalizing license plates, or upserts 500 on cars_plate_normalized_unique.
---

# Plate normalization: `\s` vs `\\s` in `sql` template literals

The `cars_plate_normalized_unique` index normalizes by stripping whitespace:
`UPPER(REGEXP_REPLACE(license_plate, '\s+', '', 'g'))` — defined in a raw SQL
migration, where `\s` is a real Postgres whitespace class.

Runtime find-existing-car queries live inside JS `sql` template literals. There,
`'\s+'` (single backslash) **cooks to `'s+'`** — it strips the letter "s", NOT
whitespace. You MUST write `'\\s+'` so the SQL sent to Postgres is `\s+`.

**Why:** A single-backslash version made the find-by-plate SELECT miss any plate
already stored with a space (e.g. "BBC 5414"). The code then fell through to
INSERT, which collided with the whitespace-normalizing unique index → 500
"duplicate key value violates unique constraint cars_plate_normalized_unique"
(symptom: POS "Failed to create order"). It bit three separate call sites.

**How to apply:** Any new query that normalizes `license_plate` must use
`REGEXP_REPLACE(license_plate, '\\s+', '', 'g')` inside `sql`...`` so it matches
the index normalization exactly. Quick check:
`rg "REGEXP_REPLACE\(license_plate, '\\\\s\+'"` should return nothing (all good
ones use the double backslash). Demonstrate the bug:
`SELECT REGEXP_REPLACE('BBC 5414','s+','','g'), REGEXP_REPLACE('BBC 5414','\s+','','g');`
