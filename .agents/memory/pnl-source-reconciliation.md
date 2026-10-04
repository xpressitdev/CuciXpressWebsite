---
name: P&L source reconciliation
description: Why live financial reporting must not be forced to match the uploaded historical workbook.
---

Use the historical P&L workbook as a category/layout reference, not an authoritative balancing total for live expenses.

**Why:** Inspection found different June expense totals in the exported form entries, the P&L workbook, and the later live Connecteam data. Expenses can be submitted late or revised, and old POS revenue has separate source lineage. Adjusting figures merely to match the workbook would hide real differences.

**How to apply:** Keep source IDs, expense dates, sync timestamps and review flags traceable. Show differences and incomplete configuration openly. Do not seed workbook expense totals alongside live submissions or silently add balancing adjustments.

Advance Salary is informational only, not a P&L expense.

**Why:** The owner explicitly said advance salary is just an indicator for them and must not be considered part of expenses.

**How to apply:** Preserve the source entries for inspection, but exclude them from expense/profit calculations and recurring-expense expectations, including historical reports. Regular salary remains an expense.

Connecteam may return identical duplicate submissions in a fully paginated response.

**Why:** A live October 2026 sync returned two repeated IDs with identical sanitized content, causing an otherwise complete snapshot to be rejected.

**How to apply:** Deduplicate identical sanitized content by submission ID before persistence; still reject conflicting duplicates and incomplete pagination. Do not count repeats as additional expenses.

New P&L exclusion statuses need persistence tests against the actual migrated database constraints, not only allocation-planning unit tests.

**Why:** The advance-salary change passed calculation tests but blocked live sync because both the allowed-status and branch/category-shape constraints still rejected the new allocation.

**How to apply:** Verify the status and allocation shape can both be saved on staging before applying a new classification to live sync.

Expenses-only staff access is read-only COS/OPEX visibility, not a general admin or investor grant.

**Why:** The owner requested an account that can see expenses without revenue or profit. Existing broad staff-only and hybrid endpoints make merely hiding admin tabs insufficient.

**How to apply:** Enforce an API allowlist for this role and return an explicitly limited expense payload. Do not activate a new restricted-role account before the live deployment enforces those restrictions.