---
name: SharePoint history import + chart refresh
description: How to (re)import the SharePoint master sales Excel into Postgres and make the admin Top Brands/Models/Customers charts reflect it.
---

# Refreshing SharePoint-derived sales data + the "Top" charts

When the user updates the SharePoint/OneDrive master Excel ("Dummy Master Data Cuci Xpress Sales.xlsx") — e.g. a plate that was previously blank becomes extractable — the way to get it into the DB and into the admin charts:

1. Run `scripts/sharepoint_import_history.ts` (idempotent; skips rows already imported by `legacy_source_row_number`, so previously-skipped rows like a blank-plate row get picked up once the plate is filled). It upserts `cars` by normalized plate, inserts `orders` with `legacy_source='sharepoint'`, then refreshes `cars.total_visits` / `total_spent_cents`.
2. Then run `scripts/recompute_vip_tiers.ts` (cheap, <1s) to re-rank VIP tiers.

**Why both:** The admin Top Brands / Top Models / Top Customers charts are computed **live** from `cars`+`orders` (no materialized views, no cache), so the import alone updates brand/model/spend instantly. BUT `cars.vip_tier` / `vip_rank` (the Gold/Silver/Bronze segments the Top Customers view uses) are stored columns refreshed only by the recompute script — without it, tier labels go stale.

**How to run a long import in this sandbox:** the full scan is ~130k rows and takes ~15 min (Graph API rate-limits with 503/504 + backoff). Do NOT use `nohup`/`setsid &` — the sandbox kills detached processes (0-byte log). Foreground bash caps at 120s. Instead create a temporary console workflow (`configureWorkflow({name, command, outputType:'console'})`), poll `getWorkflowStatus` until state `finished`, then `removeWorkflow`. A one-shot script in a workflow runs once and shows `finished` (it does not loop).

**Data-quality gotcha:** brand/model casing in the source is inconsistent (e.g. `BMW`/`X3` vs `bmw`/`x3`), so the same model can split into two chart rows. Stored verbatim from the Excel `Extracted_Brand`/`Extracted_Model` columns. Only normalize if the user asks.
