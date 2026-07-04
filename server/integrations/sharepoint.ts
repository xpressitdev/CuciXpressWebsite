// ============================================================================
// server/integrations/sharepoint.ts
//
// Microsoft Graph integration for appending POS sales rows into the
// company SharePoint Excel master file. Power BI binds to the same
// Excel table — no Power BI changes needed.
//
// Auth model: client_credentials (app-only). The Azure AD app needs
// ONE permission: Microsoft Graph > Files.ReadWrite.All (Application).
// Optionally Sites.ReadWrite.All if the site is a SharePoint Site
// (not OneDrive). Setup guide: docs/SHAREPOINT_SETUP.md.
//
// Required env (all optional — module is inert if any are missing):
//   SHAREPOINT_TENANT_ID       Azure AD tenant GUID
//   SHAREPOINT_CLIENT_ID       App registration client ID
//   SHAREPOINT_CLIENT_SECRET   App registration secret
//   SHAREPOINT_SITE_HOST       e.g. cucixpress.sharepoint.com
//   SHAREPOINT_SITE_PATH       e.g. /sites/CuciXpress  (leave blank for root)
//   SHAREPOINT_FILE_PATH       e.g. /Shared Documents/Master_Data_Cuci_Xpress_Sales.xlsx
//   SHAREPOINT_TABLE_NAME      defaults to 'Table1'
// ============================================================================

const TOKEN_BUFFER_MS = 60_000; // refresh access token 60s before expiry

type TokenCache = { token: string; expiresAt: number } | null;
let tokenCache: TokenCache = null;

let cachedDriveItemPath: string | null = null;

// The export's rightmost column. Appends send one value per table column, so
// this column must exist in the live Excel table before 26-value rows are sent.
// ensureFeeColumn() adds it on demand; feeColumnEnsured caches success so we
// don't re-check every batch.
export const FEE_COLUMN_NAME = 'Transaction Fee';
let feeColumnEnsured = false;
let ensureFeeColumnInFlight: Promise<void> | null = null;

// Two drive types are supported:
//   * 'site' — file lives in a SharePoint Team Site library
//             (URL host like: cucixpress.sharepoint.com/sites/Foo/...)
//   * 'user' — file lives in a user's OneDrive for Business
//             (URL host like: cucixpress-my.sharepoint.com/personal/...)
// We auto-detect: if SHAREPOINT_USER_EMAIL is set, mode='user'.
// Otherwise we assume 'site'.
export type DriveType = 'site' | 'user';

export interface SharePointConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  driveType: DriveType;
  // Used when driveType='site'
  siteHost: string;
  sitePath: string;       // may be empty string for tenant root
  // Used when driveType='user' (OneDrive)
  userEmail: string;
  // Path inside the drive's root, with leading '/'
  filePath: string;
  tableName: string;
}

export function loadSharePointConfig(): SharePointConfig | null {
  const tenantId     = process.env.SHAREPOINT_TENANT_ID;
  const clientId     = process.env.SHAREPOINT_CLIENT_ID;
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET;
  const filePath     = process.env.SHAREPOINT_FILE_PATH;
  const userEmail    = process.env.SHAREPOINT_USER_EMAIL ?? '';
  const siteHost     = process.env.SHAREPOINT_SITE_HOST ?? '';

  if (!tenantId || !clientId || !clientSecret || !filePath) return null;

  const driveType: DriveType = userEmail ? 'user' : 'site';
  // For 'site' mode we MUST have a host; for 'user' mode the host is
  // implicit in the user's tenant.
  if (driveType === 'site' && !siteHost) return null;

  return {
    tenantId,
    clientId,
    clientSecret,
    driveType,
    siteHost,
    sitePath: process.env.SHAREPOINT_SITE_PATH ?? '',
    userEmail,
    filePath: filePath.startsWith('/') ? filePath : `/${filePath}`,
    tableName: process.env.SHAREPOINT_TABLE_NAME ?? 'Table1',
  };
}

export function isSharePointConfigured(): boolean {
  return loadSharePointConfig() !== null;
}

// ---------------------------------------------------------------------------
// Access token (client_credentials)
// ---------------------------------------------------------------------------
async function getAccessToken(cfg: SharePointConfig): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - TOKEN_BUFFER_MS > now) {
    return tokenCache.token;
  }
  const url = `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`token_request_failed_${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json() as { access_token: string; expires_in: number };
  tokenCache = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return json.access_token;
}

// ---------------------------------------------------------------------------
// Resolve site -> drive item path (cached for the process lifetime)
// ---------------------------------------------------------------------------
async function resolveDriveItemPath(cfg: SharePointConfig): Promise<string> {
  if (cachedDriveItemPath) return cachedDriveItemPath;
  const token = await getAccessToken(cfg);

  const encodedFilePath = cfg.filePath
    .split('/')
    .map(seg => encodeURIComponent(seg))
    .join('/');

  if (cfg.driveType === 'user') {
    // OneDrive for Business. The user is identified by their UPN
    // (email). Graph endpoint:
    //   /users/{upn}/drive/root:/path/to/file.xlsx
    cachedDriveItemPath =
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.userEmail)}/drive/root:${encodedFilePath}`;
    return cachedDriveItemPath;
  }

  // SharePoint Team Site. Resolve site id first.
  const sitePath = cfg.sitePath.replace(/^\/+|\/+$/g, '');
  const siteUrl = sitePath
    ? `https://graph.microsoft.com/v1.0/sites/${cfg.siteHost}:/${sitePath}`
    : `https://graph.microsoft.com/v1.0/sites/${cfg.siteHost}`;
  const siteRes = await fetch(siteUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!siteRes.ok) {
    const t = await siteRes.text();
    throw new Error(`site_lookup_failed_${siteRes.status}: ${t.slice(0, 300)}`);
  }
  const site = await siteRes.json() as { id: string };
  cachedDriveItemPath = `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/root:${encodedFilePath}`;
  return cachedDriveItemPath;
}

// Reset caches — used by the admin "test connection" flow so a config
// change takes effect without restarting the server.
export function resetSharePointCaches() {
  tokenCache = null;
  cachedDriveItemPath = null;
  feeColumnEnsured = false;
}

// ---------------------------------------------------------------------------
// Ensure the configured Excel table has the "Transaction Fee" column as its
// last column. Idempotent and process-cached.
//
// Appending a row to an Excel Table requires exactly one value per table
// column, so the table must be 26-wide before the export sends its 26th value.
// This lets each environment self-heal its OWN configured file: dev adds the
// column to its dummy sheet, production adds it to the master on boot — no
// manual Excel step, and it safely covers the dev+prod dual-drainer setup.
//
// Historical rows get blank cells for the new column (their fee was never
// tracked in the sheet). Throws on failure so callers can retry.
// ---------------------------------------------------------------------------
export async function ensureFeeColumn(): Promise<void> {
  if (feeColumnEnsured) return;
  // Single-flight: concurrent callers (30s tick + manual "drain now" + backfill)
  // share one in-flight attempt so they can't each POST a duplicate column.
  if (ensureFeeColumnInFlight) return ensureFeeColumnInFlight;
  ensureFeeColumnInFlight = doEnsureFeeColumn()
    .then(() => { feeColumnEnsured = true; })
    .finally(() => { ensureFeeColumnInFlight = null; });
  return ensureFeeColumnInFlight;
}

// Force the next ensureFeeColumn() to re-verify against the live table. Call
// this if an append/update fails on a column/width mismatch (e.g. the column
// was manually removed) so the worker self-heals instead of looping forever.
export function invalidateFeeColumnCache() {
  feeColumnEnsured = false;
}

async function doEnsureFeeColumn(): Promise<void> {
  const cfg = loadSharePointConfig();
  if (!cfg) throw new Error('sharepoint_not_configured');
  const token = await getAccessToken(cfg);
  const driveItemPath = await resolveDriveItemPath(cfg);
  const base = `${driveItemPath}:/workbook/tables/${encodeURIComponent(cfg.tableName)}/columns`;

  // List existing column names (also used to re-check after a failed add).
  const listColumnNames = async (): Promise<string[]> => {
    const res = await fetch(`${base}?$select=name`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const t = await res.text();
      if (res.status === 401) tokenCache = null;
      throw new Error(`columns_list_failed_${res.status}: ${t.slice(0, 300)}`);
    }
    const j = (await res.json()) as { value?: Array<{ name?: string }> };
    return (j.value ?? []).map(c => (c.name ?? '').trim());
  };

  const names = await listColumnNames();
  if (names.includes(FEE_COLUMN_NAME)) return;

  // Add as the last column (index = current column count, 0-based).
  const addRes = await fetch(base, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FEE_COLUMN_NAME, index: names.length }),
  });
  if (!addRes.ok) {
    if (addRes.status === 401) tokenCache = null;
    // Another caller/process may have added it between our check and this POST
    // (or across the dev+prod dual drainers). Re-verify before failing.
    if ((await listColumnNames()).includes(FEE_COLUMN_NAME)) return;
    const t = await addRes.text();
    throw new Error(`column_add_failed_${addRes.status}: ${t.slice(0, 300)}`);
  }
  console.log(`[sharepoint] added "${FEE_COLUMN_NAME}" column to table ${cfg.tableName} (${cfg.filePath})`);
}

// ---------------------------------------------------------------------------
// Date / time conversion to Excel serials (matches existing rows)
// ---------------------------------------------------------------------------
// Excel's epoch is 1899-12-30 (the "1900 leap-year bug" baseline).
// Days since that = unix_ms / 86_400_000 + 25569.
// Time-of-day = fractional day in [0, 1).
//
// IMPORTANT: SharePoint stores Excel files in UTC unless the workbook
// timezone is configured. Brunei is UTC+8 with no DST. To make rows
// match what a Bruneian user sees in their Power BI report, we emit
// the date/time in Brunei local time.
const BRUNEI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function dateToExcelSerial(d: Date): number {
  const local = new Date(d.getTime() + BRUNEI_OFFSET_MS);
  // Strip time-of-day so the serial is an integer (date only).
  const dayOnly = Date.UTC(
    local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()
  );
  return Math.floor(dayOnly / 86_400_000) + 25569;
}

export function timeToExcelFraction(d: Date): number {
  const local = new Date(d.getTime() + BRUNEI_OFFSET_MS);
  const seconds =
    local.getUTCHours() * 3600 +
    local.getUTCMinutes() * 60 +
    local.getUTCSeconds();
  return seconds / 86_400;
}

// ---------------------------------------------------------------------------
// Append a single row to the configured Excel table
// ---------------------------------------------------------------------------
export interface AppendRowResult {
  ok: true;
  excelRowId: string;
}

/**
 * Append one row to the configured SharePoint Excel table.
 * `values` MUST be in the same column order as the table headers.
 * Throws on any failure — caller is responsible for retry/backoff.
 */
export async function appendExcelRow(values: (string | number | null)[]): Promise<AppendRowResult> {
  const cfg = loadSharePointConfig();
  if (!cfg) throw new Error('sharepoint_not_configured');

  const token = await getAccessToken(cfg);
  const driveItemPath = await resolveDriveItemPath(cfg);

  const url = `${driveItemPath}:/workbook/tables/${encodeURIComponent(cfg.tableName)}/rows/add`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) {
    const text = await res.text();
    // Token might have been invalidated server-side; clear cache so the
    // next call re-acquires.
    if (res.status === 401) tokenCache = null;
    throw new Error(`append_failed_${res.status}: ${text.slice(0, 400)}`);
  }
  const json = await res.json() as { index?: number };
  return { ok: true, excelRowId: String(json.index ?? '') };
}

// ---------------------------------------------------------------------------
// Read a single existing table row by its (0-based, data-body) index.
// Used by the refund-sign backfill to verify a row's identity before it
// overwrites it. Returns the row's values array (column A..Y order).
// ---------------------------------------------------------------------------
export async function getExcelRowValues(index: number): Promise<(string | number | null)[]> {
  const cfg = loadSharePointConfig();
  if (!cfg) throw new Error('sharepoint_not_configured');
  const token = await getAccessToken(cfg);
  const driveItemPath = await resolveDriveItemPath(cfg);
  const url = `${driveItemPath}:/workbook/tables/${encodeURIComponent(cfg.tableName)}/rows/itemAt(index=${index})`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) tokenCache = null;
    throw new Error(`getrow_failed_${res.status}: ${text.slice(0, 400)}`);
  }
  const json = await res.json() as { values?: (string | number | null)[][] };
  return json.values?.[0] ?? [];
}

// ---------------------------------------------------------------------------
// Overwrite an existing table row by its (0-based, data-body) index.
// `values` MUST be the full row in column A..Y order. Throws on failure.
// ---------------------------------------------------------------------------
export async function updateExcelRow(index: number, values: (string | number | null)[]): Promise<void> {
  const cfg = loadSharePointConfig();
  if (!cfg) throw new Error('sharepoint_not_configured');
  const token = await getAccessToken(cfg);
  const driveItemPath = await resolveDriveItemPath(cfg);
  const url = `${driveItemPath}:/workbook/tables/${encodeURIComponent(cfg.tableName)}/rows/itemAt(index=${index})`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) tokenCache = null;
    throw new Error(`updaterow_failed_${res.status}: ${text.slice(0, 400)}`);
  }
}

// ---------------------------------------------------------------------------
// Delete an existing table row by its (0-based, data-body) index. Note that
// deleting a row shifts every row below it up by one, so any cached indices
// greater than `index` become stale. Throws on failure.
// ---------------------------------------------------------------------------
export async function deleteExcelRow(index: number): Promise<void> {
  const cfg = loadSharePointConfig();
  if (!cfg) throw new Error('sharepoint_not_configured');
  const token = await getAccessToken(cfg);
  const driveItemPath = await resolveDriveItemPath(cfg);
  const url = `${driveItemPath}:/workbook/tables/${encodeURIComponent(cfg.tableName)}/rows/itemAt(index=${index})`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) tokenCache = null;
    throw new Error(`deleterow_failed_${res.status}: ${text.slice(0, 400)}`);
  }
}

// ---------------------------------------------------------------------------
// Test connection — used by /api/admin/integrations/sharepoint/test
// ---------------------------------------------------------------------------
export interface ConnectionStatus {
  configured: boolean;
  reachable?: boolean;
  tableName?: string;
  rowCount?: number;
  error?: string;
}

export async function testSharePointConnection(): Promise<ConnectionStatus> {
  const cfg = loadSharePointConfig();
  if (!cfg) return { configured: false };
  try {
    const token = await getAccessToken(cfg);
    const driveItemPath = await resolveDriveItemPath(cfg);
    const url = `${driveItemPath}:/workbook/tables/${encodeURIComponent(cfg.tableName)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const text = await res.text();
      return {
        configured: true,
        reachable: false,
        tableName: cfg.tableName,
        error: `lookup_${res.status}: ${text.slice(0, 200)}`,
      };
    }
    // Bonus: ping rowCount via /range so we can show "Excel currently has
    // N rows" in the admin panel.
    const rcRes = await fetch(
      `${driveItemPath}:/workbook/tables/${encodeURIComponent(cfg.tableName)}/dataBodyRange?$select=rowCount`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    let rowCount: number | undefined;
    if (rcRes.ok) {
      const rcJson = await rcRes.json() as { rowCount?: number };
      rowCount = rcJson.rowCount;
    }
    return { configured: true, reachable: true, tableName: cfg.tableName, rowCount };
  } catch (err: any) {
    return { configured: true, reachable: false, error: String(err?.message ?? err) };
  }
}
