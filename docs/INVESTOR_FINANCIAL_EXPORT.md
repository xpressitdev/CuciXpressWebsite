# Protected Q3 financial export — source/consumer handoff

## Scope and activation

Publish the updated **Cuci Xpress source project** before connecting the consumer.
The investor app is a separate project and has not been modified here.
The existing public summary stays backward-compatible:

`GET https://cucixpress.com/api/public/investor-performance?year=2026&quarter=3`

Detailed financial export:

`GET https://cucixpress.com/api/integrations/investor/financial-export?year=2026&quarter=3`

This is **read-only, server-to-server**, not a public dashboard data endpoint.
Only completed quarters from Q3 2026 onward are accepted. Both selectors are
required; use the explicit Q3 URL to keep this report pinned to July–September.
The API does not import, sync or modify financial data.

## Authentication and revocation

- Source secret: `INVESTOR_EXPORT_API_KEY`, configured using secure secret storage.
- Add **the same value** securely to the investor project's server secrets.
  Never put it in a `VITE_*`/`NEXT_PUBLIC_*` variable, HTML, frontend code, URLs,
  chat, logs, stored report payloads or screenshots.
- Send `Authorization: Bearer <the server-side secret>`.
- This credential grants access only to this read-only export route. It does not
  grant staff login, raw SQL, customer data or administrative mutations.
- The source fails closed when the secret is missing or shorter than 32 characters.
  Use a randomly generated key of 32–512 characters, not a staff password.
- Rotate the source key and securely update the consumer to revoke old access.
  Removing the source secret disables exports. Restart/republish affected servers
  as necessary to activate secret changes in their running environments.
- CORS is intentionally not enabled. CORS is not the authentication mechanism.
- An approved investor report can remain public. **The raw financial export,
  transaction details and import controls must not become public through the
  investor app.** Keep raw snapshots in server-only storage; public responses
  should project only owner-approved aggregate tables/charts.

## Monthly owner workflow — no polling

1. An authenticated owner triggers an import using a protected admin action or a
   server-side maintenance command. Public visitors cannot trigger imports.
2. The investor server fetches the complete export and validates it.
3. Persist the original export as an immutable, private draft in durable storage.
   Use `exportId` to prevent duplicate imports; verify `contentFingerprint` to
   detect content changes. Do not use an ephemeral server filesystem or memory.
4. Show a private review with reconciliations, source warnings and availability.
   Do not auto-approve a response just because its HTTP status is 200.
5. The owner approves an aggregate presentation derived from that snapshot.
   Visitors see that approved version only, never live source fetches.
6. A failed import must preserve the prior approved version and show the owner
   an explicit error. No fallback to zeros, historical Excel totals or Q4.

No cron, interval polling, public refresh button or upstream fetch on page load.
`refreshAfterSeconds` on the old public summary does not control this workflow.

## Consistency, revisions and complete retrieval

Schema version: **1**. Currency: **BND**. Monetary values: **integer cents**.
Dates and recognition use **Asia/Brunei**.

Each request runs all source reads and all P&L calculations inside one PostgreSQL
**REPEATABLE READ, READ ONLY transaction**, including voucher revenue. The whole
export is one JSON response, with **no pagination**. Do not combine records from
two requests. A subsequent request gets a new export ID and may reflect revisions.

- `schemaVersion`, `exportId`, `generatedAt`: identity and generation time.
- `requestedPeriod`: year, quarter, exact start/end and completed-period status.
- `actualCoverage`: observed source date spans. A subscription service interval
  may span outside Q3, but only Q3's recognised contribution lines are included.
- `latestSuccessfulExpenseSyncAt`: expense source freshness, not the generation date.
- `consistency`: full-response and transaction rules.
- `contentFingerprint`: SHA-256 of the JSON representation of
  `{period: requestedPeriod, statements, datasets, accounts}`, using the received
  object/key order. It detects content changes; it is not a signature.
- Each financial contribution has a stable `id`, source type/ID, accounting date,
  branch ID (nullable), account code, amount and content-hash `revision`.
- `updatedAt`/`sourceUpdatedAt` appear where reliably held. A null update timestamp
  means unavailable, not “never changed”. Compare revisions across snapshots.
- IDs for calculated fee groups and recognition contributions are derivation IDs,
  not invented journal IDs.

The server returns no partial export. It rejects responses above 50 MiB (413)
and more than 250,000 contribution records fail with a sanitized 503. A larger
export requires a future immutable snapshot/pagination extension; do not treat
an interrupted JSON download as a valid snapshot.

## Statements and account mappings

`statements.company` and each `statements.branches[]` entry contain:
- `totals`: existing P&L line keys and cents; `profit_margin_bps` is basis points,
  **not money** (divide by 100 to display a percentage).
- `months[]`: July, August and September with the same line keys.
- `coverage`: source status, missing depreciation months, observed dates and
  sanitized warning codes/counts.

`statements.centralAndNoncanonical` is company less the five canonical branches.
Do not allocate those differences arbitrarily.

`accounts.records` maps explicit stable export codes to exact P&L keys, labels
and sections. This is a **reporting mapping, not a statutory chart of accounts**.
The source does not hold the investor app's January–June account codes. The
consumer must map its old categories explicitly, preserve original labels/codes
and show unmatched items; never silently force the new figures into old totals.

Examples:
- `REV.POS` → `pos_net_revenue`
- `REV.SUBSCRIPTION` → `recognized_subscription_revenue`
- `REV.VOUCHER` → `voucher_sales_revenue`
- `COS.WATER` → `expense:Water Bill`
- `COS.STAFF_WAGES` → `expense:Staff Wages`
- `OPEX.RENT` → `expense:Total Units Rental`
- `OPEX.MDR` → `merchant_discount_rate`
- `EXP.UNMAPPED` → `unmapped_expenses`
- `EXP.DEPRECIATION` → `depreciation`

All remaining mappings are returned in `accounts.records`; use those, not a
positional list. Source subcategories are not maintained and are null.

## Dataset meanings

- `financialContributions`: actual POS, allocated expenses, paid voucher sales,
  explicitly derived subscription revenue/fees and monthly depreciation charges.
  No plates, customer/staff identities, buyer names, payment references, private
  documents, free-text notes or payment tokens.
- `categoryTotals`: contribution totals by account, month and canonical branch,
  with central/noncanonical amounts separate.
- `exclusionsAndExceptions`: available excluded/removed expenses, undated expense
  exceptions, void/pending dated POS records and voided vouchers. This is not a
  complete mutation audit. Undated records are not assigned to Q3.
- `depreciationCharges`: actual configured monthly branch amounts. A recorded
  zero is valid. Missing settings remain missing, with reported profit and
  depreciation null in statements where incomplete.
- `journalEntries`, `balances`, `cashFlow`, `fixedAssets`,
  `completeRevisionHistory`: explicitly unavailable for this export, with
  `records: null` and a reason. Do not construct fake balanced journals, opening
  balances, bank accounts, asset registers or accumulated depreciation.

Recorded POS refunds have signed gross/refund components and available refund
event timestamps. The P&L uses the original realization day, not a cash-flow date.
Legacy signs are retained exactly. Counter subscription recognition may relate
to an earlier collection; recognised revenue is not cash collected during Q3.
MDR is computed using current rates and monthly branch/payment group rounding;
derived group charges reference their underlying group, without invented
per-transaction fee allocations. Subscription revenue includes the existing
legacy fallback where no paid invoice exists, disclosed by source type.

## Reconciliation and approval

`reconciliation.checks` checks every mapped account for each month and the quarter,
both company-wide and for each branch. It includes detail cents, report cents,
difference, status and reason. `monthlyToQuarterly` checks additive P&L lines.
`categoryTotals` is directly aggregated from the contribution records.

Require all differences to be zero before routine approval; route differences
to explicit owner review rather than manufacturing adjustments. Matched arithmetic
does not imply audited or complete statutory accounts. Check availability and
coverage separately. Missing depreciation may coexist with matched recorded
charges; unavailable totals must remain null.

The export uses the same P&L computation as the public summary. That endpoint
has a short passive cache and may show a different revision if fetched separately.
Compare dates/timestamps and investigate any difference; the export's internal
reconciliation is from its one consistent snapshot.

Unaudited reported profit = **EBITDA less configured depreciation**. Financing
and income tax are not separately modelled. Paid physical voucher revenue is
recognised fully at sale; advance salary is informational. Keep the returned
`reportingPolicies` visible in the approved report.

## Verification results — 7 October 2026, workspace source

Actual Q3 source export:
- Period: **1 July–30 September 2026**, three months.
- **10,001** contribution records; approximately **5.05 MB** JSON.
- Every company/branch/month/account check matched; no monthly-to-quarterly differences.
- **528 account reconciliation checks** matched. The actual authenticated HTTP
  export returned 200, anonymous access returned 401, its content fingerprint
  verified and its revenue/EBITDA/depreciation/profit matched the public summary.
- Type check, **50 tests**, production build and public app preview passed.
- Revenue **BND 83,142.40**.
- EBITDA **BND 4,524.08**.
- Configured depreciation **BND 2,125.05**, complete.
- Reported profit **BND 2,399.03**.

These are verification observations, not frozen investor approvals. The published
endpoint must still be checked after publishing. Future source revisions must
not overwrite previously approved snapshots.

## Errors and limits

- 400: missing/unknown selectors, unsupported or unfinished quarter.
- 401: invalid/missing Bearer credential; never retry with a staff password.
- 413: response too large; no partial result.
- 429: one export at a time / at most three attempts per minute per process.
  This is a best-effort resource limit across autoscaled instances.
- 503: unconfigured credential or temporary export failure. Respect Retry-After.

Use a bounded server timeout (for example 120 seconds), manual retries and response
schema validation. Do not install a periodic retry worker.

## Prompt for the investor project's Agent

Integrate the protected source endpoint
https://cucixpress.com/api/integrations/investor/financial-export?year=2026&quarter=3.
Ask for INVESTOR_EXPORT_API_KEY through secure secrets tooling; the owner must
provide the same key configured in the source app. Keep it server-only and send
it as a Bearer Authorization header. Verify the published route is available.
Implement an owner-only import, private immutable draft storage, reconciliation
review and explicit approval. No polling or source fetches by visitors. Public
report pages must expose approved aggregate results only, never raw exports,
transaction details or credentials. Render the company/branch monthly and
quarterly P&L using the export's stable account mappings; explicitly map the
existing January–June categories and retain unmatched items. Preserve previously
issued reports, source dates, warnings and policies. Unavailable datasets and
null amounts must stay unavailable. Do not claim BDAS-complete statements or
invent journals, balances, assets or cash-flow classifications. Validate schema,
record count, period, fingerprint and reconciliation before allowing approval.
Read this handoff document for the exact schema and consistency rules.
