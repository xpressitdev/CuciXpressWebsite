---
name: Staff role write-route audit
description: How to fully enforce a read-only (or any restricted) staff role — write endpoints are NOT confined to the obvious namespaces.
---

# Staff role write-route audit

When adding a restricted staff role (e.g. read-only `investor`), gating the
`/api/pos/*` and `/api/admin/*` namespaces is NOT enough. Operational mutation
routes live outside those prefixes under bare `requireStaff`, e.g.
`/api/verify-qr`, `/api/add-to-queue`, `/api/kedaipos/queue/:id`,
`/api/service-history` (POST + PATCH).

**Why:** the route file mixes legacy KedaiPOS/integration endpoints into the
top level; namespace-based reasoning silently misses them and the new role
keeps write access.

**How to apply:** audit with a whole-file grep of every write verb —
`rg "app\.(post|patch|delete|put)\(" server/routes.ts | rg requireStaff | rg -v requireStaffRole`
— then add `requireStaffRole(...allowed)` to each operational route to exclude
the restricted role. `/api/auth/staff/logout` is the only bare-`requireStaff`
write that should stay open to every staff role.
