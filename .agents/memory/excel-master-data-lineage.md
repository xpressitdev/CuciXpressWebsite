---
name: Excel master vs app DB data lineage
description: Why the OneDrive "Dummy Master Data" sales sheet never perfectly ties to the app's Order Report for pre-live months.
---

# OneDrive master sheet vs live DB are two separate lineages (pre-live period)

The OneDrive "Dummy Master Data" sales workbook and the app's own database are
**different recordings of the same real-world months** for the pre-go-live period,
not copies of each other.

- Spreadsheet rows for that period carry **legacy KedaiPOS numeric receipt numbers**
  (e.g. `634462`) in the ID column (B).
- The app DB orders carry **UUID** ids.
- For a sampled month (March 2026) the two share **0 order ids** — they cannot be
  reconciled row-by-row, and small per-month total/count differences (March: sheet
  5302 rows / B$52,293.70 vs DB 5064 rows / B$51,646.44, +B$647) are
  system/import differences, **not** app reporting bugs or duplicate exports.

**Why:** The DB's historical years (2022–2026) appear to be a re-keyed import of the
old KedaiPOS data (assigned fresh UUIDs), while the workbook keeps the original
KedaiPOS export rows. The live outbox export (UUID ids) only started later, so early
2026 months in the sheet are pure legacy KedaiPOS, never app-exported.

**How to apply:** When asked "the order reports don't tally" between the OneDrive
sheet and the web app, do NOT assume duplicate exports or an app bug. The web Order
Report matches the live DB to the cent. The divergence lives in the sheet's legacy
content. To compare a month: pull sheet column C (Receipt Date serial, Brunei-based
via dateToExcelSerial) to locate the contiguous month block, then B (id) + R (Order
Total). Read Graph ranges in small chunks with retries and strict length checks — a
dropped chunk silently misaligns separate single-column reads, so read the B:R block
together per chunk. Reconciling the sheet to the DB requires deciding which system is
source-of-truth for the overlap period; it's a destructive business decision — ask
first.

# Quarter/period reconciliation gotchas (sheet vs DB)

- **Row source tag (col A / Source.Name) tells lineage.** App-exported rows are
  `cucixpress_pos`; legacy rows are blank `""` or an import filename
  (`excel_order_*.xlsx`). Filter on this to isolate live-app rows from legacy — they
  sit contiguously at the **tail** of the sheet (appends go to the end), so a live-app
  check only needs to scan the last few thousand rows, not the whole 130k+ file.
- **Legacy refunds are in the sheet but NOT in the DB.** The old KedaiPOS export
  writes a separate NEGATIVE Order-Total (R) refund row per reversal, so `SUM(R)` on
  the sheet is net-of-refunds. The history import brought in **sale rows only** — the
  DB has zero legacy refunds and no negative-total orders. So for legacy months the
  sheet's net < its gross while the DB's net ≈ gross. This is the single biggest driver
  of a pre-live quarter mismatch (sheet net slightly HIGHER than DB net once you also
  add the small legacy gross drift).
- **Date basis differs by design.** Sheet buckets sales by receipt date = `created_at`
  (refunds by `refunded_at`); the app dashboard buckets by `bizDay()` (claimed_at for
  pocket_pay). To compare sheet-vs-DB use `created_at`/`refunded_at`, NOT bizDay, or
  web-QR orders shift across the period edge.
- **append+retry can double-write a live-app row.** OneDrive can hold a few MORE
  `cucixpress_pos` rows than `sharepoint_outbox` has `sent` (append succeeded but the
  response timed out, so the retry appended again). Expect the live-app portion to tie
  to within a handful of rows / sub-1%, with refund totals matching to the cent — not
  a bug in accounting, a delivery-idempotency artifact.

# Full legacy backfill outcome (owner-approved inclusive rules)
After importing ALL remaining legacy rows under the 4 approved rules (no-plate rows
imported untied, Pandan as its own closed branch, "Cuci Xpress"→Tungku, refunds
netted), the app Order Report **net rose from ~B$674k to ~B$1.309M**, landing ~4%
(~B$52.6k) ABOVE the Power BI master's $1,256,805.26 — expected, not a bug. **Why over,
not under:** the inclusive rules deliberately add rows the master's headline figure may
exclude/dedupe differently (all no-plate rows ≈ B$371k net, closed Pandan branch ≈
B$215k, refunds netted at full order-total). A cent-exact match to that single master
number was never achievable given the sheet's own lineage quirks; the goal was to close
the ~B$580k gap, which it did. Don't chase the residual few-percent by deleting
approved-rule rows without asking.
