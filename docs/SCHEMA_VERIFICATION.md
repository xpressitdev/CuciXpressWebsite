# Schema Verification Report

**Date:** 2026-05-03
**Method:** `psql \d <table>` compared to `shared/schema.ts` (read-only)
**Result:** ✅ **Functionally compatible** — app works against the live database. All findings are non-breaking. No critical issues.

---

## Executive summary

- **9 tables** verified against the live database (LiveQue consolidated DB).
- **0 critical issues.** Nothing is broken or at risk of data corruption.
- **7 cosmetic differences** (mostly `varchar(N)` in DB vs `text` in schema, plus one constraint-name mismatch).
- **9 functional differences**, all of the same shape: DB column is `NOT NULL` but `shared/schema.ts` declares it as nullable. The app works because writes always supply values (or rely on DB defaults), and reads get non-null values back. The only consequence is that TypeScript types are slightly more permissive than reality (e.g. `boolean | null` instead of `boolean`).
- The **`session`** table exists in the DB (used by `connect-pg-simple`) but is intentionally absent from `shared/schema.ts` because it is managed by the session library, not by the app.
- **Important note about the `users` table comments:** The block comment in `shared/schema.ts` (lines 23–32) states that `is_admin`, `points`, and `level` were removed `.notNull()` "to match LiveQue's actual DB". The actual DB has these columns as `NOT NULL` with defaults. The comment's premise is incorrect, but the resulting schema is still functionally compatible — see findings below.

---

## Table-by-table findings

### 1. `users`

- Total columns in DB: **12**
- Total columns in `shared/schema.ts`: **12**
- All 12 column names match exactly.
- Indexes in DB: `users_pkey` (id), `users_email_key` (UNIQUE on email).
- FKs referencing `users`: `cars.user_id`, `service_history.user_id`, `user_achievements.user_id`. Schema declares all three.

| Column | DB | schema.ts | Category | Note |
|---|---|---|---|---|
| `id` | integer NOT NULL, serial | `serial().primaryKey()` | ✅ | match |
| `first_name` | text NOT NULL | `text().notNull()` | ✅ | match |
| `last_name` | text NOT NULL | `text().notNull()` | ✅ | match |
| `email` | varchar(255) NOT NULL, UNIQUE | `text().notNull().unique()` | 🟢 | varchar(255)→text is functionally interchangeable; UNIQUE matches |
| `password` | text NOT NULL | `text().notNull()` | ✅ | match |
| `phone_number` | varchar(20) NOT NULL | `text().notNull()` | 🟢 | varchar(20)→text |
| `address` | text NOT NULL | `text().notNull()` | ✅ | match |
| `is_admin` | boolean NOT NULL DEFAULT false | `boolean().default(false)` | 🟡 | DB is NOT NULL, schema is nullable. Contradicts comment in schema.ts |
| `points` | integer NOT NULL DEFAULT 0 | `integer().default(0)` | 🟡 | DB is NOT NULL, schema is nullable |
| `level` | integer NOT NULL DEFAULT 1 | `integer().default(1)` | 🟡 | DB is NOT NULL, schema is nullable |
| `created_at` | timestamp NULL DEFAULT CURRENT_TIMESTAMP | `timestamp().defaultNow()` | ✅ | match (CURRENT_TIMESTAMP ≡ now()) |
| `last_login` | timestamp NULL | `timestamp()` | ✅ | match |

**Verdict:** ✅ functionally compatible

---

### 2. `cars`

- Total columns in DB: **7**
- Total columns in `shared/schema.ts`: **7**
- All names match. FK `cars_user_id_fkey` matches the `.references(() => users.id)` declaration.

| Column | DB | schema.ts | Category | Note |
|---|---|---|---|---|
| `id` | integer NOT NULL, serial | `serial().primaryKey()` | ✅ | match |
| `user_id` | integer NOT NULL, FK→users.id | `integer().references(() => users.id).notNull()` | ✅ | match |
| `license_plate` | varchar(20) NOT NULL | `text().notNull()` | 🟢 | varchar→text |
| `brand` | varchar(100) NOT NULL | `text().notNull()` | 🟢 | varchar→text |
| `model` | varchar(100) NOT NULL | `text().notNull()` | 🟢 | varchar→text |
| `type` | varchar(50) NOT NULL | `text().notNull()` | 🟢 | varchar→text |
| `photo_url` | text NULL | `text()` | ✅ | match |

**Verdict:** ✅ functionally compatible

---

### 3. `branches`

- Total columns in DB: **9**
- Total columns in `shared/schema.ts`: **9**
- Names match. PK only; no FKs.

| Column | DB | schema.ts | Category | Note |
|---|---|---|---|---|
| `id` | integer NOT NULL, serial | `serial().primaryKey()` | ✅ | match |
| `name` | text NOT NULL | `text().notNull()` | ✅ | match |
| `location` | text NOT NULL | `text().notNull()` | ✅ | match |
| `queue_count` | integer NOT NULL DEFAULT 0 | `integer().default(0)` | 🟡 | DB NOT NULL, schema nullable |
| `google_maps_url` | text NOT NULL | `text().notNull()` | ✅ | match |
| `google_maps_embed_url` | text NOT NULL | `text().notNull()` | ✅ | match |
| `review_url` | text NOT NULL | `text().notNull()` | ✅ | match |
| `last_queue_update` | timestamp NULL | `timestamp()` | ✅ | match |
| `is_open` | boolean NOT NULL DEFAULT true | `boolean().default(true)` | 🟡 | DB NOT NULL, schema nullable |

**Verdict:** ✅ functionally compatible

---

### 4. `achievements`

- Total columns in DB: **5**
- Total columns in `shared/schema.ts`: **5**
- Names match. Referenced by `user_achievements.achievement_id`.

| Column | DB | schema.ts | Category | Note |
|---|---|---|---|---|
| `id` | integer NOT NULL, serial | `serial().primaryKey()` | ✅ | match |
| `name` | text NOT NULL | `text().notNull()` | ✅ | match |
| `description` | text NOT NULL | `text().notNull()` | ✅ | match |
| `required_points` | integer NOT NULL | `integer().notNull()` | ✅ | match |
| `created_at` | timestamp NOT NULL DEFAULT now() | `timestamp().defaultNow()` | 🟡 | DB NOT NULL, schema nullable |

**Verdict:** ✅ functionally compatible

---

### 5. `user_achievements`

- Total columns in DB: **4**
- Total columns in `shared/schema.ts`: **4**
- Names match. Both FKs (`user_id`, `achievement_id`) match.

| Column | DB | schema.ts | Category | Note |
|---|---|---|---|---|
| `id` | integer NOT NULL, serial | `serial().primaryKey()` | ✅ | match |
| `user_id` | integer NOT NULL, FK→users.id | `integer().references(() => users.id)` | 🟡 | DB NOT NULL, schema is nullable (no `.notNull()`) |
| `achievement_id` | integer NOT NULL, FK→achievements.id | `integer().references(() => achievements.id)` | 🟡 | DB NOT NULL, schema is nullable |
| `unlocked_at` | timestamp NOT NULL DEFAULT now() | `timestamp().defaultNow()` | 🟡 | DB NOT NULL, schema nullable |

**Verdict:** ✅ functionally compatible

---

### 6. `collaboration_submissions`

- Total columns in DB: **8**
- Total columns in `shared/schema.ts`: **8**
- All column names and types match exactly. Note: schema uses camelCase variable names (`businessType`, `createdAt`, `isRead`) but the underlying Postgres column strings are correct snake_case.

| Column | DB | schema.ts | Category |
|---|---|---|---|
| `id` | integer NOT NULL, serial | `serial().primaryKey()` | ✅ |
| `name` | text NOT NULL | `text().notNull()` | ✅ |
| `email` | text NOT NULL | `text().notNull()` | ✅ |
| `phone` | text NULL | `text()` | ✅ |
| `business_type` | text NULL | `text("business_type")` | ✅ |
| `message` | text NULL | `text()` | ✅ |
| `created_at` | timestamp NOT NULL DEFAULT now() | `timestamp("created_at").defaultNow().notNull()` | ✅ |
| `is_read` | boolean NOT NULL DEFAULT false | `boolean("is_read").default(false).notNull()` | ✅ |

**Verdict:** ✅ fully matches

---

### 7. `subscription_signups`

- Total columns in DB: **4**
- Total columns in `shared/schema.ts`: **4**
- All names and nullability match. UNIQUE on `email` is enforced in both.

| Column | DB | schema.ts | Category |
|---|---|---|---|
| `id` | integer NOT NULL, serial | `serial().primaryKey()` | ✅ |
| `email` | text NOT NULL, UNIQUE (`subscription_signups_email_key`) | `text().notNull().unique()` | 🟢 |
| `is_notified` | boolean NOT NULL DEFAULT false | `boolean("is_notified").default(false).notNull()` | ✅ |
| `created_at` | timestamp NOT NULL DEFAULT now() | `timestamp("created_at").defaultNow().notNull()` | ✅ |

**Note:** The DB UNIQUE constraint is named `subscription_signups_email_key` (auto-generated by Postgres at table-creation time). Drizzle's naming convention would be `subscription_signups_email_unique`. Functionally identical; this is the prompt drizzle-kit would offer to "fix" if push were ever attempted.

**Verdict:** ✅ functionally compatible

---

### 8. `service_history`

- Total columns in DB: **15**
- Total columns in `shared/schema.ts`: **15**
- All column names, types, nullability, and defaults match. FK `service_history_user_id_fkey` matches `.references(() => users.id)`.

| Column | DB | schema.ts | Category |
|---|---|---|---|
| `id` | integer NOT NULL, serial | `serial().primaryKey()` | ✅ |
| `user_id` | integer NULL, FK→users.id | `integer("user_id").references(() => users.id)` | ✅ |
| `car_plate` | text NOT NULL | `text("car_plate").notNull()` | ✅ |
| `phone` | text NULL | `text()` | ✅ |
| `service_type` | text NOT NULL | `text("service_type").notNull()` | ✅ |
| `branch` | text NOT NULL | `text().notNull()` | ✅ |
| `amount` | integer NOT NULL | `integer().notNull()` | ✅ |
| `status` | text NOT NULL DEFAULT 'pending' | `text().default("pending").notNull()` | ✅ |
| `queue_position` | integer NULL | `integer("queue_position")` | ✅ |
| `payment_reference` | text NULL | `text("payment_reference")` | ✅ |
| `transaction_id` | text NULL | `text("transaction_id")` | ✅ |
| `check_in_time` | timestamp NULL | `timestamp("check_in_time")` | ✅ |
| `completed_time` | timestamp NULL | `timestamp("completed_time")` | ✅ |
| `notes` | text NULL | `text()` | ✅ |
| `created_at` | timestamp NOT NULL DEFAULT now() | `timestamp("created_at").defaultNow().notNull()` | ✅ |

**Verdict:** ✅ fully matches

---

### 9. `session`

- Total columns in DB: **3** (`sid`, `sess`, `expire`)
- Total columns in `shared/schema.ts`: **0** — table is not declared in the schema file.
- Indexes in DB: `session_pkey` (sid), `IDX_session_expire`.

This table is owned and managed by the `connect-pg-simple` session middleware, not by application code. Drizzle ORM does not need to know about it; the app only reads/writes it through the session middleware. **No action needed.**

**Verdict:** ✅ intentionally absent from schema.ts — correct as-is

---

## Summary

| Category | Count |
|---|---|
| 🟢 Cosmetic differences | **7** (varchar/text on `users` × 2, `cars` × 4; constraint-name mismatch on `subscription_signups.email`) |
| 🟡 Functional differences | **9** (nullability mismatches: `users.is_admin`, `users.points`, `users.level`, `branches.queue_count`, `branches.is_open`, `achievements.created_at`, `user_achievements.user_id`, `user_achievements.achievement_id`, `user_achievements.unlocked_at`) plus the intentional `session` table absence |
| 🔴 Critical issues | **0** |

**Apps currently working:** Yes. The schema file is a safe, slightly-loose mirror of the database. No queries can fail because of these differences:
- `varchar` ↔ `text` is transparent at the protocol level for Drizzle.
- Where the DB is `NOT NULL` and the schema declares the column nullable, all writes either supply a value or rely on the DB-side default; reads always come back non-null. TypeScript will simply allow `null` in places where `null` will never actually appear.

**Recommended action:** **Defer cleanup.** Nothing here justifies a schema change today. When a future schema-change cycle happens (per `docs/SCHEMA_CHANGES.md`), tighten the nullability declarations on the listed columns and optionally swap the `varchar`-typed columns to `varchar({ length: N })` in Drizzle for type-strict modeling. Two specific tidy-ups worth queueing:

1. Correct or remove the misleading comment in `shared/schema.ts` lines 23–32 about `is_admin`/`points`/`level` being nullable in the DB — they are not.
2. Add `.notNull()` to the 9 columns listed above so generated TypeScript types stop reporting `| null` for fields that can never be null.

**Errors encountered during verification:** None. All 9 `psql \d` calls returned cleanly; no DB writes were performed.

---

**File path:** `docs/SCHEMA_VERIFICATION.md`
