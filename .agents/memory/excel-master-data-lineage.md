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
