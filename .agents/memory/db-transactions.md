---
name: Main db supports real transactions
description: The main Drizzle db is neon-serverless Pool over WebSocket — db.transaction() works; the "Neon HTTP autocommits" caveat is a different driver.
---

# Main db supports real transactions

- `server/db.ts` builds `db` from `drizzle-orm/neon-serverless` with a `Pool` over WebSocket (`neonConfig.webSocketConstructor = ws`). This is **NOT** the Neon HTTP driver.
- Therefore `await db.transaction(async (tx) => { ... })` gives a **real** `BEGIN`/`COMMIT`/`ROLLBACK`. Use `tx.execute(sql\`...\`)` inside; throw to roll back.
- **Pattern for "return an HTTP error mid-transaction without partial commit":** throw a sentinel error (e.g. `Object.assign(new Error(), { __http: { status, body } })`) so the tx rolls back, then translate it in the outer `catch`. Returning early from the callback would COMMIT.

**Why:** the separate `outbox-neon-claim.md` note ("Neon HTTP autocommits, SELECT…FOR UPDATE SKIP LOCKED gives no protection") applies to an HTTP-driver path, and can mislead you into thinking transactions don't work anywhere. They do work on the main `db`.

**How to apply:** any multi-table write that must be atomic (e.g. updating `customers` + linked `users` in one Save) should use `db.transaction`, not sequential `db.execute` calls.
