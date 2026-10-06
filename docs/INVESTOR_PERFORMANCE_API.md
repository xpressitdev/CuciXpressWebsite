# Cuci Xpress → investor website: public aggregate performance feed

## Status and access

The Cuci Xpress side is implemented in `server/investorPerformance.ts`.
The separate investor project still needs its dashboard wired to this feed.
Publish this source app before using the production endpoint below.

The owner approved public aggregate financial reporting. Anyone who knows the
endpoint can read it. CORS is NOT authentication. No database credentials, API
keys, individual orders, customer identities, employee identities or expense
submissions are shared. Existing owner/admin access controls are unchanged.

Production source URL verified from deployment metadata:

`https://cucixpress.com/api/public/investor-performance?year=2026&quarter=4`

Omit both selectors to request the current Brunei quarter. Supply both to request
a started quarter from Q4 2026 onward. Old Q1–Q3 reports are deliberately outside
this feed, preserving previously disclosed figures and the open Q2 reconciliation.
Future quarters, arbitrary dates, individual branches and unknown query keys are rejected.

## Recommended connection

Add a server-side route in the investor app, such as
`GET /api/performance?year=2026&quarter=4`, which calls the URL above. The investor
browser should call its own `/api/performance` route. A server-to-server adapter
keeps the public-source URL/configuration in one place and provides a clean place
to enforce investor login later.

The current source endpoint needs no key because this data is intentionally
public. Do not copy the Cuci Xpress database connection or staff login credentials
to the other project. For future private reporting BOTH projects must change:
protect the source feed with server credentials and protect the investor app's
proxy/dashboard with investor authentication. Restricting only the dashboard
would leave the original public feed readable.

## Dashboard requirements

- Add a **Q4 2026 — Quarter to date** page and home-page card, leaving old reports intact.
- Show the returned `period.startDate`, `period.endDate` and `period.timezone`.
  Use `period.status`, not the calendar title alone, to distinguish an open quarter
  from a completed period. Q4 ends 31 December; it is not final while still open.
- Financial fields end in `Cents`: divide by 100 only for display, formatting as BND/B$.
- Display revenue, gross profit, EBITDA, recorded depreciation, reported profit
  and profit margin from `totals`; show `months` and `branches`.
- `unallocated` reconciles central revenue/EBITDA to branch totals. Do not invent
  a branch for central subscription or voucher revenue.
- Never replace a `null` profit/depreciation/margin with zero. Null means unavailable
  or incomplete. Show “Pending depreciation configuration” when applicable.
- Display `generatedAt` as “Report generated” and
  `latestSuccessfulExpenseSyncAt` as “Expenses last synced”. They are different.
- Always show the “Unaudited management accounts” label and the profit definition:
  **EBITDA less recorded depreciation; financing and income tax not separately modelled.**
- Display `reportingPolicies` in a compact reporting-basis section, including voucher
  revenue timing and partial-period depreciation.
- If `dataQuality.provisional` is true, mark figures provisional and display the
  returned warnings. Respect individual branch `dataQuality` too.
- No POS records is a warning, not evidence that actual sales were zero.
- Fetch on page load; poll at most once per five minutes. Provide a manual refresh
  button, but explain that source snapshots are cached for up to five minutes.
- Errors must show unavailable/stale state, not invented or zero financial figures.
  A retained last-good response must retain its original timestamps and show a
  prominent stale badge. Never silently fall back to the historical Excel totals.
- Do not claim quarter-on-quarter growth against unreconciled historical figures.

## Payload (schemaVersion 1)

Top-level keys: `schemaVersion`, `currency`, `amountUnit`, `access`, `period`,
`generatedAt`, `refreshAfterSeconds`, `latestSuccessfulExpenseSyncAt`,
`dataQuality`, `totals`, `months`, `branches`, `unallocated`, `reportingPolicies`.

The totals/month/branch metrics are:
`revenueCents`, `posNetRevenueCents`, `subscriptionRevenueCents`,
`voucherRevenueCents`, `costOfServicesCents`, `grossProfitCents`,
`operatingExpensesCents`, `unmappedExpensesCents`, `ebitdaCents`,
`depreciationCents`, `reportedProfitCents`, `reportedProfitMarginPercent`.

No extra category-level expenses or raw records should be requested for this public feed.

## Operational behavior

The source caches reports for five minutes and coalesces concurrent requests.
Report dates use Asia/Brunei, and partial-month depreciation is prorated by the
existing P&L service. This endpoint reads reporting data; it does not run imports,
expense syncs, modify records or touch historical reports.

The existing expense-sync worker continues to supply the P&L. API availability
is not proof of complete accounting records or a completed sync: display the
coverage warnings and source timestamps.

HTTP errors:
- 400: invalid/unsupported period or unknown parameters.
- 429: too many requests (60 per minute per IP, process-local); respect Retry-After.
- 503: reporting unavailable; retry after 30 seconds; never render zero totals.

Source CORS permits the published investor site's exact origin:
`https://cucixpress-investors.replit.app`. Server-to-server requests do not need CORS.

## Ready-to-paste request for the investor project's Replit Agent

Connect this investor website to the public aggregate performance API at
https://cucixpress.com/api/public/investor-performance?year=2026&quarter=4.
First verify the source endpoint returns schemaVersion 1 (the source app must
be republished before it is available). Implement a same-origin server proxy
at /api/performance and add a Q4-to-date dashboard/home card using the returned
totals, monthly results and branch results. Keep existing published quarterly
reports unchanged. Format integer cents as BND. Show the reporting date range,
report-generation timestamp, expense-sync timestamp, provisional warnings,
unallocated streams and unaudited reporting policies. Render null depreciation
or profit as unavailable, never zero. Handle failures explicitly and poll no
more than once per five minutes. Do not copy any database credentials or staff
credentials. The owner permits public aggregates for now; keep the server proxy
as the boundary where investor authentication can be added later. Test the
dashboard, then ask the owner to publish this investor project.
