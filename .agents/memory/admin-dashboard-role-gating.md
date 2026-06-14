---
name: Admin DashboardTab role visibility
description: DashboardTab is shown to ALL staff incl cashiers; owner/manager-only widgets must be UI-gated
---

The admin Dashboard tab (`DashboardTab` in `client/src/pages/admin.tsx`) is the
one tab every staff role can open, including cashiers. Most other tabs are wrapped
in `isOwner` / `isManagerOrOwner` checks, but the dashboard TabsContent is not.

**Rule:** any widget added to DashboardTab that calls an owner/manager-only
endpoint must be role-gated in the component itself (read `useStaffAuth()`,
check `staff?.role`), or cashiers get a permanent "failed to load" error from a
401/403. Server-side gating alone is not enough — it just produces a broken panel.

**Why:** the Accounts & Logins panel's stats endpoint is owner/manager-only;
rendering it unconditionally broke the cashier dashboard UX.
