// ============================================================
// Google OAuth via Arctic (Task 1.5)
//
// Authorization-Code flow with PKCE. The standard Lucia v3 partner
// library is `arctic`, which gives us a typed Google client and the
// state / code-verifier helpers. Passport is intentionally NOT used
// here — its abstractions don't compose with Lucia's session model
// and it's a security-attack-surface we don't need.
//
// Flow:
//   1. GET  /api/auth/google
//        - Generate `state` (CSRF) + `code_verifier` (PKCE)
//        - Drop both as short-lived HttpOnly cookies (10 min)
//        - 302 to Google's authorisation URL
//
//   2. GET  /api/auth/google/callback?code=...&state=...
//        - Compare cookie state vs query state (CSRF)
//        - Exchange code for tokens using the cookied verifier
//        - Decode id_token (no JWKS verification — see security note)
//        - Find-or-create the user (see findOrCreateGoogleUser)
//        - Mint a Lucia session and 302 to `/`
//
// Security note on id_token decoding:
//   Tokens come back over HTTPS directly from Google's token endpoint
//   (not via the user's browser), so a MITM cannot tamper without
//   defeating TLS. Full JWKS signature verification is a defence-in-
//   depth hardening that we'll add in a Week-2/3 pass. For now we
//   only decode the payload, and we still require `email_verified`
//   before linking to an existing account by email.
//
// Account-linking policy:
//   - If google_id matches an existing user → log them in.
//   - Else if email_verified by Google AND email matches an existing
//     user → LINK (set google_id) and log in.
//   - Else if no match → CREATE a new user (password column gets a
//     scrypt of 32 random bytes, which can never match any
//     plaintext, so password-login is impossible until the user
//     resets it).
//   - If Google says email_verified=false → REJECT. We never link
//     unverified Google emails to existing accounts because that
//     enables account-takeover via attacker-controlled gmail
//     forwarding tricks.
// ============================================================

import { Google, generateCodeVerifier, generateState } from "arctic";
import jwt from "jsonwebtoken";
import { sql } from "drizzle-orm";
import { Scrypt } from "lucia";
import { db } from "../db";

// ---- Config -------------------------------------------------

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Path component of redirectUri — used to register the callback route. */
  callbackPath: string;
}

/**
 * Read + validate Google OAuth env at startup. Throws (returns null on
 * "fully unset", to allow the app to boot without Google configured).
 *
 * Returns null if NO Google secrets are set — Google sign-in is then
 * simply unavailable. If SOME but not all are set, we throw so a
 * partial misconfig can never silently boot.
 */
export function loadGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  const all = [clientId, clientSecret, redirectUri];
  const someSet = all.some((v) => v && v.length > 0);
  const allSet = all.every((v) => v && v.length > 0);

  if (!someSet) return null;
  if (!allSet) {
    throw new Error(
      "[google-oauth] partial config: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET " +
        "and GOOGLE_REDIRECT_URI must all be set together (or none at all). " +
        "Refusing to boot with a half-configured OAuth client."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(redirectUri!);
  } catch {
    throw new Error(
      `[google-oauth] GOOGLE_REDIRECT_URI is not a valid URL: ${redirectUri}`
    );
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error(
      `[google-oauth] GOOGLE_REDIRECT_URI must use https:// (got ${parsed.protocol}). ` +
        `Localhost over http is allowed for development only.`
    );
  }

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    redirectUri: redirectUri!,
    callbackPath: parsed.pathname,
  };
}

// ---- Arctic client + cookie names ---------------------------

export function buildGoogleClient(cfg: GoogleOAuthConfig): Google {
  return new Google(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
}

export const STATE_COOKIE = "google_oauth_state";
export const VERIFIER_COOKIE = "google_oauth_code_verifier";
export const RETURN_TO_COOKIE = "google_oauth_return_to";

/** Cookie max-age for the in-flight OAuth handshake. 10 min is plenty. */
export const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;

export function makeOAuthFlightCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS * 1000,
  };
}

/**
 * Validate a `return_to` value before round-tripping it through a cookie
 * and back into a redirect. This is an open-redirect prevention check —
 * we MUST refuse anything that could escape our own origin, otherwise an
 * attacker can craft a sign-in link that ends with the user landing on
 * `evil.example.com` while we set their cookies.
 *
 * Rules:
 *   - Must start with a single "/" (relative path on our origin).
 *   - Must NOT start with "//" (protocol-relative URL → other host).
 *   - Must NOT start with "/\\" (browser quirk also protocol-relative).
 *   - Must NOT contain "://" anywhere (full URL embedded as a path).
 *   - Length-capped to 256 chars to keep cookie/header size sane.
 *   - No control characters or whitespace.
 */
export function isSafeReturnTo(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > 256) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  if (value.includes("://")) return false;
  if (/[\s\x00-\x1f\x7f]/.test(value)) return false;
  return true;
}

/**
 * Append a `google_oauth=<status>` query param to a same-origin path,
 * preserving any existing query string. Used so the front-end can show
 * a "you're signed in" toast and refresh its auth state.
 */
export function appendOauthStatus(
  path: string,
  status: "ok" | "cancelled" | "failed"
): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}google_oauth=${status}`;
}

// ---- Authorization start ------------------------------------

export function startGoogleAuth(client: Google): {
  url: URL;
  state: string;
  codeVerifier: string;
} {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = client.createAuthorizationURL(state, codeVerifier, [
    "openid",
    "email",
    "profile",
  ]);
  return { url, state, codeVerifier };
}

// ---- Callback handling --------------------------------------

export interface GoogleIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
}

/**
 * Decode (but do NOT cryptographically verify) the id_token payload.
 * See the security note at the top of this file.
 */
export function decodeIdTokenClaims(idToken: string): GoogleIdTokenClaims {
  const decoded = jwt.decode(idToken);
  if (!decoded || typeof decoded !== "object") {
    throw new Error("[google-oauth] id_token did not decode to an object");
  }
  const claims = decoded as Record<string, unknown>;
  if (typeof claims.sub !== "string" || claims.sub.length === 0) {
    throw new Error("[google-oauth] id_token is missing `sub` claim");
  }
  return claims as GoogleIdTokenClaims;
}

// ---- Find-or-create -----------------------------------------

const scrypt = new Scrypt();

export type LinkOutcome =
  | { kind: "logged_in"; userId: number }
  | { kind: "linked"; userId: number }
  | { kind: "created"; userId: number };

export async function findOrCreateGoogleUser(
  claims: GoogleIdTokenClaims
): Promise<LinkOutcome> {
  // 1. Match by google_id.
  const byGoogleId = (await db.execute(sql`
    SELECT id FROM users WHERE google_id = ${claims.sub} LIMIT 1
  `)).rows as Array<{ id: number }>;
  if (byGoogleId.length > 0) {
    return { kind: "logged_in", userId: byGoogleId[0].id };
  }

  // We need at least an email + verified flag to do anything else.
  if (!claims.email) {
    throw new Error("[google-oauth] id_token had no email claim");
  }
  if (claims.email_verified !== true) {
    throw new Error(
      "[google-oauth] Google reports this email as unverified. " +
        "Refusing to link or create an account."
    );
  }
  const email = claims.email.toLowerCase();

  // 2. Match by email — link the existing account.
  const byEmail = (await db.execute(sql`
    SELECT id FROM users WHERE LOWER(email) = ${email} LIMIT 1
  `)).rows as Array<{ id: number }>;
  if (byEmail.length > 0) {
    const id = byEmail[0].id;
    await db.execute(sql`
      UPDATE users SET google_id = ${claims.sub} WHERE id = ${id}
    `);
    return { kind: "linked", userId: id };
  }

  // 3. Create a fresh user. password is an unguessable scrypt hash so
  //    legacy bcrypt-based password login can never succeed for this
  //    user until they explicitly set a password.
  const placeholderPassword = await scrypt.hash(
    crypto.getRandomValues(new Uint8Array(32)).join("-")
  );
  const firstName = (claims.given_name || claims.name || "Google").slice(0, 100);
  const lastName = (claims.family_name || "User").slice(0, 100);

  const inserted = (await db.execute(sql`
    INSERT INTO users (first_name, last_name, email, password, google_id)
    VALUES (${firstName}, ${lastName}, ${email}, ${placeholderPassword}, ${claims.sub})
    RETURNING id
  `)).rows as Array<{ id: number }>;

  if (inserted.length === 0) {
    throw new Error("[google-oauth] user insert returned no row");
  }
  return { kind: "created", userId: inserted[0].id };
}

// ---- Audit helper -------------------------------------------

export async function writeGoogleAudit(
  action: "google.start" | "google.callback_success" | "google.callback_failed",
  entityId: string,
  ip: string | null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO audit_log (actor_id, actor_type, action, entity_type, entity_id, metadata, ip)
      VALUES (NULL, 'system', ${action}, 'google_oauth', ${entityId}, ${JSON.stringify(metadata)}::jsonb, ${ip})
    `);
  } catch (err) {
    console.error("[google-oauth] audit_log insert failed:", err);
  }
}
