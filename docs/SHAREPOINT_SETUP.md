# SharePoint Integration — One-time Setup Guide

**Time required:** ~15 minutes
**Cost:** $0 (Microsoft Graph API is free; you already pay for SharePoint via M365)
**Who can do this:** Anyone with **Global Admin** or **Application Admin** role on your Microsoft 365 tenant

This guide walks you through registering an Azure AD app so cucixpress.com can write POS sales rows directly into your SharePoint Excel master file. Power BI continues to bind to the same Excel table — no Power BI changes needed.

---

## What you'll end up with

Three secrets to paste into Replit:
- `SHAREPOINT_TENANT_ID`
- `SHAREPOINT_CLIENT_ID`
- `SHAREPOINT_CLIENT_SECRET`

Plus four "where is the file" settings:
- `SHAREPOINT_SITE_HOST` — e.g. `cucixpress.sharepoint.com`
- `SHAREPOINT_SITE_PATH` — e.g. `/sites/CuciXpress` (leave blank if file is on the tenant root)
- `SHAREPOINT_FILE_PATH` — e.g. `/Shared Documents/Master_Data_Cuci_Xpress_Sales.xlsx`
- `SHAREPOINT_TABLE_NAME` — defaults to `Table1` (whatever the Excel table is named — check by clicking the table in Excel and looking at the "Table Design" tab)

---

## Step 1 — Register the app in Azure AD

1. Go to **https://entra.microsoft.com** and sign in with your M365 admin account.
2. In the left sidebar, click **Applications → App registrations**.
3. Click **+ New registration** at the top.
4. Fill in:
   - **Name:** `CuciXpress POS Sync`
   - **Supported account types:** *Accounts in this organizational directory only (Single tenant)*
   - **Redirect URI:** leave blank
5. Click **Register**.

You'll land on the app's overview page. Copy these two values:
- **Application (client) ID** → this is your `SHAREPOINT_CLIENT_ID`
- **Directory (tenant) ID** → this is your `SHAREPOINT_TENANT_ID`

---

## Step 2 — Create a client secret

1. In the left sidebar of the app page, click **Certificates & secrets**.
2. Click **+ New client secret**.
3. Description: `CuciXpress POS Sync`
4. Expires: **24 months** (set a calendar reminder to rotate it then)
5. Click **Add**.
6. **IMMEDIATELY** copy the **Value** column — this is your `SHAREPOINT_CLIENT_SECRET`. Microsoft hides it forever after you leave this page.

---

## Step 3 — Grant API permissions

1. In the left sidebar, click **API permissions**.
2. Click **+ Add a permission**.
3. Choose **Microsoft Graph**.
4. Choose **Application permissions** (NOT delegated — we're a server, not a user).
5. Search for and tick **`Files.ReadWrite.All`**.
6. Click **Add permissions**.
7. Back on the API permissions page, click **✓ Grant admin consent for [your tenant]**. Confirm.

The permission row should now show a green check under "Status".

---

## Step 4 — Find your file's address

You need three pieces:

### `SHAREPOINT_SITE_HOST`
Open SharePoint in your browser. Look at the URL — the part before `.sharepoint.com` is your tenant name. For example, if the URL is `https://cucixpress.sharepoint.com/...`, then:
```
SHAREPOINT_SITE_HOST = cucixpress.sharepoint.com
```

### `SHAREPOINT_SITE_PATH`
Navigate to the SharePoint site that contains your Excel file. Look at the URL:
- `https://cucixpress.sharepoint.com/sites/CuciXpress/...` → `SHAREPOINT_SITE_PATH = /sites/CuciXpress`
- `https://cucixpress.sharepoint.com/Shared%20Documents/...` (no `/sites/` segment) → leave `SHAREPOINT_SITE_PATH` blank

### `SHAREPOINT_FILE_PATH`
This is the path to the Excel file *inside* the site's document library. For example, if your file lives in the default `Shared Documents` library:
```
SHAREPOINT_FILE_PATH = /Shared Documents/Master_Data_Cuci_Xpress_Sales.xlsx
```

If it's in a subfolder:
```
SHAREPOINT_FILE_PATH = /Shared Documents/Sales/Master_Data_Cuci_Xpress_Sales.xlsx
```

### `SHAREPOINT_TABLE_NAME`
Open the Excel file. Click anywhere inside the data table. A new ribbon tab called **Table Design** appears at the top. The first field on the left is **Table Name** — that's the value to use. Default is `Table1`.

---

## Step 5 — Paste secrets into Replit

In the Replit project, open **Tools → Secrets** and add these 7 keys (3 secrets + 4 plain-text settings):

| Key | Value |
|---|---|
| `SHAREPOINT_TENANT_ID` | from Step 1 |
| `SHAREPOINT_CLIENT_ID` | from Step 1 |
| `SHAREPOINT_CLIENT_SECRET` | from Step 2 |
| `SHAREPOINT_SITE_HOST` | from Step 4 |
| `SHAREPOINT_SITE_PATH` | from Step 4 (or leave unset for tenant root) |
| `SHAREPOINT_FILE_PATH` | from Step 4 |
| `SHAREPOINT_TABLE_NAME` | from Step 4 (default `Table1`) |

Once added, restart the workflow. You should see this in the logs:

```
[sharepoint-outbox] worker started — site=...
```

If you see this instead, you're missing one of the env vars:

```
[sharepoint-outbox] SharePoint not configured — worker idle
```

---

## Step 6 — Test the connection

As an owner-role staff user, hit:

```
POST /api/admin/integrations/sharepoint/test
```

You should get back something like:
```json
{
  "ok": true,
  "configured": true,
  "reachable": true,
  "tableName": "Table1",
  "rowCount": 129185
}
```

If `reachable: false`, the `error` field tells you what's wrong:
- **403** — admin consent wasn't granted (redo Step 3)
- **404** — site or file path is wrong (recheck Step 4)
- **401** — secret is wrong or expired

---

## Step 7 — Watch the first real sale flow

1. Make a test sale at `/pos`.
2. Within ~30 seconds, the background worker picks it up and appends a row to your SharePoint Excel.
3. Hit `GET /api/admin/integrations/sharepoint` and look for the row under `recent`. Status should be `sent`.
4. Open the Excel file in SharePoint — you'll see a new row at the bottom with `Source.Name = "cucixpress_pos"` and `Order Number = "CX-1"`.
5. Refresh your Power BI report — the new row appears.

---

## Troubleshooting

**Q: I see rows piling up as `pending` and never sending.**
A: The worker only starts if all required env vars are set. Restart the workflow after adding secrets and check logs for `worker started`.

**Q: Rows are going to `failed` after 8 attempts.**
A: Check `last_error` in the snapshot — it will tell you whether it's an auth issue (rotate secret), a path issue (fix env var), or a table-shape issue (the table doesn't have 25 columns, or columns are in a different order).

**Q: I added a new column to the Excel table — what now?**
A: The append code sends exactly 25 values per row in a fixed order. If you change the Excel table shape, ping the developer to update `buildExcelRow()` in `server/integrations/sharepointOutbox.ts`.

**Q: How do I know what the worker is doing?**
A: The Replit logs show `[sharepoint-outbox] drained N: sent=X, failed=Y` every time it processes a batch (silent if there's nothing to do). The admin endpoint `GET /api/admin/integrations/sharepoint` gives a live snapshot.

**Q: What if SharePoint is down for hours?**
A: Nothing breaks. Outbox rows queue indefinitely as `pending` with exponential backoff (max 2-hour wait between retries). When SharePoint comes back, the next tick drains the backlog.
