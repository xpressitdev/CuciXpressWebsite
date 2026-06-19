// ============================================================================
// server/cybersource.ts
//
// CyberSource REST integration for auto-renewing subscriptions (card-on-file).
//
// Three things this module does:
//   1. generateCaptureContext()  -> a signed JWT the browser feeds to the
//      Unified Checkout JS widget. The widget collects the card (+3DS) and
//      returns a one-time "transient token" back to our client.
//   2. createPaymentWithTransientToken() -> first (customer-initiated) charge.
//      Captures funds AND creates a Token Management Service (TMS) instrument
//      so we can charge the same card again next month without storing a PAN.
//   3. chargeStoredInstrument() -> the monthly merchant-initiated renewal,
//      flagged as a compliant stored-credential / recurring transaction.
//
// Auth is CyberSource HTTP Signature: every request is signed with an HMAC of
// a canonical header set using the merchant's REST "Shared Secret" key. No
// secrets are ever embedded — all three come from the environment.
// ============================================================================

import crypto from "crypto";

const ENV = (process.env.CYBERSOURCE_ENV || "test").toLowerCase();
const HOST = ENV === "prod" || ENV === "production"
  ? "api.cybersource.com"
  : "apitest.cybersource.com";

const MERCHANT_ID = process.env.CYBERSOURCE_MERCHANT_ID || "";
const KEY_ID = process.env.CYBERSOURCE_KEY_ID || "";
const SHARED_SECRET = process.env.CYBERSOURCE_SHARED_SECRET || "";

// Unified Checkout client library version requested in the capture context.
const CLIENT_VERSION = "0.23";

export function isCyberSourceConfigured(): boolean {
  return Boolean(MERCHANT_ID && KEY_ID && SHARED_SECRET);
}

function assertConfigured() {
  if (!isCyberSourceConfigured()) {
    throw new Error(
      "CyberSource is not configured — set CYBERSOURCE_MERCHANT_ID, " +
        "CYBERSOURCE_KEY_ID and CYBERSOURCE_SHARED_SECRET.",
    );
  }
}

/** cents -> "39.00" (CyberSource wants a decimal string). */
export function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// HTTP Signature signing
// ---------------------------------------------------------------------------

function digestBody(body: string): string {
  const hash = crypto.createHash("sha256").update(body, "utf8").digest("base64");
  return `SHA-256=${hash}`;
}

/**
 * Build the `Signature` header value. The signing string is the listed headers
 * joined as "name: value" lines; the HMAC key is the base64-decoded shared
 * secret. Header order in `headers="..."` MUST match the order signed.
 */
function buildSignatureHeader(params: {
  method: "get" | "post";
  resource: string;
  date: string;
  digest?: string;
}): string {
  const { method, resource, date, digest } = params;
  const parts: string[] = [
    `host: ${HOST}`,
    `date: ${date}`,
    `(request-target): ${method} ${resource}`,
  ];
  const headerNames = ["host", "date", "(request-target)"];
  if (digest) {
    parts.push(`digest: ${digest}`);
    headerNames.push("digest");
  }
  parts.push(`v-c-merchant-id: ${MERCHANT_ID}`);
  headerNames.push("v-c-merchant-id");

  const signingString = parts.join("\n");
  const key = Buffer.from(SHARED_SECRET, "base64");
  const signature = crypto
    .createHmac("sha256", key)
    .update(signingString, "utf8")
    .digest("base64");

  return [
    `keyid="${KEY_ID}"`,
    `algorithm="HmacSHA256"`,
    `headers="${headerNames.join(" ")}"`,
    `signature="${signature}"`,
  ].join(", ");
}

interface CsResponse {
  status: number;
  text: string;
  json: any;
}

async function signedRequest(
  method: "get" | "post",
  resource: string,
  body?: unknown,
): Promise<CsResponse> {
  assertConfigured();
  const date = new Date().toUTCString();
  const bodyStr = body === undefined ? "" : JSON.stringify(body);

  const headers: Record<string, string> = {
    "v-c-merchant-id": MERCHANT_ID,
    Date: date,
    Host: HOST,
    "User-Agent": "CuciXpress/1.0",
    Accept: "application/json",
  };

  let digest: string | undefined;
  if (method === "post") {
    digest = digestBody(bodyStr);
    headers["Digest"] = digest;
    headers["Content-Type"] = "application/json";
  }
  headers["Signature"] = buildSignatureHeader({ method, resource, date, digest });

  const resp = await fetch(`https://${HOST}${resource}`, {
    method: method.toUpperCase(),
    headers,
    body: method === "post" ? bodyStr : undefined,
  });

  const text = await resp.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Capture-context responds with a bare JWT string, not JSON.
    json = null;
  }
  return { status: resp.status, text, json };
}

// ---------------------------------------------------------------------------
// 1. Capture context (Unified Checkout)
// ---------------------------------------------------------------------------

/**
 * Ask CyberSource for a capture context JWT. The browser passes this JWT to
 * the Unified Checkout JS library to render the card form. `targetOrigin` must
 * be the exact scheme+host of the page embedding the widget (no path).
 */
export async function generateCaptureContext(opts: {
  amountCents: number;
  currency: string;
  targetOrigin: string;
}): Promise<string> {
  const body = {
    clientVersion: CLIENT_VERSION,
    targetOrigins: [opts.targetOrigin],
    allowedCardNetworks: ["VISA", "MASTERCARD", "AMEX", "JCB"],
    allowedPaymentTypes: ["PANENTRY"],
    country: "BN",
    locale: "en_US",
    captureMandate: {
      billingType: "FULL",
      requestEmail: true,
      requestPhone: true,
      requestShipping: false,
      showAcceptedNetworkIcons: true,
    },
    orderInformation: {
      amountDetails: {
        totalAmount: centsToAmount(opts.amountCents),
        currency: opts.currency,
      },
    },
  };

  const res = await signedRequest("post", "/up/v1/capture-contexts", body);
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(
      `capture-context failed (${res.status}): ${res.text.slice(0, 500)}`,
    );
  }
  // The body IS the JWT (text/plain).
  return res.text.trim();
}

// ---------------------------------------------------------------------------
// Shared parsing of a /pts/v2/payments response
// ---------------------------------------------------------------------------

export interface PaymentResult {
  ok: boolean;
  id: string | null;
  status: string | null; // AUTHORIZED | PENDING | DECLINED | ...
  customerId?: string | null;
  instrumentId?: string | null;
  instrumentIdentifierId?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  raw: any;
  errorText?: string;
}

function parsePayment(res: CsResponse): PaymentResult {
  const j = res.json || {};
  const status: string | null = j.status ?? null;
  const ok =
    (res.status === 201 || res.status === 200) &&
    (status === "AUTHORIZED" ||
      status === "PENDING" ||
      status === "AUTHORIZED_PENDING_REVIEW");

  const token = j.tokenInformation || {};
  const card = j.paymentInformation?.card || j.paymentInformation?.tokenizedCard || {};

  return {
    ok,
    id: j.id ?? null,
    status,
    customerId: token.customer?.id ?? null,
    instrumentId: token.paymentInstrument?.id ?? null,
    instrumentIdentifierId: token.instrumentIdentifier?.id ?? null,
    cardBrand: card.type ?? null,
    cardLast4: card.suffix ?? null,
    raw: j,
    errorText: ok ? undefined : res.text.slice(0, 500),
  };
}

// ---------------------------------------------------------------------------
// 2. First charge (customer-initiated) + create stored token
// ---------------------------------------------------------------------------

export async function createPaymentWithTransientToken(opts: {
  transientTokenJwt: string;
  amountCents: number;
  currency: string;
  referenceCode: string;
}): Promise<PaymentResult> {
  const body = {
    clientReferenceInformation: { code: opts.referenceCode },
    processingInformation: {
      capture: true,
      commerceIndicator: "internet",
      actionList: ["TOKEN_CREATE"],
      actionTokenTypes: ["customer", "paymentInstrument", "instrumentIdentifier"],
      authorizationOptions: {
        initiator: { credentialStoredOnFile: true },
      },
    },
    tokenInformation: { transientTokenJwt: opts.transientTokenJwt },
    orderInformation: {
      amountDetails: {
        totalAmount: centsToAmount(opts.amountCents),
        currency: opts.currency,
      },
    },
  };

  const res = await signedRequest("post", "/pts/v2/payments", body);
  return parsePayment(res);
}

// ---------------------------------------------------------------------------
// 3. Monthly renewal (merchant-initiated, stored credential)
// ---------------------------------------------------------------------------

export async function chargeStoredInstrument(opts: {
  instrumentId: string;
  amountCents: number;
  currency: string;
  referenceCode: string;
  previousTransactionId?: string | null;
}): Promise<PaymentResult> {
  const body: any = {
    clientReferenceInformation: { code: opts.referenceCode },
    processingInformation: {
      capture: true,
      commerceIndicator: "recurring",
      authorizationOptions: {
        initiator: {
          type: "merchant",
          storedCredentialUsed: true,
          merchantInitiatedTransaction: {
            reason: "7", // recurring
            ...(opts.previousTransactionId
              ? { previousTransactionId: opts.previousTransactionId }
              : {}),
          },
        },
      },
    },
    paymentInformation: {
      paymentInstrument: { id: opts.instrumentId },
    },
    orderInformation: {
      amountDetails: {
        totalAmount: centsToAmount(opts.amountCents),
        currency: opts.currency,
      },
    },
  };

  const res = await signedRequest("post", "/pts/v2/payments", body);
  return parsePayment(res);
}
