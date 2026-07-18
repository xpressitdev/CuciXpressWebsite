import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { db } from "./db";
import { collaborationSubmissions, insertCollaborationSubmissionSchema, subscriptionSignups, insertSubscriptionSignupSchema } from "@shared/schema";
import { sendCollaborationEmail, sendPaymentConfirmation, sendSubscriptionNotification } from "./email";
import { processPocketPayPayment, handlePaymentCallback, queryTransactionStatus } from "./payment";
import { kedaiPOSIntegration } from "./kedaipos-integration";
import {
  testSharePointConnection,
  resetSharePointCaches,
  isSharePointConfigured,
} from "./integrations/sharepoint";
import {
  drainOnce as sharepointDrainOnce,
  getOutboxSnapshot as getSharePointSnapshot,
  retryOutboxRow as retrySharePointRow,
} from "./integrations/sharepointOutbox";
import { handleKedaiPOSWebhook, getOrderStatus, updateQueueStatus } from "./kedaipos-webhooks";
import { unifiedAuth } from "./unified-auth";
import { lucia } from "./auth/lucia";
import { staffLucia } from "./auth/staffLucia";
import { requireLuciaUser, requireStaff, requireStaffRole, requireStaffOrPlateOwner } from "./auth/middleware";
import { registerSubscriptionRoutes, activatePocketPaySubscription } from "./subscriptions";
import { getSubscriptionPlan } from "@shared/subscriptionPlans";
import { sendOtp, verifyOtp, OTP_CONSTANTS } from "./auth/otp";
import { loginStaff, createStaff, hashStaffPassword, STAFF_ROLES, MIN_PASSWORD_LENGTH } from "./auth/staff";
import {
  loadGoogleOAuthConfig,
  buildGoogleClient,
  startGoogleAuth,
  decodeIdTokenClaims,
  findOrCreateGoogleUser,
  writeGoogleAudit,
  makeOAuthFlightCookieOptions,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  RETURN_TO_COOKIE,
  isSafeReturnTo,
  appendOauthStatus,
} from "./auth/google";
import { storage } from "./storage";
import { eq, desc, sql } from "drizzle-orm";

const collaborationInterestSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  businessType: z.string().optional(),
  message: z.string().optional(),
});

// Helper function for branch-specific reviews (temporary until all branches have Google Place IDs)
function getBranchFallbackReviews(branchId: string) {
  const branchReviews: { [key: string]: any } = {
    "salar-branch": {
      reviews: [
        {
          name: "Sarah Chen",
          role: "Business Owner",
          content: "Excellent service! My company cars are always spotless. The team here is very professional.",
          rating: 5,
          initials: "SC",
          bgColor: "bg-gradient-to-br from-green-500 to-green-600"
        },
        {
          name: "David Lim",
          role: "Local Resident", 
          content: "Convenient location and great value for money. The wash quality is consistently good.",
          rating: 4,
          initials: "DL",
          bgColor: "bg-gradient-to-br from-blue-500 to-blue-600"
        }
      ],
      averageRating: 4.5,
      totalReviews: 15
    },
    "bengkurong-branch": {
      reviews: [
        {
          name: "Maria Santos",
          role: "Teacher",
          content: "Amazing attention to detail! They clean every corner of my car perfectly. Highly recommended!",
          rating: 5,
          initials: "MS", 
          bgColor: "bg-gradient-to-br from-purple-500 to-purple-600"
        },
        {
          name: "Robert Tan",
          role: "Engineer",
          content: "Fast and efficient service. The staff are knowledgeable and always do a thorough job.",
          rating: 5,
          initials: "RT",
          bgColor: "bg-gradient-to-br from-orange-500 to-orange-600"
        }
      ],
      averageRating: 4.8,
      totalReviews: 12
    },
    "tutong-branch": {
      reviews: [
        {
          name: "Lisa Wong",
          role: "Business Manager",
          content: "Excellent customer service and quality work. My car has never looked better!",
          rating: 5,
          initials: "LW",
          bgColor: "bg-gradient-to-br from-green-500 to-green-600"
        },
        {
          name: "James Abdullah", 
          role: "Local Customer",
          content: "Great location and friendly staff. They always take good care of my vehicle.",
          rating: 4,
          initials: "JA",
          bgColor: "bg-gradient-to-br from-blue-500 to-blue-600"
        }
      ],
      averageRating: 4.6,
      totalReviews: 8
    }
  };

  return branchReviews[branchId] || { reviews: [], averageRating: 0, totalReviews: 0 };
}

// Helper function to get search query for branch
function getBranchSearchQuery(branchId: string): string | null {
  const branchQueries: { [key: string]: string } = {
    "salar-branch": "Cuci Xpress Salar Link Brunei",
    "bengkurong-branch": "Cuci Xpress Bengkurong Link Brunei", 
    "tutong-branch": "Cuci Xpress Tutong Link Brunei"
  };
  return branchQueries[branchId] || null;
}

// Helper function to search for Google Place ID
async function searchGooglePlaceId(searchQuery: string, apiKey: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(searchQuery)}&inputtype=textquery&fields=place_id,name&key=${apiKey}`
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.status === "OK" && data.candidates && data.candidates.length > 0) {
      return data.candidates[0].place_id;
    }
    
    return null;
  } catch (error) {
    console.error("Error searching for Place ID:", error);
    return null;
  }
}

// In-memory cache for Google Places responses. Ratings/reviews change
// slowly, so we serve cached data for 12h (successes) / 10min (failures)
// instead of hitting Google's paid API on every landing-page view.
const googleApiCache = new Map<string, { status: number; body: any; expires: number }>();
const GOOGLE_CACHE_OK_MS = 12 * 60 * 60 * 1000;
const GOOGLE_CACHE_FAIL_MS = 10 * 60 * 1000;
function googleCacheGet(key: string) {
  const hit = googleApiCache.get(key);
  if (hit && hit.expires > Date.now()) return hit;
  if (hit) googleApiCache.delete(key);
  return null;
}
function googleCacheSet(key: string, status: number, body: any, ok: boolean) {
  // Hard cap as defence-in-depth: keys are allowlisted so this should
  // never trigger, but guarantee the map can't grow unbounded.
  if (googleApiCache.size >= 50 && !googleApiCache.has(key)) {
    const now = Date.now();
    googleApiCache.forEach((v, k) => {
      if (v.expires <= now) googleApiCache.delete(k);
    });
    if (googleApiCache.size >= 50) return;
  }
  googleApiCache.set(key, {
    status,
    body,
    expires: Date.now() + (ok ? GOOGLE_CACHE_OK_MS : GOOGLE_CACHE_FAIL_MS),
  });
}

// Only these branch slugs may be requested by the public reviews
// endpoint (plus the default place). Anything else is rejected so
// attackers can't burn paid Google API quota with arbitrary place IDs.
const REVIEW_BRANCH_SLUGS = new Set([
  "salar-branch",
  "bengkurong-branch",
  "tutong-branch",
  "lambak-branch",
]);

// Helper function to process Google Reviews data
function processGoogleReviews(data: any) {
  const reviews = data.result.reviews || [];
  const allReviews = reviews.map((review: any) => {
    const initials = review.author_name
      .split(" ")
      .map((name: string) => name[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    const colors = [
      'bg-gradient-to-br from-purple-500 to-purple-600',
      'bg-gradient-to-br from-orange-500 to-orange-600',
      'bg-gradient-to-br from-green-500 to-green-600',
      'bg-gradient-to-br from-blue-500 to-blue-600',
      'bg-gradient-to-br from-pink-500 to-pink-600',
      'bg-gradient-to-br from-indigo-500 to-indigo-600'
    ];

    return {
      name: review.author_name,
      role: "Verified Customer",
      content: review.text,
      rating: review.rating,
      initials,
      bgColor: colors[Math.floor(Math.random() * colors.length)],
      date: review.relative_time_description
    };
  });

  // Filter for positive reviews (4-5 stars)
  const positiveReviews = allReviews.filter((review: any) => review.rating >= 4);

  return {
    reviews: positiveReviews,
    averageRating: data.result.rating || 0,
    totalReviews: data.result.user_ratings_total || 0
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Revenue/queue is realized on the day a wash is CLAIMED, not the day it was
  // paid or when its QR was generated. Prepaid QR orders create the order row
  // up front and are only redeemed when staff scan the QR at the lane
  // (claimed_at). Three providers behave this way:
  //   - 'pocket_pay'  : web checkout on cucixpress.com — carries real money, so
  //     it uses claimed_at with NO fallback. A paid-but-unscanned web order
  //     stays out of every day bucket until scanned (revenue realized on claim).
  //   - 'loyalty'     : free-wash vouchers (B$0).
  //   - 'membership'  : subscription / unlimited washes (B$0).
  // loyalty + membership are B$0 and some legacy rows were scanned before
  // claimed_at was recorded, so they COALESCE to created_at when claimed_at is
  // missing — this keeps historical washes counted while still bucketing new
  // scans to their actual scan day. Without this, a subscription wash whose QR
  // was generated on one day but scanned on another vanished from that day's
  // queue and sales log. Every other (in-person POS) order has no QR and keeps
  // created_at. `prefix` is '' or 'o.' to match the alias used by the
  // surrounding query. Only literal column names and a constant are interpolated
  // (no user input) so sql.raw is safe here.
  const bizDay = (prefix: '' | 'o.' = '') =>
    sql.raw(
      `(CASE ` +
        `WHEN ${prefix}qr_provider = 'pocket_pay' THEN ${prefix}claimed_at ` +
        `WHEN ${prefix}qr_provider IN ('loyalty', 'membership') ` +
        `THEN COALESCE(${prefix}claimed_at, ${prefix}created_at) ` +
        `ELSE ${prefix}created_at END)`,
    );

  // Failed (voided) and abandoned (pending_payment) web checkouts are not real
  // sales — exclude them from every revenue/report surface so they are neither
  // listed nor counted. Refunds stay in (shown separately and subtracted).
  const realOrders = (prefix: '' | 'o.' = '') =>
    sql.raw(`AND ${prefix}status NOT IN ('voided', 'pending_payment')`);

  // Counter-sold Unlimited passes are rung as normal paid orders so the cash
  // drawer and payment-method tallies stay correct (money WAS collected that
  // day), but their REVENUE is recognized over 30 days in the Subscription
  // tab — exactly like online subscriptions. Exclude them from lump-sum
  // earnings surfaces (dashboard sales tiles, order-report totals, trends,
  // best-selling); do NOT apply this to cash/shift or payment-method reports.
  const excludeSubscriptionSales = (prefix: '' | 'o.' = '') =>
    sql.raw(`AND COALESCE(${prefix}order_type, '') <> 'counter_subscription'`);

  // Gross sales = money actually collected from completed sales. Refund
  // handling differs by data lineage, so this SUM must too:
  //  - LIVE refund: the ORIGINAL order is flipped to status='refunded' (one
  //    row). That money WAS collected, so its total stays in gross and is then
  //    netted out by subtracting refunds → the sale nets to zero. (legacy_source
  //    IS NULL.)
  //  - LEGACY imported refund: the KedaiPOS/Power BI sheet records a refund as a
  //    SEPARATE reversal row sitting ALONGSIDE its original 'done' sale row, and
  //    both were imported (the DB CHECK forbids negative totals). So the refund
  //    row must NOT be counted as gross — only its original sale is — otherwise
  //    subtracting refunds once leaves the original still counted.
  // With this rule, net = grossSalesCents - refunds is correct for BOTH, matching
  // Power BI to the cent. Returns a bare aggregate; append ::bigint/::int + alias.
  const grossSalesCents = (prefix: '' | 'o.' = '') =>
    sql.raw(`COALESCE(SUM(CASE WHEN ${prefix}status <> 'refunded' OR ${prefix}legacy_source IS NULL THEN ${prefix}total_cents ELSE 0 END), 0)`);

  // ===================================================================
  // Public Live Queue snapshot (no auth). Polled ~every 15s by both
  // the /queue page and the home-page widget.
  //
  // Status mapping for v1:
  //   queued  = orders today with status in ('paid','queued')
  //   washing = orders today with status = 'washing'
  //   today_total = orders today with status = 'done'
  // Wait estimate: queued × 8 minutes (simple per-car heuristic; will
  // be refined once we have lane-level timings from LiveQue).
  //
  // We use a single SELECT for active orders rather than one query per
  // branch, so this stays cheap even at 5 branches × 15s polling.
  // ===================================================================
  app.get("/api/queue/snapshot", async (_req, res) => {
    try {
      const PER_CAR_MIN = 8;

      const branchesRes = await db.execute(sql`
        SELECT id, name, location, is_open, status, status_note
        FROM branches
        WHERE COALESCE(is_active, true) = true
        ORDER BY id ASC
      `);
      const branches = branchesRes.rows as Array<{
        id: number; name: string; location: string | null; is_open: boolean;
        status: string | null; status_note: string | null;
      }>;

      const activeRes = await db.execute(sql`
        SELECT branch_id, plate, package_name, status, created_at, queue_position
        FROM orders
        WHERE status IN ('paid','queued','washing')
          AND date(${bizDay()} AT TIME ZONE 'Asia/Brunei')
            = (now() AT TIME ZONE 'Asia/Brunei')::date
        ORDER BY branch_id ASC,
          CASE status WHEN 'washing' THEN 0 ELSE 1 END,
          queue_position ASC NULLS LAST,
          created_at ASC
      `);
      const active = activeRes.rows as Array<{
        branch_id: number; plate: string; package_name: string; status: string; created_at: string;
        queue_position: number | null;
      }>;

      const totalsRes = await db.execute(sql`
        SELECT branch_id, COUNT(*)::int AS done_count
        FROM orders
        WHERE status = 'done'
          AND date(${bizDay()} AT TIME ZONE 'Asia/Brunei')
            = (now() AT TIME ZONE 'Asia/Brunei')::date
        GROUP BY branch_id
      `);
      const totals = totalsRes.rows as Array<{ branch_id: number; done_count: number }>;
      const todayMap = new Map(totals.map((t) => [t.branch_id, t.done_count]));

      // 7-day average wash time per branch (cap to 1-60 min to drop outliers
      // like end-of-shift batch closes that inflate the duration).
      const avgRes = await db.execute(sql`
        SELECT branch_id,
               ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 60.0))::int AS avg_min
        FROM orders
        WHERE status = 'done'
          AND completed_at IS NOT NULL
          AND completed_at > created_at
          AND completed_at >= now() - INTERVAL '7 days'
          AND EXTRACT(EPOCH FROM (completed_at - created_at)) / 60.0 BETWEEN 1 AND 60
        GROUP BY branch_id
      `);
      const avgRows = avgRes.rows as Array<{ branch_id: number; avg_min: number }>;
      const avgMap = new Map(avgRows.map((a) => [a.branch_id, a.avg_min]));

      const result = branches.map((b) => {
        const mine = active.filter((o) => o.branch_id === b.id);
        const washing = mine
          .filter((o) => o.status === 'washing')
          .map((o) => ({ plate: o.plate, package_name: o.package_name }));
        const queued = mine
          .filter((o) => o.status !== 'washing')
          .map((o, i) => ({ plate: o.plate, package_name: o.package_name, position: i + 1 }));
        return {
          id: b.id,
          name: b.name,
          location: b.location,
          is_open: b.is_open,
          status: b.status ?? (b.is_open ? 'open' : 'closed'),
          status_note: b.status_note ?? null,
          washing_count: washing.length,
          queued_count: queued.length,
          today_total: todayMap.get(b.id) ?? 0,
          avg_wash_minutes: avgMap.get(b.id) ?? null,
          est_wait_minutes: queued.length * PER_CAR_MIN,
          washing,
          queued,
        };
      });

      res.set('Cache-Control', 'no-store');
      res.json({ branches: result, server_time: new Date().toISOString() });
    } catch (err) {
      console.error('queue/snapshot failed', err);
      res.status(500).json({ message: 'Failed to load queue snapshot' });
    }
  });

  // Collaboration interest form submission
  app.post("/api/collaboration-interest", async (req, res) => {
    try {
      const data = insertCollaborationSubmissionSchema.parse(req.body);
      
      // Save to database
      const [submission] = await db.insert(collaborationSubmissions).values(data).returning();
      
      // Send email notification via ImprovMX forwarding
      const emailSent = await sendCollaborationEmail({
        ...data,
        submittedAt: new Date().toISOString(),
      });
      
      console.log("New collaboration submission saved:", {
        id: submission.id,
        name: data.name,
        email: data.email,
        emailSent,
        timestamp: submission.createdAt,
      });
      
      res.json({ 
        success: true, 
        message: "Thank you for your collaboration interest! We will contact you within 48 hours." 
      });
    } catch (error) {
      console.error("Error processing collaboration interest:", error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          success: false, 
          message: "Invalid form data", 
          errors: error.errors 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          message: "Internal server error" 
        });
      }
    }
  });

  // Admin endpoint to get collaboration submissions.
  // Server-side auth (Task 1.6 follow-up): requires a valid staff
  // session cookie AND owner|manager role. Lane / cashier staff have
  // no business reason to read inbound business inquiries.
  app.get("/api/admin/collaborations", requireStaff, requireStaffRole('owner', 'manager'), async (req, res) => {
    try {
      const submissions = await db
        .select()
        .from(collaborationSubmissions)
        .orderBy(desc(collaborationSubmissions.createdAt));
      
      res.json({ submissions });
    } catch (error) {
      console.error("Error fetching collaboration submissions:", error);
      res.status(500).json({ 
        error: "Failed to fetch submissions" 
      });
    }
  });

  // Admin endpoint to mark submission as read
  app.patch("/api/admin/collaborations/:id/read", requireStaff, requireStaffRole('owner', 'manager'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      await db
        .update(collaborationSubmissions)
        .set({ isRead: true })
        .where(eq(collaborationSubmissions.id, id));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating submission:", error);
      res.status(500).json({ 
        error: "Failed to update submission" 
      });
    }
  });

  // Subscription signup / plan-intent endpoint.
  // Phase 11: same endpoint now handles both the legacy waitlist email and the
  // new "Subscribe" CTA on the /subscriptions product page (which sends an
  // optional `plan` and `phone`). Behaviour is upsert-by-email so a previous
  // waitlist subscriber can come back and choose a plan without erroring.
  app.post("/api/subscription-signup", async (req, res) => {
    try {
      const data = insertSubscriptionSignupSchema.parse(req.body);
      const userId = req.lucia?.user ? Number(req.lucia.user.id) : null;

      const existing = await db
        .select()
        .from(subscriptionSignups)
        .where(eq(subscriptionSignups.email, data.email))
        .limit(1);

      const existingSignup = existing.length > 0 ? existing[0] : null;

      // Normalise the plate(s) the same way POS does (trimmed + uppercased) so a
      // founding signup is easy to match to a vehicle later. Family plans submit
      // 2-3 comma-joined plates; normalise each, drop blanks/dupes, then re-join.
      const normalisePlates = (raw: string | null | undefined) =>
        Array.from(
          new Set(
            (raw ?? "")
              .split(",")
              .map((p) => p.trim().toUpperCase())
              .filter(Boolean),
          ),
        );

      const newPlates = normalisePlates(data.carPlate);
      // The value that will actually be persisted: new plates win, else keep prev.
      const carPlate =
        newPlates.length > 0 ? newPlates.join(", ") : existingSignup?.carPlate ?? null;

      // Validate against the effective plan + stored plate value, not just this
      // request's fields. Otherwise a known email with an existing family plan
      // could omit `plan` and submit one plate to bypass the checks below.
      const effectivePlan = data.plan ?? existingSignup?.plan ?? null;
      const effectivePlates = normalisePlates(carPlate);

      // Self-serve plan intents must include the car plate (Corporate fleets are
      // handled manually, so they're exempt). Enforced server-side too — the
      // client check alone is bypassable.
      if (
        effectivePlan &&
        ["unlimited", "family"].includes(effectivePlan) &&
        !carPlate
      ) {
        return res.status(400).json({
          success: false,
          message: "Car plate is required for this plan.",
        });
      }

      // Multi-Car Family covers at least 2 cars, up to 3. Enforce the count
      // server-side since the client guard is bypassable.
      if (effectivePlan === "family") {
        if (effectivePlates.length < 2) {
          return res.status(400).json({
            success: false,
            message: "The Multi-Car Family plan needs at least 2 car plates.",
          });
        }
        if (effectivePlates.length > 3) {
          return res.status(400).json({
            success: false,
            message: "The Multi-Car Family plan covers up to 3 cars.",
          });
        }
      }

      let signup;
      let isNew = false;
      if (existing.length > 0) {
        // Upsert: keep the email, update plan/phone/car_plate/user_id if newly provided.
        const prev = existing[0];
        const [updated] = await db
          .update(subscriptionSignups)
          .set({
            plan: data.plan ?? prev.plan,
            phone: data.phone ?? prev.phone,
            carPlate: carPlate ?? prev.carPlate,
            userId: userId ?? prev.userId,
          })
          .where(eq(subscriptionSignups.id, prev.id))
          .returning();
        signup = updated;
      } else {
        const [created] = await db
          .insert(subscriptionSignups)
          .values({ ...data, carPlate, userId: userId ?? data.userId ?? null })
          .returning();
        signup = created;
        isNew = true;
      }

      // Only fire the legacy "waitlist" email for brand-new email captures
      // without a plan attached — keeps the noise down for plan intents which
      // staff will follow up on by phone.
      let emailSent = false;
      if (isNew && !data.plan) {
        emailSent = await sendSubscriptionNotification({
          email: data.email,
          submittedAt: new Date().toISOString(),
        });
      }

      console.log("Subscription signup saved:", {
        id: signup.id,
        email: data.email,
        plan: signup.plan,
        emailSent,
        timestamp: signup.createdAt,
      });

      res.json({
        success: true,
        message: data.plan
          ? "You're in. Your founding spot is reserved — we'll text you at launch (19 June) to activate your plan and book your first wash."
          : "Thank you! We'll notify you when our subscription service launches.",
      });
    } catch (error) {
      console.error("Error processing subscription signup:", error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          success: false, 
          message: "Invalid email address", 
          errors: error.errors 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          message: "Internal server error" 
        });
      }
    }
  });

  // Public founding-member status — how many of the 250 founding spots remain.
  // Drives the scarcity copy on the /subscriptions page. Aggregate count only,
  // so there's no PII exposure. "Claimed" = signups that picked a plan.
  const FOUNDING_TOTAL = 250;
  app.get("/api/subscription-signup/founding-status", async (_req, res) => {
    try {
      const [row] = await db
        .select({ claimed: sql<number>`count(*)::int` })
        .from(subscriptionSignups)
        .where(sql`${subscriptionSignups.plan} is not null`);
      const claimed = Math.min(row?.claimed ?? 0, FOUNDING_TOTAL);
      const remaining = Math.max(0, FOUNDING_TOTAL - claimed);
      res.json({ claimed, total: FOUNDING_TOTAL, remaining });
    } catch (error) {
      console.error("Error fetching founding status:", error);
      res.status(500).json({ error: "Failed to fetch founding status" });
    }
  });

  // Admin endpoint to get subscription signups
  app.get("/api/admin/subscriptions", requireStaff, requireStaffRole('owner', 'manager'), async (req, res) => {
    try {
      const signups = await db
        .select()
        .from(subscriptionSignups)
        .orderBy(desc(subscriptionSignups.createdAt));
      
      res.json({ signups });
    } catch (error) {
      console.error("Error fetching subscription signups:", error);
      res.status(500).json({ 
        error: "Failed to fetch signups" 
      });
    }
  });

  // GET /api/admin/subscriptions/revenue?date=YYYY-MM-DD
  // Subscription revenue recognition (owner/manager). Each unlimited
  // subscription (B$60 Unlimited Xpress, B$150 Multi-Car Family) is paid
  // online via the web Pocket QR gateway, so we take that gateway's MDR
  // fee ONCE at purchase and then spread the NET evenly over a fixed
  // 30-day plan window measured from each sale's own purchase date.
  // No refunds: a cancelled subscription keeps recognizing all 30 days.
  // This number lives ONLY in the Subscription tab — it never feeds the
  // main dashboard, payment-methods report, orders report, or SharePoint.
  app.get('/api/admin/subscriptions/revenue', requireStaff, requireStaffRole('owner', 'manager'), async (req, res) => {
    const RECOGNITION_DAYS = 30;
    // Brunei (UTC+8) calendar-day helpers — recognition is day-based.
    const bntDateStr = (d: Date) =>
      new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const dayNum = (ymd: string) => Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86400000);
    const planLabel = (cents: number) =>
      cents === 6000 ? 'Unlimited Xpress'
        : cents === 15000 ? 'Multi-Car Family'
          : `Subscription (B$${(cents / 100).toFixed(2)})`;

    const dateParam = String(req.query.date ?? '').trim();
    let asOf: string;
    if (dateParam) {
      // Reject malformed AND impossible dates (e.g. 2026-13-45, 2026-02-30):
      // the round-trip catches values JS would silently normalize.
      const probe = new Date(`${dateParam}T00:00:00Z`);
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        && !Number.isNaN(probe.getTime())
        && probe.toISOString().slice(0, 10) === dateParam;
      if (!valid) return res.status(400).json({ error: 'invalid_date' });
      asOf = dateParam;
    } else {
      asOf = bntDateStr(new Date());
    }
    const asOfDay = dayNum(asOf);

    try {
      const rateMap = await loadMdrRateMap(db);
      // Subscriptions are sold online via the web Pocket QR gateway.
      const mdrBps = mdrRateFor(rateMap, 'qr_code', 'pocket_pay');

      const rows = (await db.execute(sql`
        SELECT m.id, m.price_cents, m.status, m.created_at, m.expires_at,
               c.name AS customer_name,
               car.license_plate AS plate,
               car.brand AS car_brand,
               car.model AS car_model
          FROM memberships m
          LEFT JOIN customers c ON c.id = m.customer_id
          LEFT JOIN cars      car ON car.id = m.vehicle_id
         WHERE m.kind = 'unlimited'
           -- Counter-sold passes (source='pos') are rung as normal paid POS
           -- orders, so they already appear in the daily sales report, cash
           -- drawer, and payment-method breakdown on the sale day. Including
           -- them here would double-count revenue AND apply the wrong
           -- (Pocket Pay) MDR fee to a cash/card sale.
           AND m.source IS DISTINCT FROM 'pos'
         ORDER BY m.created_at DESC
      `)).rows as Array<{
        id: string; price_cents: number; status: string;
        created_at: string | Date; expires_at: string | Date | null;
        customer_name: string | null;
        plate: string | null; car_brand: string | null; car_model: string | null;
      }>;

      // recognized(net, daysElapsed) = round(net * clamp(daysElapsed,0,30) / 30)
      const recognizedAt = (net: number, recDays: number) =>
        Math.round((net * Math.min(Math.max(recDays, 0), RECOGNITION_DAYS)) / RECOGNITION_DAYS);

      const subscriptions = rows.map((r) => {
        const gross = Number(r.price_cents) || 0;
        const mdrFee = Math.round((gross * mdrBps) / 10000);
        const net = gross - mdrFee;
        const createdYmd = bntDateStr(new Date(r.created_at));
        // Purchase day counts as the first recognition day → +1. `elapsed`
        // is intentionally UNCLAMPED so earned-today drops to 0 once the
        // 30-day window closes (recognizedAt clamps internally).
        const elapsed = asOfDay - dayNum(createdYmd) + 1;
        const recDays = Math.min(Math.max(elapsed, 0), RECOGNITION_DAYS);
        const recognized = recognizedAt(net, elapsed);
        // earned today = recognized(today) − recognized(yesterday); naturally
        // 0 before purchase and once the 30-day window is fully recognized.
        const earnedToday = recognized - recognizedAt(net, elapsed - 1);
        return {
          id: r.id,
          customer_name: r.customer_name,
          plate: r.plate ?? null,
          car_brand: r.car_brand ?? null,
          car_model: r.car_model ?? null,
          plan_label: planLabel(gross),
          status: r.status,
          created_at: r.created_at,
          expires_at: r.expires_at,
          price_cents: gross,
          mdr_fee_cents: mdrFee,
          net_cents: net,
          daily_cents: Math.round(net / RECOGNITION_DAYS),
          day_index: recDays,
          days_remaining: Math.max(0, RECOGNITION_DAYS - recDays),
          recognized_cents: recognized,
          deferred_cents: net - recognized,
          earned_today_cents: earnedToday,
        };
      });

      // Counter-sold passes: each POS sale/renewal ORDER is its own 30-day
      // recognition window (a renewal is a fresh B$39 purchase). The cash was
      // collected at the till (drawer/payment tallies keep it), but earnings
      // are spread here just like online subscriptions. MDR uses the order's
      // ACTUAL payment method (cash/bank transfer = 0). Refunded pass orders
      // recognize nothing.
      const posRows = (await db.execute(sql`
        SELECT o.id, o.total_cents, o.payment_method, o.qr_provider,
               o.created_at, o.plate, o.package_name,
               c.name AS customer_name,
               car.brand AS car_brand, car.model AS car_model
          FROM orders o
          LEFT JOIN customers c ON c.id = o.customer_id
          LEFT JOIN cars    car ON car.id = o.vehicle_id
         WHERE o.order_type = 'counter_subscription'
           AND o.status NOT IN ('voided', 'pending_payment', 'refunded')
         ORDER BY o.created_at DESC
      `)).rows as Array<{
        id: string; total_cents: number; payment_method: string;
        qr_provider: string | null; created_at: string | Date;
        plate: string | null; package_name: string;
        customer_name: string | null; car_brand: string | null; car_model: string | null;
      }>;
      for (const o of posRows) {
        const gross = Number(o.total_cents) || 0;
        const bps = mdrRateFor(rateMap, o.payment_method, o.qr_provider);
        const mdrFee = Math.round((gross * bps) / 10000);
        const net = gross - mdrFee;
        const createdYmd = bntDateStr(new Date(o.created_at));
        const elapsed = asOfDay - dayNum(createdYmd) + 1;
        const recDays = Math.min(Math.max(elapsed, 0), RECOGNITION_DAYS);
        const recognized = recognizedAt(net, elapsed);
        const earnedToday = recognized - recognizedAt(net, elapsed - 1);
        const endMs = new Date(o.created_at).getTime() + RECOGNITION_DAYS * 86400000;
        subscriptions.push({
          id: o.id,
          customer_name: o.customer_name,
          plate: o.plate ?? null,
          car_brand: o.car_brand ?? null,
          car_model: o.car_model ?? null,
          plan_label: `${planLabel(gross)} — Counter${o.package_name.includes('renewal') ? ' renewal' : ''}`,
          status: recDays < RECOGNITION_DAYS ? 'active' : 'completed',
          created_at: o.created_at,
          expires_at: new Date(endMs).toISOString(),
          price_cents: gross,
          mdr_fee_cents: mdrFee,
          net_cents: net,
          daily_cents: Math.round(net / RECOGNITION_DAYS),
          day_index: recDays,
          days_remaining: Math.max(0, RECOGNITION_DAYS - recDays),
          recognized_cents: recognized,
          deferred_cents: net - recognized,
          earned_today_cents: earnedToday,
        });
      }
      subscriptions.sort((a, b) =>
        new Date(b.created_at as any).getTime() - new Date(a.created_at as any).getTime());

      const totals = {
        total_count: subscriptions.length,
        active_count: subscriptions.filter((s) => s.status === 'active').length,
        gross_cents: 0, mdr_fee_cents: 0, net_cents: 0,
        recognized_cents: 0, deferred_cents: 0, earned_today_cents: 0,
      };
      const byPlanMap = new Map<string, {
        label: string; count: number; gross_cents: number; net_cents: number;
        recognized_cents: number; deferred_cents: number; earned_today_cents: number;
      }>();
      for (const s of subscriptions) {
        totals.gross_cents += s.price_cents;
        totals.mdr_fee_cents += s.mdr_fee_cents;
        totals.net_cents += s.net_cents;
        totals.recognized_cents += s.recognized_cents;
        totals.deferred_cents += s.deferred_cents;
        totals.earned_today_cents += s.earned_today_cents;
        const p = byPlanMap.get(s.plan_label) ?? {
          label: s.plan_label, count: 0, gross_cents: 0, net_cents: 0,
          recognized_cents: 0, deferred_cents: 0, earned_today_cents: 0,
        };
        p.count += 1;
        p.gross_cents += s.price_cents;
        p.net_cents += s.net_cents;
        p.recognized_cents += s.recognized_cents;
        p.deferred_cents += s.deferred_cents;
        p.earned_today_cents += s.earned_today_cents;
        byPlanMap.set(s.plan_label, p);
      }

      res.json({
        as_of: asOf,
        mdr_bps: mdrBps,
        recognition_days: RECOGNITION_DAYS,
        totals,
        by_plan: Array.from(byPlanMap.values()).sort((a, b) => b.gross_cents - a.gross_cents),
        subscriptions,
      });
    } catch (error) {
      console.error('Error computing subscription revenue:', error);
      res.status(500).json({ error: 'Failed to compute subscription revenue' });
    }
  });

  // ============================================================
  // ADMIN — Phase 5a Owner Dashboard + Order Report (2026-05-04)
  // Owner/manager only. Read-only aggregations over orders +
  // customers + staff. All time math runs in Asia/Brunei (UTC+8).
  // ============================================================

  // GET /api/admin/dashboard?branch_id=N|all&date=YYYY-MM-DD
  // Returns 12 KPI tiles + 24-hour sales/refund breakdown.
  app.get('/api/admin/dashboard', requireStaff, requireStaffRole('owner', 'manager', 'cashier', 'investor'), async (req, res) => {
    const branchParam = String(req.query.branch_id ?? 'all').trim();
    const branchId =
      branchParam === '' || branchParam === 'all' ? null : Number(branchParam);
    if (branchId !== null && (!Number.isFinite(branchId) || branchId <= 0)) {
      return res.status(400).json({ error: 'invalid_branch_id' });
    }
    const dateParam = String(req.query.date ?? '').trim();
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;

    try {
      const branches = (await db.execute(sql`
        SELECT id, name, location FROM branches ORDER BY name
      `)).rows;

      const dateRow = (await db.execute(
        validDate
          ? sql`SELECT ${validDate}::date AS d`
          : sql`SELECT (now() AT TIME ZONE 'Asia/Brunei')::date AS d`,
      )).rows[0] as { d: string };
      const targetDate = dateRow.d;

      const branchFilter = branchId !== null ? sql`AND branch_id = ${branchId}` : sql``;

      const tilesRow = (await db.execute(sql`
        WITH day_orders AS (
          SELECT *
            FROM orders
           WHERE date(${bizDay()} AT TIME ZONE 'Asia/Brunei') = ${targetDate}::date
             ${branchFilter} ${realOrders()} ${excludeSubscriptionSales()}
        ),
        paid AS (SELECT * FROM day_orders WHERE status <> 'refunded'),
        ref  AS (SELECT * FROM day_orders WHERE status =  'refunded')
        SELECT
          (SELECT COUNT(*)::int FROM day_orders)                                              AS today_transactions,
          (SELECT COALESCE(SUM(total_cents),0)::bigint FROM day_orders)                       AS today_sales_cents,
          (SELECT COUNT(*)::int FROM ref)                                                     AS today_refund_count,
          (SELECT COALESCE(SUM(total_cents),0)::bigint FROM ref)                              AS today_refund_total_cents,
          (SELECT COALESCE(SUM(1 + COALESCE(jsonb_array_length(addons),0)),0)::int FROM paid) AS today_items_sold,
          (SELECT COUNT(DISTINCT staff_id)::int   FROM day_orders WHERE staff_id IS NOT NULL)   AS today_active_staff,
          (SELECT COUNT(DISTINCT vehicle_id)::int FROM day_orders WHERE vehicle_id IS NOT NULL) AS today_active_customers,
          (SELECT COUNT(*)::int FROM staff WHERE is_active = true)                            AS total_staff,
          (SELECT COUNT(*)::int FROM customers)                                               AS total_customers
      `)).rows[0] as any;

      const hourly = (await db.execute(sql`
        SELECT EXTRACT(HOUR FROM (${bizDay()} AT TIME ZONE 'Asia/Brunei'))::int AS hour,
               COALESCE(SUM(total_cents), 0)::bigint AS sales_cents,
               COALESCE(SUM(CASE WHEN status =  'refunded' THEN total_cents ELSE 0 END), 0)::bigint AS refund_cents
          FROM orders
         WHERE date(${bizDay()} AT TIME ZONE 'Asia/Brunei') = ${targetDate}::date
           ${branchFilter} ${realOrders()} ${excludeSubscriptionSales()}
         GROUP BY 1
         ORDER BY 1
      `)).rows as Array<{ hour: number; sales_cents: string | number; refund_cents: string | number }>;

      const hourlyMap = new Map<number, { sales_cents: number; refund_cents: number }>();
      for (const row of hourly) {
        hourlyMap.set(Number(row.hour), {
          sales_cents: Number(row.sales_cents),
          refund_cents: Number(row.refund_cents),
        });
      }
      const hourlyFull = Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        sales_cents: hourlyMap.get(h)?.sales_cents ?? 0,
        refund_cents: hourlyMap.get(h)?.refund_cents ?? 0,
      }));

      // MDR fees for the day — grouped by (method, provider) so per-wallet
      // rates apply, then summed. Fee charged on gross (kept on refunds).
      const feeGroups = (await db.execute(sql`
        SELECT payment_method, qr_provider,
               COALESCE(SUM(CASE WHEN status <> 'refunded' THEN total_cents ELSE 0 END),0)::int AS sales_cents,
               COALESCE(SUM(CASE WHEN status =  'refunded' THEN total_cents ELSE 0 END),0)::int AS refund_cents
          FROM orders
         WHERE date(${bizDay()} AT TIME ZONE 'Asia/Brunei') = ${targetDate}::date
           ${branchFilter} ${realOrders()} ${excludeSubscriptionSales()}
         GROUP BY payment_method, qr_provider
      `)).rows as Array<{ payment_method: string; qr_provider: string | null; sales_cents: number; refund_cents: number }>;
      const rateMap = await loadMdrRateMap(db);
      const mdrFee = feeGroups.reduce((acc, g) => acc + mdrFeeForGroup(
        mdrRateFor(rateMap, g.payment_method, g.qr_provider), g.sales_cents, g.refund_cents,
      ), 0);

      const tx = Number(tilesRow.today_transactions ?? 0);
      const sales = Number(tilesRow.today_sales_cents ?? 0);
      const refundCount = Number(tilesRow.today_refund_count ?? 0);
      const refundTotal = Number(tilesRow.today_refund_total_cents ?? 0);

      res.json({
        filter: { branch_id: branchId, date: targetDate },
        branches,
        tiles: {
          today_transactions: tx,
          today_sales_cents: sales,
          today_avg_sales_cents: tx > 0 ? Math.round(sales / tx) : 0,
          today_items_sold: Number(tilesRow.today_items_sold ?? 0),
          today_refund_count: refundCount,
          today_refund_total_cents: refundTotal,
          today_avg_refund_cents: refundCount > 0 ? Math.round(refundTotal / refundCount) : 0,
          today_net_sales_cents: sales - refundTotal,
          today_mdr_fee_cents: mdrFee,
          today_net_after_fees_cents: sales - refundTotal - mdrFee,
          today_active_staff: Number(tilesRow.today_active_staff ?? 0),
          today_active_customers: Number(tilesRow.today_active_customers ?? 0),
          total_staff: Number(tilesRow.total_staff ?? 0),
          total_customers: Number(tilesRow.total_customers ?? 0),
        },
        hourly: hourlyFull,
      });
    } catch (err) {
      console.error('[admin.dashboard] failed:', err);
      res.status(500).json({ error: 'dashboard_failed' });
    }
  });

  // GET /api/admin/reports/orders
  //   ?branch_id=N|all
  //   &from=YYYY-MM-DD&to=YYYY-MM-DD     (default: today, both)
  //   &payment_method=cash|...|all
  //   &staff_id=text|all
  //   &search=ticket_code|plate|customer_name (>=2 chars)
  //   &page=1&per_page=50                (10..200)
  app.get('/api/admin/reports/orders', requireStaff, requireStaffRole('owner', 'manager', 'cashier', 'investor'), async (req, res) => {
    const branchParam = String(req.query.branch_id ?? 'all').trim();
    const branchId =
      branchParam === '' || branchParam === 'all' ? null : Number(branchParam);
    if (branchId !== null && (!Number.isFinite(branchId) || branchId <= 0)) {
      return res.status(400).json({ error: 'invalid_branch_id' });
    }

    const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    const fromParam = String(req.query.from ?? '').trim();
    const toParam = String(req.query.to ?? '').trim();

    const paymentMethod = String(req.query.payment_method ?? 'all').trim();
    const staffParam = String(req.query.staff_id ?? 'all').trim();
    const search = String(req.query.search ?? '').trim();

    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const perPage = Math.min(200, Math.max(10, Number(req.query.per_page ?? 50) || 50));
    const offset = (page - 1) * perPage;

    try {
      const todayRow = (await db.execute(
        sql`SELECT (now() AT TIME ZONE 'Asia/Brunei')::date AS d`,
      )).rows[0] as { d: string };
      const from = isDate(fromParam) ? fromParam : todayRow.d;
      const to = isDate(toParam) ? toParam : from;

      const branchFilter = branchId !== null ? sql`AND o.branch_id = ${branchId}` : sql``;
      const pmFilter =
        paymentMethod !== '' && paymentMethod !== 'all'
          ? sql`AND o.payment_method = ${paymentMethod}`
          : sql``;
      const staffFilter =
        staffParam !== '' && staffParam !== 'all'
          ? sql`AND o.staff_id = ${staffParam}`
          : sql``;
      const searchFilter =
        search.length >= 2
          ? sql`AND (o.ticket_code ILIKE ${'%' + search + '%'}
                  OR o.plate       ILIKE ${'%' + search + '%'}
                  OR COALESCE(o.customer_name_walkin,'') ILIKE ${'%' + search + '%'})`
          : sql``;

      const totals = (await db.execute(sql`
        SELECT
          COUNT(*)::int                                                                                AS transactions,
          -- Gross excludes legacy separate-row refunds; see grossSalesCents.
          ${grossSalesCents('o.')}::bigint AS sales_cents,
          COUNT(*) FILTER (WHERE o.status = 'refunded')::int                                           AS refund_count,
          COALESCE(SUM(CASE WHEN o.status =  'refunded' THEN o.total_cents ELSE 0 END),0)::bigint      AS refund_total_cents,
          COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN 1 + COALESCE(jsonb_array_length(o.addons),0) ELSE 0 END),0)::int AS items_sold
          FROM orders o
         WHERE date(${bizDay('o.')} AT TIME ZONE 'Asia/Brunei') BETWEEN ${from}::date AND ${to}::date
           ${branchFilter} ${pmFilter} ${staffFilter} ${searchFilter} ${realOrders('o.')} ${excludeSubscriptionSales('o.')}
      `)).rows[0] as any;

      const countRow = (await db.execute(sql`
        SELECT COUNT(*)::int AS n
          FROM orders o
         WHERE date(${bizDay('o.')} AT TIME ZONE 'Asia/Brunei') BETWEEN ${from}::date AND ${to}::date
           ${branchFilter} ${pmFilter} ${staffFilter} ${searchFilter} ${realOrders('o.')}
      `)).rows[0] as { n: number };

      const rows = (await db.execute(sql`
        SELECT o.id, o.ticket_code, o.plate, o.ticket_day, o.created_at,
               o.payment_method, o.qr_provider, o.package_name, o.total_cents, o.paid_amount_cents,
               o.change_cents, o.status, o.refunded_at, o.refund_reason,
               o.customer_name_walkin, o.original_receipt_no, o.kedaipos_pos_name,
               o.branch_id, b.name AS branch_name,
               o.staff_id, s.name AS staff_name
          FROM orders o
          LEFT JOIN branches b ON b.id = o.branch_id
          LEFT JOIN staff    s ON s.id = o.staff_id
         WHERE date(${bizDay('o.')} AT TIME ZONE 'Asia/Brunei') BETWEEN ${from}::date AND ${to}::date
           ${branchFilter} ${pmFilter} ${staffFilter} ${searchFilter} ${realOrders('o.')}
         ORDER BY ${bizDay('o.')} DESC
         LIMIT ${perPage} OFFSET ${offset}
      `)).rows;

      const branches = (await db.execute(
        sql`SELECT id, name FROM branches ORDER BY name`,
      )).rows;
      const staffList = (await db.execute(sql`
        SELECT id, name, role, branch_id FROM staff
         WHERE is_active = true ORDER BY name
      `)).rows;

      // MDR fees for the filtered range, grouped by (method, provider).
      const feeGroups = (await db.execute(sql`
        SELECT o.payment_method, o.qr_provider,
               ${grossSalesCents('o.')}::int AS sales_cents
          FROM orders o
         WHERE date(${bizDay('o.')} AT TIME ZONE 'Asia/Brunei') BETWEEN ${from}::date AND ${to}::date
           ${branchFilter} ${pmFilter} ${staffFilter} ${searchFilter} ${realOrders('o.')} ${excludeSubscriptionSales('o.')}
         GROUP BY o.payment_method, o.qr_provider
      `)).rows as Array<{ payment_method: string; qr_provider: string | null; sales_cents: number }>;
      const rateMap = await loadMdrRateMap(db);
      // MDR is charged on gross (the provider keeps its cut even when a sale is
      // later refunded). grossSalesCents already counts each original charge
      // exactly once, so pass 0 refund to avoid double-charging the fee.
      const mdrFee = feeGroups.reduce((acc, g) => acc + mdrFeeForGroup(
        mdrRateFor(rateMap, g.payment_method, g.qr_provider), g.sales_cents, 0,
      ), 0);

      const txCount = Number(totals.transactions ?? 0);
      const refCount = Number(totals.refund_count ?? 0);
      const sales = Number(totals.sales_cents ?? 0);
      const refundTotal = Number(totals.refund_total_cents ?? 0);
      const paidCount = Math.max(1, txCount - refCount);

      // Resolve each row's human label from the Payment Setup config so the
      // report shows exactly what the owner named (e.g. "Bank Transfer BIBD",
      // "Website cucixpress.com (Web Pocket QR)"). Keyed by (method, provider)
      // — the same pair stored on the order. Falls back to a humanised slug or
      // a generic base label when no config row matches (legacy rows, the
      // online Pocket Pay gateway whose provider the config CHECK forbids).
      const pmCfg = (await db.execute(sql`
        SELECT method, qr_provider, label FROM payment_methods
      `)).rows as Array<{ method: string; qr_provider: string | null; label: string }>;
      const pmLabelMap = new Map(pmCfg.map((c) => [`${c.method}|${c.qr_provider ?? ''}`, c.label]));
      const basePmLabels: Record<string, string> = {
        cash: 'Cash', bank_transfer: 'Bank Transfer', card: 'Card', qr_code: 'QR',
        baiduri_pay: 'Baiduripay', quick_pay: 'Quickpay', voucher: 'Voucher', subscription: 'Subscription',
      };
      const humanizeSlug = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
      const resolvePaymentLabel = (m: string, qp: string | null): string => {
        const hit = pmLabelMap.get(`${m}|${qp ?? ''}`);
        if (hit) return hit;
        // Only the wallet-style qr_code methods carry a provider worth showing
        // when unmatched (e.g. the online Pocket Pay gateway). For other methods
        // the provider is a semantic tag (subscription→membership, voucher→
        // loyalty) — fall back to the generic method label instead.
        if (m === 'qr_code' && qp) return humanizeSlug(qp);
        return basePmLabels[m] ?? m;
      };
      const rowsWithLabels = (rows as Array<any>).map((r) => ({
        ...r,
        payment_label: resolvePaymentLabel(r.payment_method, r.qr_provider ?? null),
      }));

      res.json({
        filter: { branch_id: branchId, from, to, payment_method: paymentMethod, staff_id: staffParam, search },
        branches,
        staff: staffList,
        totals: {
          transactions: txCount,
          sales_cents: sales,
          refund_count: refCount,
          refund_total_cents: refundTotal,
          net_sales_cents: sales - refundTotal,
          mdr_fee_cents: mdrFee,
          net_after_fees_cents: sales - refundTotal - mdrFee,
          items_sold: Number(totals.items_sold ?? 0),
          avg_sales_cents: txCount - refCount > 0 ? Math.round((sales - refundTotal) / paidCount) : 0,
          avg_refund_cents: refCount > 0 ? Math.round(refundTotal / refCount) : 0,
        },
        page,
        per_page: perPage,
        total_count: countRow.n,
        rows: rowsWithLabels,
      });
    } catch (err) {
      console.error('[admin.reports.orders] failed:', err);
      res.status(500).json({ error: 'report_failed' });
    }
  });

  // GET /api/admin/orders/:id/receipt — full digital-receipt payload for a
  // single order so an admin can WhatsApp it to the customer. Returns the
  // same rich shape the customer dashboard uses (package + add-on line items,
  // subtotal/discount/paid/change, cashier, branch) plus the best-known
  // customer phone so the share link can be addressed straight to them.
  app.get('/api/admin/orders/:id/receipt', requireStaff, requireStaffRole('owner', 'manager'), async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    if (!id) return res.status(400).json({ error: 'invalid_id' });
    try {
      const row = (await db.execute(sql`
        SELECT
          o.id, o.ticket_code, o.plate, o.created_at, o.status,
          o.package_name, o.package_price_cents, o.addons,
          o.subtotal_cents, o.discount_cents, o.promo_discount_cents,
          o.total_cents, o.paid_amount_cents, o.change_cents,
          o.item_notes, o.payment_method,
          CASE WHEN o.payment_method = 'qr_code' THEN o.qr_provider ELSE NULL END AS qr_provider,
          b.name AS branch_name,
          s.name AS cashier_name,
          COALESCE(ccar.name,  cusr.name)  AS customer_name,
          COALESCE(ccar.phone, cusr.phone) AS customer_phone,
          o.customer_name_walkin
        FROM orders o
        LEFT JOIN branches  b    ON b.id    = o.branch_id
        LEFT JOIN staff     s    ON s.id    = o.staff_id
        LEFT JOIN cars      cr   ON cr.id   = o.vehicle_id
        LEFT JOIN customers ccar ON ccar.id = cr.customer_id
        LEFT JOIN customers cusr ON cusr.user_id = o.customer_id
        WHERE o.id = ${id}
        LIMIT 1
      `)).rows[0] as any;

      if (!row) return res.status(404).json({ error: 'not_found' });

      return res.json({
        order: {
          id: row.id,
          ticket_code: row.ticket_code,
          plate: row.plate,
          created_at: row.created_at,
          status: row.status,
          branch_name: row.branch_name,
          cashier_name: row.cashier_name,
          package_name: row.package_name,
          package_price_cents: row.package_price_cents,
          addons: row.addons ?? [],
          subtotal_cents: row.subtotal_cents,
          discount_cents: row.discount_cents,
          promo_discount_cents: row.promo_discount_cents,
          total_cents: row.total_cents,
          paid_amount_cents: row.paid_amount_cents,
          change_cents: row.change_cents,
          item_notes: row.item_notes,
          payment_method: row.payment_method,
          qr_provider: row.qr_provider,
        },
        customer: {
          name: row.customer_name ?? row.customer_name_walkin ?? null,
          phone: row.customer_phone ?? null,
        },
      });
    } catch (err) {
      console.error('[admin.orders.receipt] failed:', err);
      return res.status(500).json({ error: 'receipt_failed' });
    }
  });

  // GET /api/admin/reports/orders/export
  // Same filters as /api/admin/reports/orders, no pagination. Streams an
  // .xlsx file with the 25-column "Master Sales Data" layout the owner
  // already feeds into Power BI:
  //   Source.Name, ID, Receipt Date, Receipt Time, Store Name, POS Name,
  //   Employee Name, Is Refund, Original Receipt No, Order Number,
  //   Customer Name, Payment Type, Subtotal, Discount Total,
  //   Promocode Discount Total, Service Charge Total, Tax Total,
  //   Order Total, Paid Amount, Change, Order Notes, Item Notes,
  //   Extracted_Brand, Extracted_Model, License_Plate
  // Receipt Date / Time are Excel serial numbers (Asia/Brunei wall clock)
  // for parity with the KedaiPOS export the user has been uploading.
  // Hard-capped at 100,000 rows per call.
  app.get('/api/admin/reports/orders/export', requireStaff, requireStaffRole('owner', 'manager', 'cashier', 'investor'), async (req, res) => {
    const branchParam = String(req.query.branch_id ?? 'all').trim();
    const branchId =
      branchParam === '' || branchParam === 'all' ? null : Number(branchParam);
    if (branchId !== null && (!Number.isFinite(branchId) || branchId <= 0)) {
      return res.status(400).json({ error: 'invalid_branch_id' });
    }
    const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    const fromParam = String(req.query.from ?? '').trim();
    const toParam = String(req.query.to ?? '').trim();
    const paymentMethod = String(req.query.payment_method ?? 'all').trim();
    const staffParam = String(req.query.staff_id ?? 'all').trim();
    const search = String(req.query.search ?? '').trim();

    try {
      const todayRow = (await db.execute(
        sql`SELECT (now() AT TIME ZONE 'Asia/Brunei')::date AS d`,
      )).rows[0] as { d: string };
      const from = isDate(fromParam) ? fromParam : todayRow.d;
      const to = isDate(toParam) ? toParam : from;

      const branchFilter = branchId !== null ? sql`AND o.branch_id = ${branchId}` : sql``;
      const pmFilter = paymentMethod !== '' && paymentMethod !== 'all'
        ? sql`AND o.payment_method = ${paymentMethod}` : sql``;
      const staffFilter = staffParam !== '' && staffParam !== 'all'
        ? sql`AND o.staff_id = ${staffParam}` : sql``;
      const searchFilter = search.length >= 2
        ? sql`AND (o.ticket_code ILIKE ${'%' + search + '%'}
                OR o.plate       ILIKE ${'%' + search + '%'}
                OR COALESCE(o.customer_name_walkin,'') ILIKE ${'%' + search + '%'})`
        : sql``;

      // Cheap count first so we can bail before serialising 100k rows.
      const countRow = (await db.execute(sql`
        SELECT COUNT(*)::int AS n
          FROM orders o
         WHERE date(${bizDay('o.')} AT TIME ZONE 'Asia/Brunei') BETWEEN ${from}::date AND ${to}::date
           ${branchFilter} ${pmFilter} ${staffFilter} ${searchFilter} ${realOrders('o.')}
      `)).rows[0] as { n: number };

      const ROW_CAP = 100_000;
      if (countRow.n > ROW_CAP) {
        return res.status(413).json({
          error: 'too_many_rows',
          row_count: countRow.n,
          row_cap: ROW_CAP,
          hint: 'Narrow the date range or branch filter.',
        });
      }

      const rows = (await db.execute(sql`
        SELECT
          o.id, o.ticket_code, o.plate, o.created_at,
          o.payment_method, o.qr_provider, o.status,
          o.subtotal_cents, o.total_cents, o.paid_amount_cents,
          o.change_cents, o.discount_cents, o.promo_discount_cents,
          o.service_charge_cents, o.tax_cents,
          o.order_notes, o.item_notes,
          o.original_receipt_no, o.kedaipos_id, o.kedaipos_order_number,
          o.kedaipos_pos_name, o.customer_name_walkin,
          b.name AS branch_name,
          s.name AS staff_name,
          c.brand AS car_brand, c.model AS car_model
          FROM orders o
          LEFT JOIN branches b ON b.id = o.branch_id
          LEFT JOIN staff    s ON s.id = o.staff_id
          LEFT JOIN cars     c ON c.id = o.vehicle_id
         WHERE date(${bizDay('o.')} AT TIME ZONE 'Asia/Brunei') BETWEEN ${from}::date AND ${to}::date
           ${branchFilter} ${pmFilter} ${staffFilter} ${searchFilter} ${realOrders('o.')}
         ORDER BY ${bizDay('o.')} ASC
      `)).rows as Array<any>;

      // Map our internal payment_method to the KedaiPOS labels the
      // historical xlsx uses, so Power BI dashboards keyed off the
      // string values keep working unchanged.
      const paymentLabel = (pm: string, qrProvider: string | null): string => {
        switch (pm) {
          case 'cash':          return 'Cash';
          case 'bank_transfer': return 'Bank Transfer';
          case 'card':          return 'Card';
          case 'baiduri_pay':   return 'Baiduripay';
          case 'voucher':       return 'Voucher';
          case 'subscription':  return 'Subscription';
          case 'qr_code':
            if (qrProvider === 'pocket_pay')          return 'Website cucixpress.com (Web Pocket QR)';
            if (qrProvider === 'pocket_pay_qr')       return 'Pocket Payment QR';
            if (qrProvider === 'pocket_pay_invoice')  return 'Pocket Payment Invoice';
            if (qrProvider === 'dst_easy' || qrProvider === 'quickpay') return 'Quickpay';
            if (qrProvider === 'baiduri_ms')          return 'Baiduri MS Payment Request';
            // Owner-added wallets (e.g. 'progresif_ding') — humanise the slug so
            // reports attribute them on their own instead of lumping them under
            // Pocket Payment QR. (NULL provider stays the legacy Pocket default.)
            if (qrProvider) {
              return qrProvider.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            }
            return 'Pocket Payment QR';
          default: return pm;
        }
      };

      // Excel serial date math, in Asia/Brunei (UTC+8). Excel epoch = 1899-12-30
      // (the "Lotus leap-year bug" baseline that Excel inherits), which is
      // 25569 days before the Unix epoch.
      const EXCEL_EPOCH_OFFSET_DAYS = 25569;
      const excelDateParts = (utc: Date) => {
        const bndMs = utc.getTime() + 8 * 3600_000;
        const days = bndMs / 86_400_000;
        const dateSerial = Math.floor(days) + EXCEL_EPOCH_OFFSET_DAYS;
        const timeFrac = days - Math.floor(days);
        return { dateSerial, timeFrac };
      };

      const dash = (v: any) => (v === null || v === undefined || v === '' ? '-' : v);
      const cents = (n: number | null | undefined) => (n == null ? 0 : n / 100);

      const ExcelJSMod = await import('exceljs');
      const ExcelJS = (ExcelJSMod as any).default ?? ExcelJSMod;

      const HEADERS = [
        'Source.Name', 'ID', 'Receipt Date', 'Receipt Time', 'Store Name',
        'POS Name', 'Employee Name', 'Is Refund', 'Original Receipt No',
        'Order Number', 'Customer Name', 'Payment Type', 'Subtotal',
        'Discount Total', 'Promocode Discount Total', 'Service Charge Total',
        'Tax Total', 'Order Total', 'Paid Amount', 'Change', 'Order Notes',
        'Item Notes', 'Extracted_Brand', 'Extracted_Model', 'License_Plate',
      ];

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('cuci xpress');

      ws.columns = HEADERS.map((h: string) => ({
        header: h,
        key: h,
        width: Math.min(28, Math.max(10, h.length + 2)),
      }));

      for (const r of rows) {
        const { dateSerial, timeFrac } = excelDateParts(new Date(r.created_at));
        const excelRow = ws.addRow([
          'cucixpress_live_export',
          r.kedaipos_id ?? r.id,
          dateSerial,
          timeFrac,
          dash(r.branch_name),
          dash(r.kedaipos_pos_name ?? 'Default'),
          dash(r.staff_name),
          r.status === 'refunded' ? 'Yes' : 'No',
          dash(r.original_receipt_no),
          dash(r.kedaipos_order_number ?? r.ticket_code),
          dash(r.customer_name_walkin),
          paymentLabel(r.payment_method, r.qr_provider),
          cents(r.subtotal_cents),
          cents(r.discount_cents),
          cents(r.promo_discount_cents),
          cents(r.service_charge_cents),
          cents(r.tax_cents),
          cents(r.total_cents),
          cents(r.paid_amount_cents),
          cents(r.change_cents),
          dash(r.order_notes),
          dash(r.item_notes),
          dash(r.car_brand),
          dash(r.car_model),
          dash(r.plate),
        ]);
        // Format columns C (Receipt Date) and D (Receipt Time) as date/time
        // so Power BI / Excel render them correctly.
        excelRow.getCell(3).numFmt = 'yyyy-mm-dd';
        excelRow.getCell(4).numFmt = 'hh:mm:ss';
      }

      const buf = Buffer.from(await wb.xlsx.writeBuffer());

      const pad = (n: number) => String(n).padStart(2, '0');
      const stamp = (() => {
        const d = new Date();
        return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
      })();
      const filename = `cucixpress_master_sales_${from}_to_${to}_${stamp}.xlsx`;

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', String(buf.length));
      res.end(buf);
    } catch (err) {
      console.error('[admin.reports.orders.export] failed:', err);
      res.status(500).json({ error: 'export_failed' });
    }
  });

  // GET /api/admin/reports/payment-methods
  // Same range/branch filters as the orders report. Aggregates orders by
  // payment_method (+ qr_provider for QR payments) so the owner can see
  // the cash/card/transfer/QR mix at a glance.
  app.get('/api/admin/reports/payment-methods', requireStaff, requireStaffRole('owner', 'manager', 'cashier', 'investor'), async (req, res) => {
    const branchParam = String(req.query.branch_id ?? 'all').trim();
    const branchId =
      branchParam === '' || branchParam === 'all' ? null : Number(branchParam);
    if (branchId !== null && (!Number.isFinite(branchId) || branchId <= 0)) {
      return res.status(400).json({ error: 'invalid_branch_id' });
    }
    const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    const fromParam = String(req.query.from ?? '').trim();
    const toParam = String(req.query.to ?? '').trim();

    try {
      const todayRow = (await db.execute(
        sql`SELECT (now() AT TIME ZONE 'Asia/Brunei')::date AS d`,
      )).rows[0] as { d: string };
      const from = isDate(fromParam) ? fromParam : todayRow.d;
      const to = isDate(toParam) ? toParam : from;
      const branchFilter = branchId !== null ? sql`AND o.branch_id = ${branchId}` : sql``;

      const rows = (await db.execute(sql`
        SELECT
          o.payment_method,
          o.qr_provider,
          COUNT(*)::int                                                                            AS transactions,
          COUNT(*) FILTER (WHERE o.status <> 'refunded')::int                                      AS paid_count,
          COUNT(*) FILTER (WHERE o.status =  'refunded')::int                                      AS refund_count,
          ${grossSalesCents('o.')}::bigint                                                        AS sales_cents,
          COALESCE(SUM(CASE WHEN o.status =  'refunded' THEN o.total_cents ELSE 0 END),0)::bigint  AS refund_cents
          FROM orders o
         WHERE date(${bizDay('o.')} AT TIME ZONE 'Asia/Brunei') BETWEEN ${from}::date AND ${to}::date
           ${branchFilter} ${realOrders('o.')}
         GROUP BY 1, 2
         ORDER BY sales_cents DESC
      `)).rows as Array<any>;

      const rateMap = await loadMdrRateMap(db);
      const totalSales = rows.reduce((a, r) => a + Number(r.sales_cents ?? 0), 0);
      const totalTx    = rows.reduce((a, r) => a + Number(r.transactions ?? 0), 0);
      const totalRefund = rows.reduce((a, r) => a + Number(r.refund_cents ?? 0), 0);

      const mappedRows = rows.map((r) => {
        const sales = Number(r.sales_cents ?? 0);
        const refund = Number(r.refund_cents ?? 0);
        const bps = mdrRateFor(rateMap, r.payment_method, r.qr_provider);
        // sales is gross per grossSalesCents (each original charge counted
        // once); fee base is that gross, so pass 0 refund to avoid double-count.
        const fee = mdrFeeForGroup(bps, sales, 0);
        return {
          payment_method: r.payment_method,
          qr_provider: r.qr_provider,
          transactions: Number(r.transactions ?? 0),
          paid_count: Number(r.paid_count ?? 0),
          refund_count: Number(r.refund_count ?? 0),
          sales_cents: sales,
          refund_cents: refund,
          mdr_bps: bps,
          mdr_fee_cents: fee,
          net_cents: sales - refund - fee,
          share_pct: totalSales > 0 ? Math.round((sales / totalSales) * 1000) / 10 : 0,
        };
      });
      const totalFee = mappedRows.reduce((a, r) => a + r.mdr_fee_cents, 0);

      const branches = (await db.execute(
        sql`SELECT id, name FROM branches ORDER BY name`,
      )).rows;

      res.json({
        filter: { branch_id: branchId, from, to },
        branches,
        totals: {
          transactions: totalTx,
          sales_cents: totalSales,
          refund_cents: totalRefund,
          mdr_fee_cents: totalFee,
          net_cents: totalSales - totalRefund - totalFee,
        },
        rows: mappedRows,
      });
    } catch (err) {
      console.error('[admin.reports.payment-methods] failed:', err);
      res.status(500).json({ error: 'report_failed' });
    }
  });

  // GET /api/admin/reports/best-selling
  // Same range/branch filters. Counts package + addon line-items across
  // non-refunded orders. Each order contributes 1 package row (using
  // orders.package_name + orders.package_id) plus one row per addon
  // unwrapped from orders.addons jsonb (each element has {id,name,
  // price_cents}). Revenue for the package = total_cents minus the sum
  // of its addon snapshot prices (so package + addons sum back to the
  // order total). Returns the top N (default 25, capped at 100).
  app.get('/api/admin/reports/best-selling', requireStaff, requireStaffRole('owner', 'manager', 'cashier', 'investor'), async (req, res) => {
    const branchParam = String(req.query.branch_id ?? 'all').trim();
    const branchId =
      branchParam === '' || branchParam === 'all' ? null : Number(branchParam);
    if (branchId !== null && (!Number.isFinite(branchId) || branchId <= 0)) {
      return res.status(400).json({ error: 'invalid_branch_id' });
    }
    const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    const fromParam = String(req.query.from ?? '').trim();
    const toParam = String(req.query.to ?? '').trim();
    const limit = Math.min(100, Math.max(5, Number(req.query.limit ?? 25) || 25));

    try {
      const todayRow = (await db.execute(
        sql`SELECT (now() AT TIME ZONE 'Asia/Brunei')::date AS d`,
      )).rows[0] as { d: string };
      const from = isDate(fromParam) ? fromParam : todayRow.d;
      const to = isDate(toParam) ? toParam : from;
      const branchFilter = branchId !== null ? sql`AND branch_id = ${branchId}` : sql``;

      const rows = (await db.execute(sql`
        WITH paid AS (
          SELECT id, package_id, package_name, total_cents, COALESCE(addons,'[]'::jsonb) AS addons
            FROM orders
           WHERE status <> 'refunded'
             AND date(${bizDay()} AT TIME ZONE 'Asia/Brunei') BETWEEN ${from}::date AND ${to}::date
             ${branchFilter} ${realOrders()} ${excludeSubscriptionSales()}
        ),
        pkg_items AS (
          SELECT
            'package'                                                  AS kind,
            COALESCE(package_id, 'pkg_unknown')                        AS item_id,
            COALESCE(package_name, 'Unknown package')                  AS item_name,
            1                                                          AS qty,
            (total_cents
              - COALESCE((SELECT SUM((a->>'price_cents')::int)
                            FROM jsonb_array_elements(addons) a), 0)
            )::bigint                                                  AS revenue_cents
            FROM paid
        ),
        addon_items AS (
          SELECT
            'addon'                                                    AS kind,
            COALESCE(a->>'id',   'addon_unknown')                      AS item_id,
            COALESCE(a->>'name', 'Unknown add-on')                     AS item_name,
            1                                                          AS qty,
            COALESCE((a->>'price_cents')::bigint, 0)                   AS revenue_cents
            FROM paid, jsonb_array_elements(paid.addons) a
        ),
        all_items AS (
          SELECT * FROM pkg_items
          UNION ALL
          SELECT * FROM addon_items
        )
        SELECT kind, item_id, item_name,
               SUM(qty)::int          AS quantity,
               SUM(revenue_cents)::bigint AS revenue_cents
          FROM all_items
         GROUP BY kind, item_id, item_name
         ORDER BY quantity DESC, revenue_cents DESC
         LIMIT ${limit}
      `)).rows as Array<any>;

      const totalsRow = (await db.execute(sql`
        SELECT
          COALESCE(SUM(1 + COALESCE(jsonb_array_length(addons),0)),0)::int AS items_sold,
          COALESCE(SUM(total_cents),0)::bigint                             AS revenue_cents
          FROM orders
         WHERE status <> 'refunded'
           AND date(${bizDay()} AT TIME ZONE 'Asia/Brunei') BETWEEN ${from}::date AND ${to}::date
           ${branchFilter} ${realOrders()} ${excludeSubscriptionSales()}
      `)).rows[0] as { items_sold: number; revenue_cents: number };

      const totalQty     = Number(totalsRow.items_sold ?? 0);
      const totalRevenue = Number(totalsRow.revenue_cents ?? 0);

      const branches = (await db.execute(
        sql`SELECT id, name FROM branches ORDER BY name`,
      )).rows;

      res.json({
        filter: { branch_id: branchId, from, to, limit },
        branches,
        totals: { items_sold: totalQty, revenue_cents: totalRevenue },
        rows: rows.map((r) => {
          const qty = Number(r.quantity ?? 0);
          const rev = Number(r.revenue_cents ?? 0);
          return {
            kind: r.kind,
            item_id: r.item_id,
            item_name: r.item_name,
            quantity: qty,
            revenue_cents: rev,
            qty_share_pct:    totalQty > 0     ? Math.round((qty / totalQty)         * 1000) / 10 : 0,
            revenue_share_pct: totalRevenue > 0 ? Math.round((rev / totalRevenue)     * 1000) / 10 : 0,
          };
        }),
      });
    } catch (err) {
      console.error('[admin.reports.best-selling] failed:', err);
      res.status(500).json({ error: 'report_failed' });
    }
  });

  // GET /api/admin/reports/trends?from=YYYY-MM-DD&to=YYYY-MM-DD&branch_id=N|all
  // Phase 9 — Owner trends. Returns:
  //   - daily series (sales / refunds / transactions per day in range)
  //   - by_branch breakdown (totals per branch over the same range)
  //   - heatmap (orders & sales bucketed by day-of-week × hour, Asia/Brunei)
  //   - totals (range KPIs)
  // Owner + manager only. Cashier intentionally excluded — this is the
  // strategic "where do I spend my staffing budget" view.
  app.get('/api/admin/reports/trends', requireStaff, requireStaffRole('owner', 'manager', 'investor'), async (req, res) => {
    const branchParam = String(req.query.branch_id ?? 'all').trim();
    const branchId =
      branchParam === '' || branchParam === 'all' ? null : Number(branchParam);
    if (branchId !== null && (!Number.isFinite(branchId) || branchId <= 0)) {
      return res.status(400).json({ error: 'invalid_branch_id' });
    }
    const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    const fromParam = String(req.query.from ?? '').trim();
    const toParam = String(req.query.to ?? '').trim();

    try {
      // Default: last 30 days ending today (Brunei).
      const todayRow = (await db.execute(
        sql`SELECT (now() AT TIME ZONE 'Asia/Brunei')::date AS d`,
      )).rows[0] as { d: string };
      const to = isDate(toParam) ? toParam : todayRow.d;
      const from = isDate(fromParam)
        ? fromParam
        : (await db.execute(sql`SELECT (${to}::date - INTERVAL '29 days')::date AS d`)).rows[0].d as string;

      const branchFilter = branchId !== null ? sql`AND o.branch_id = ${branchId}` : sql``;

      const branches = (await db.execute(sql`SELECT id, name FROM branches ORDER BY name`)).rows;

      // Daily series — fill gaps with generate_series so the chart has no holes.
      const dailyRows = (await db.execute(sql`
        WITH days AS (
          SELECT generate_series(${from}::date, ${to}::date, INTERVAL '1 day')::date AS d
        )
        SELECT d AS date,
               COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END), 0)::bigint AS sales_cents,
               COALESCE(SUM(CASE WHEN o.status =  'refunded' THEN o.total_cents ELSE 0 END), 0)::bigint AS refund_cents,
               COUNT(o.id) FILTER (WHERE o.status <> 'refunded')::int AS transactions
          FROM days
          LEFT JOIN orders o
            ON date(${bizDay('o.')} AT TIME ZONE 'Asia/Brunei') = d
            ${branchFilter} ${realOrders('o.')} ${excludeSubscriptionSales('o.')}
         GROUP BY d
         ORDER BY d
      `)).rows as Array<{ date: string; sales_cents: string | number; refund_cents: string | number; transactions: number }>;

      // By-branch totals.
      const byBranchRows = (await db.execute(sql`
        SELECT b.id AS branch_id, b.name AS branch_name,
               COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END), 0)::bigint AS sales_cents,
               COALESCE(SUM(CASE WHEN o.status =  'refunded' THEN o.total_cents ELSE 0 END), 0)::bigint AS refund_cents,
               COUNT(o.id) FILTER (WHERE o.status <> 'refunded')::int AS transactions
          FROM branches b
          LEFT JOIN orders o
            ON o.branch_id = b.id
           AND date(${bizDay('o.')} AT TIME ZONE 'Asia/Brunei') BETWEEN ${from}::date AND ${to}::date
           ${realOrders('o.')} ${excludeSubscriptionSales('o.')}
         ${branchId !== null ? sql`WHERE b.id = ${branchId}` : sql``}
         GROUP BY b.id, b.name
         ORDER BY sales_cents DESC, b.name
      `)).rows;

      // Heatmap — DOW (0=Sun..6=Sat) × hour (0..23) in Asia/Brunei.
      const heatmapRows = (await db.execute(sql`
        SELECT EXTRACT(DOW  FROM (${bizDay('o.')} AT TIME ZONE 'Asia/Brunei'))::int AS dow,
               EXTRACT(HOUR FROM (${bizDay('o.')} AT TIME ZONE 'Asia/Brunei'))::int AS hour,
               COUNT(*)::int AS transactions,
               COALESCE(SUM(o.total_cents), 0)::bigint AS sales_cents
          FROM orders o
         WHERE date(${bizDay('o.')} AT TIME ZONE 'Asia/Brunei') BETWEEN ${from}::date AND ${to}::date
           AND o.status <> 'refunded'
           ${branchFilter} ${realOrders('o.')} ${excludeSubscriptionSales('o.')}
         GROUP BY 1, 2
         ORDER BY 1, 2
      `)).rows as Array<{ dow: number; hour: number; transactions: number; sales_cents: string | number }>;

      // Range totals.
      const totalsRow = (await db.execute(sql`
        SELECT COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END), 0)::bigint AS sales_cents,
               COALESCE(SUM(CASE WHEN o.status =  'refunded' THEN o.total_cents ELSE 0 END), 0)::bigint AS refund_cents,
               COUNT(*) FILTER (WHERE o.status <> 'refunded')::int AS transactions,
               COUNT(*) FILTER (WHERE o.status =  'refunded')::int AS refund_count
          FROM orders o
         WHERE date(${bizDay('o.')} AT TIME ZONE 'Asia/Brunei') BETWEEN ${from}::date AND ${to}::date
           ${branchFilter} ${realOrders('o.')} ${excludeSubscriptionSales('o.')}
      `)).rows[0] as any;

      const sales = Number(totalsRow.sales_cents ?? 0);
      const tx = Number(totalsRow.transactions ?? 0);

      res.json({
        filter: { branch_id: branchId, from, to },
        branches,
        daily: dailyRows.map((r) => ({
          date: r.date,
          sales_cents: Number(r.sales_cents),
          refund_cents: Number(r.refund_cents),
          transactions: Number(r.transactions),
        })),
        by_branch: byBranchRows.map((r: any) => ({
          branch_id: r.branch_id,
          branch_name: r.branch_name,
          sales_cents: Number(r.sales_cents),
          refund_cents: Number(r.refund_cents),
          transactions: Number(r.transactions),
        })),
        heatmap: heatmapRows.map((r) => ({
          dow: Number(r.dow),
          hour: Number(r.hour),
          transactions: Number(r.transactions),
          sales_cents: Number(r.sales_cents),
        })),
        totals: {
          sales_cents: sales,
          refund_cents: Number(totalsRow.refund_cents ?? 0),
          transactions: tx,
          refund_count: Number(totalsRow.refund_count ?? 0),
          avg_ticket_cents: tx > 0 ? Math.round(sales / tx) : 0,
        },
      });
    } catch (err) {
      console.error('[admin.reports.trends] failed:', err);
      res.status(500).json({ error: 'report_failed' });
    }
  });

  // ==========================================================================
  // Phase 5c — Catalog management (Packages + Add-ons)
  // Owner-only CRUD over the existing `packages` and `addons_catalog` tables.
  // No schema change. Manager role intentionally NOT included — pricing
  // changes are owner-only (reports/refunds remain manager-allowed).
  //
  // Deletion strategy: soft-delete (toggle is_active=false) is the safe
  // path because every order snapshots the package_name + price_cents at
  // the time of sale, so historical reports keep working even if a row
  // disappears. We still allow hard delete via DELETE …?force=1 when no
  // order has ever referenced the row, to keep the catalog tidy.
  // ==========================================================================

  // GET /api/admin/catalog/packages
  // GET /api/admin/branches  — small helper used by the package edit
  // dialog (and anywhere else admin needs to render branch checkboxes).
  // ==========================================================================
  // SharePoint integration (admin only) — Phase 13.
  //
  // GET    /api/admin/integrations/sharepoint           snapshot of outbox
  // POST   /api/admin/integrations/sharepoint/test      ping Excel table
  // POST   /api/admin/integrations/sharepoint/drain     fire one drain pass now
  // POST   /api/admin/integrations/sharepoint/retry/:id flip a failed row -> pending
  // POST   /api/admin/integrations/sharepoint/reset     clear token + path caches
  //
  // All locked behind owner role — these touch business-critical config.
  // ==========================================================================
  app.get(
    '/api/admin/integrations/sharepoint',
    requireStaff,
    requireStaffRole('owner', 'manager'),
    async (_req, res) => {
      try {
        const snap = await getSharePointSnapshot();
        res.json({ ok: true, ...snap });
      } catch (err) {
        console.error('[admin.sharepoint.snapshot] failed:', err);
        res.status(500).json({ error: 'snapshot_failed' });
      }
    },
  );

  app.post(
    '/api/admin/integrations/sharepoint/test',
    requireStaff,
    requireStaffRole('owner'),
    async (_req, res) => {
      try {
        const status = await testSharePointConnection();
        res.json({ ok: true, ...status });
      } catch (err: any) {
        res.status(500).json({ error: 'test_failed', detail: String(err?.message ?? err) });
      }
    },
  );

  app.post(
    '/api/admin/integrations/sharepoint/drain',
    requireStaff,
    requireStaffRole('owner'),
    async (_req, res) => {
      try {
        if (!isSharePointConfigured()) {
          return res.status(400).json({ error: 'not_configured' });
        }
        const result = await sharepointDrainOnce();
        res.json({ ok: true, ...result });
      } catch (err: any) {
        console.error('[admin.sharepoint.drain] failed:', err);
        res.status(500).json({ error: 'drain_failed', detail: String(err?.message ?? err) });
      }
    },
  );

  app.post(
    '/api/admin/integrations/sharepoint/retry/:id',
    requireStaff,
    requireStaffRole('owner'),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_id' });
        const found = await retrySharePointRow(id);
        if (!found) return res.status(404).json({ error: 'not_found_or_already_sent' });
        res.json({ ok: true });
      } catch (err) {
        console.error('[admin.sharepoint.retry] failed:', err);
        res.status(500).json({ error: 'retry_failed' });
      }
    },
  );

  app.post(
    '/api/admin/integrations/sharepoint/reset',
    requireStaff,
    requireStaffRole('owner'),
    async (_req, res) => {
      resetSharePointCaches();
      res.json({ ok: true });
    },
  );

  app.get('/api/admin/branches', requireStaff, requireStaffRole('owner', 'manager'), async (_req, res) => {
    try {
      const rows = (await db.execute(
        sql`SELECT id, name, location FROM branches ORDER BY name`,
      )).rows;
      res.json({ rows });
    } catch (err) {
      console.error('[admin.branches.list] failed:', err);
      res.status(500).json({ error: 'list_failed' });
    }
  });

  // ==========================================================================
  // Phase 10 — Customers + Branches CRM
  // Customer list/profile/edit (owner+manager) and branch CRUD (owner only).
  // No new tables; uses existing customers / cars / orders / branches.
  // ==========================================================================

  // ---- Phase 12b-3: customer segment filters --------------------------------
  // Composable AND-fragments evaluated against alias `c` (customers).
  // Returned as Drizzle SQL fragments so they slot into list + CSV queries.
  const SEGMENTS = ['vip', 'gold', 'silver', 'bronze', 'at_risk', 'online', 'multi_branch', 'new', 'legacy', 'no_account', 'registered'] as const;
  type Segment = (typeof SEGMENTS)[number];

  // All filtering happens against the unified `person` CTE (alias `p`),
  // whose columns are pre-computed by personCte() below. This keeps
  // the predicates short and lets ghost (unlinked-car) rows participate.
  function segmentFragment(seg: Segment | null) {
    if (seg === null) return sql``;
    if (seg === 'vip')          return sql`AND p.total_spent_cents >= 50000`;
    if (seg === 'gold' || seg === 'silver' || seg === 'bronze')
                                 return sql`AND p.vip_tier = ${seg}`;
    if (seg === 'legacy')       return sql`AND p.has_legacy`;
    if (seg === 'online')       return sql`AND p.is_online`;
    if (seg === 'multi_branch') return sql`AND p.branches_visited >= 2`;
    if (seg === 'new')          return sql`AND p.created_at > NOW() - INTERVAL '14 days'`;
    if (seg === 'no_account')   return sql`AND p.has_account = FALSE`;
    if (seg === 'registered')   return sql`AND p.has_account = TRUE`;
    if (seg === 'at_risk')
      return sql`AND p.visits >= 2 AND p.last_visit_at < NOW() - INTERVAL '30 days'`;
    return sql``;
  }

  // Unified "person" CTE — every row is either:
  //   • kind='customer' (ref_id = customers.id)        — registered or walk-in customer
  //   • kind='ghost'    (ref_id = -cars.id)            — legacy/unlinked car (no signed-up
  //                                                      customer record yet) that still has
  //                                                      VIP-tier data or order history.
  //
  // Both branches expose the SAME column set so the rest of the queries (list,
  // CSV, stats) just SELECT from `p` and apply the same filters.
  function personCte() {
    return sql`WITH person AS (
      -- Registered/walk-in customers
      SELECT
        c.id                                                                                    AS ref_id,
        'customer'::text                                                                        AS kind,
        c.id                                                                                    AS customer_id,
        NULL::int                                                                               AS ghost_car_id,
        c.name                                                                                  AS name,
        c.phone                                                                                 AS phone,
        c.notes                                                                                 AS notes,
        c.created_at                                                                            AS created_at,
        (c.user_id IS NOT NULL)                                                                 AS has_account,
        (SELECT COUNT(*)::int FROM cars car WHERE car.customer_id = c.id)                       AS vehicle_count,
        (SELECT COUNT(*)::int FROM orders o JOIN cars car ON car.id = o.vehicle_id
          WHERE car.customer_id = c.id AND o.status <> 'refunded')                              AS visits,
        (SELECT COALESCE(SUM(o.total_cents),0)::bigint FROM orders o JOIN cars car ON car.id = o.vehicle_id
          WHERE car.customer_id = c.id AND o.status <> 'refunded')                              AS total_spent_cents,
        (SELECT MAX(o.created_at) FROM orders o JOIN cars car ON car.id = o.vehicle_id
          WHERE car.customer_id = c.id)                                                         AS last_visit_at,
        (SELECT car.vip_tier FROM cars car
          WHERE car.customer_id = c.id AND car.vip_tier IS NOT NULL
          ORDER BY CASE car.vip_tier WHEN 'gold' THEN 1 WHEN 'silver' THEN 2 WHEN 'bronze' THEN 3 ELSE 9 END
          LIMIT 1)                                                                              AS vip_tier,
        (SELECT b.name FROM orders o JOIN cars car ON car.id = o.vehicle_id JOIN branches b ON b.id = o.branch_id
          WHERE car.customer_id = c.id AND o.status <> 'refunded'
          GROUP BY b.id, b.name ORDER BY COUNT(*) DESC, MAX(o.created_at) DESC LIMIT 1)         AS favourite_branch,
        (SELECT COUNT(DISTINCT o.branch_id)::int FROM orders o JOIN cars car ON car.id = o.vehicle_id
          WHERE car.customer_id = c.id AND o.status <> 'refunded')                              AS branches_visited,
        EXISTS (SELECT 1 FROM orders o JOIN cars car ON car.id = o.vehicle_id
                 WHERE car.customer_id = c.id AND o.legacy_source IS NOT NULL)                  AS has_legacy,
        EXISTS (SELECT 1 FROM orders o JOIN cars car ON car.id = o.vehicle_id
                 WHERE car.customer_id = c.id AND o.qr_provider = 'pocket_pay')                 AS is_online,
        (SELECT STRING_AGG(car.license_plate, '; ' ORDER BY car.id)
           FROM cars car WHERE car.customer_id = c.id)                                          AS plates,
        (SELECT ARRAY_AGG(DISTINCT o.branch_id) FROM orders o JOIN cars car ON car.id = o.vehicle_id
          WHERE car.customer_id = c.id AND o.branch_id IS NOT NULL)                             AS branch_ids
      FROM customers c

      UNION ALL

      -- "Ghost" customers — cars not linked to any customer record but with VIP tier
      -- or order history (so they're worth surfacing in the CRM).
      SELECT
        -car.id                                                                                  AS ref_id,
        'ghost'::text                                                                            AS kind,
        NULL::int                                                                                AS customer_id,
        car.id                                                                                   AS ghost_car_id,
        car.license_plate                                                                        AS name,
        NULL::text                                                                               AS phone,
        NULL::text                                                                               AS notes,
        COALESCE(car.last_seen_at, '2020-01-01'::timestamptz)                                   AS created_at,
        FALSE                                                                                    AS has_account,
        1                                                                                        AS vehicle_count,
        (SELECT COUNT(*)::int FROM orders o WHERE o.vehicle_id = car.id AND o.status <> 'refunded')        AS visits,
        GREATEST(
          car.total_spent_cents,
          COALESCE((SELECT SUM(o.total_cents)::bigint FROM orders o WHERE o.vehicle_id = car.id AND o.status <> 'refunded'), 0)
        )                                                                                        AS total_spent_cents,
        COALESCE(
          (SELECT MAX(o.created_at) FROM orders o WHERE o.vehicle_id = car.id),
          car.last_seen_at
        )                                                                                        AS last_visit_at,
        car.vip_tier                                                                             AS vip_tier,
        (SELECT b.name FROM orders o JOIN branches b ON b.id = o.branch_id
          WHERE o.vehicle_id = car.id AND o.status <> 'refunded'
          GROUP BY b.id, b.name ORDER BY COUNT(*) DESC, MAX(o.created_at) DESC LIMIT 1)          AS favourite_branch,
        (SELECT COUNT(DISTINCT o.branch_id)::int FROM orders o
          WHERE o.vehicle_id = car.id AND o.status <> 'refunded')                                AS branches_visited,
        (car.vip_tier IS NOT NULL OR EXISTS (
          SELECT 1 FROM orders o WHERE o.vehicle_id = car.id AND o.legacy_source IS NOT NULL))   AS has_legacy,
        EXISTS (SELECT 1 FROM orders o WHERE o.vehicle_id = car.id AND o.qr_provider = 'pocket_pay')        AS is_online,
        car.license_plate                                                                        AS plates,
        (SELECT ARRAY_AGG(DISTINCT o.branch_id) FROM orders o
          WHERE o.vehicle_id = car.id AND o.branch_id IS NOT NULL)                               AS branch_ids
      FROM cars car
      WHERE car.customer_id IS NULL
        AND (car.vip_tier IS NOT NULL
          OR car.total_visits > 0
          OR EXISTS (SELECT 1 FROM orders o WHERE o.vehicle_id = car.id))
    )`;
  }

  // Shared filter parser for /api/admin/customers list + export.
  function parseCustomerFilters(req: Request) {
    const search = String(req.query.search ?? '').trim();
    const branchParam = String(req.query.branch_id ?? 'all').trim();
    const branchId =
      branchParam === '' || branchParam === 'all' ? null : Number(branchParam);
    if (branchId !== null && (!Number.isFinite(branchId) || branchId <= 0)) {
      return { error: 'invalid_branch_id' as const };
    }
    const segParam = String(req.query.segment ?? 'all').trim();
    const segment: Segment | null =
      segParam === 'all' || segParam === '' ? null
      : (SEGMENTS as readonly string[]).includes(segParam) ? (segParam as Segment)
      : null;
    if (segParam !== 'all' && segParam !== '' && segment === null) {
      return { error: 'invalid_segment' as const };
    }

    const searchFilter = search.length >= 2
      ? sql`AND (
              p.name  ILIKE ${'%' + search + '%'}
           OR p.phone ILIKE ${'%' + search + '%'}
           OR UPPER(REGEXP_REPLACE(COALESCE(p.plates, ''), '\\s+', '', 'g'))
              LIKE ${'%' + search.toUpperCase().replace(/\s+/g, '') + '%'}
          )`
      : sql``;
    const branchFilter = branchId !== null
      ? sql`AND ${branchId} = ANY(p.branch_ids)`
      : sql``;
    const segmentFilter = segmentFragment(segment);

    return { search, branchId, segment, searchFilter, branchFilter, segmentFilter };
  }

  // GET /api/admin/customers?search=&branch_id=&segment=&page=&per_page=
  // List customers with last-visit + total spend, paginated.
  app.get('/api/admin/customers', requireStaff, requireStaffRole('owner', 'manager'), async (req, res) => {
    const f = parseCustomerFilters(req);
    if ('error' in f) return res.status(400).json({ error: f.error });
    const { search, branchId, segment, searchFilter, branchFilter, segmentFilter } = f;

    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const perPage = Math.min(100, Math.max(10, Number(req.query.per_page ?? 25) || 25));
    const offset = (page - 1) * perPage;

    // Sorting — whitelist of sortable columns (keys must match the client).
    const SORT_COLUMNS: Record<string, string> = {
      name: 'p.name',
      has_account: 'p.has_account',
      favourite_branch: 'p.favourite_branch',
      vehicle_count: 'p.vehicle_count',
      visits: 'p.visits',
      total_spent_cents: 'p.total_spent_cents',
      last_visit_at: 'p.last_visit_at',
    };
    const sortKey = String(req.query.sort ?? '');
    const dir = String(req.query.dir ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    let orderExpr: string;
    if (sortKey === 'vip_tier') {
      orderExpr = `(CASE p.vip_tier WHEN 'gold' THEN 3 WHEN 'silver' THEN 2 WHEN 'bronze' THEN 1 ELSE 0 END) ${dir}, p.total_spent_cents DESC`;
    } else if (SORT_COLUMNS[sortKey]) {
      orderExpr = `${SORT_COLUMNS[sortKey]} ${dir} NULLS LAST`;
    } else {
      orderExpr = 'p.last_visit_at DESC NULLS LAST, p.created_at DESC';
    }
    const orderBy = sql.raw(`${orderExpr}, p.ref_id`);

    try {
      const countRow = (await db.execute(sql`
        ${personCte()}
        SELECT COUNT(*)::int AS n FROM person p
         WHERE 1=1 ${searchFilter} ${branchFilter} ${segmentFilter}
      `)).rows[0] as { n: number };

      const rows = (await db.execute(sql`
        ${personCte()}
        SELECT p.ref_id        AS id,
               p.kind,
               p.has_account,
               p.phone,
               p.name,
               p.notes,
               p.created_at,
               p.vehicle_count,
               p.visits,
               p.total_spent_cents,
               p.last_visit_at,
               p.vip_tier,
               p.favourite_branch,
               p.branches_visited,
               p.has_legacy,
               p.is_online,
               p.plates
          FROM person p
         WHERE 1=1 ${searchFilter} ${branchFilter} ${segmentFilter}
         ORDER BY ${orderBy}
         LIMIT ${perPage} OFFSET ${offset}
      `)).rows.map((r: any) => ({
        ...r,
        total_spent_cents: Number(r.total_spent_cents ?? 0),
        has_legacy: Boolean(r.has_legacy),
        has_account: Boolean(r.has_account),
        is_online: Boolean(r.is_online),
      }));

      const branches = (await db.execute(sql`SELECT id, name FROM branches ORDER BY name`)).rows;

      res.json({
        rows,
        page,
        per_page: perPage,
        total_count: countRow.n,
        branches,
        filter: { search, branch_id: branchId, segment },
      });
    } catch (err) {
      console.error('[admin.customers.list] failed:', err);
      res.status(500).json({ error: 'list_failed' });
    }
  });

  // GET /api/admin/customers/stats
  // Aggregate counts to power the header tiles on the Customers tab —
  // total customers, VIP tier breakdown, at-risk count, new sign-ups,
  // legacy-history coverage, lifetime spend & avg per customer.
  app.get('/api/admin/customers/stats', requireStaff, requireStaffRole('owner', 'manager'), async (_req, res) => {
    try {
      const row = (await db.execute(sql`
        ${personCte()}
        SELECT
          COUNT(*)::int                                                                                  AS total_customers,
          COUNT(*) FILTER (WHERE p.kind = 'customer')::int                                               AS registered_count,
          COUNT(*) FILTER (WHERE p.kind = 'ghost')::int                                                  AS ghost_count,
          COUNT(*) FILTER (WHERE p.has_account)::int                                                     AS has_account_count,
          COUNT(*) FILTER (WHERE p.vip_tier = 'gold')::int                                               AS gold_count,
          COUNT(*) FILTER (WHERE p.vip_tier = 'silver')::int                                             AS silver_count,
          COUNT(*) FILTER (WHERE p.vip_tier = 'bronze')::int                                             AS bronze_count,
          COUNT(*) FILTER (WHERE p.total_spent_cents >= 50000)::int                                     AS spend_vip_count,
          COUNT(*) FILTER (WHERE p.visits >= 2 AND p.last_visit_at < NOW() - INTERVAL '30 days')::int  AS at_risk_count,
          COUNT(*) FILTER (WHERE p.created_at > NOW() - INTERVAL '14 days')::int                       AS new_count,
          COUNT(*) FILTER (WHERE p.has_legacy)::int                                                     AS legacy_count,
          COUNT(*) FILTER (WHERE p.is_online)::int                                                      AS online_count,
          COALESCE(SUM(p.total_spent_cents), 0)::bigint                                                 AS total_spent_cents,
          COUNT(*) FILTER (WHERE p.visits > 0)::int                                                     AS active_count
        FROM person p
      `)).rows[0] as any;

      const total = Number(row.total_customers ?? 0);
      const totalSpent = Number(row.total_spent_cents ?? 0);
      const active = Number(row.active_count ?? 0);

      res.json({
        total_customers:   total,
        active_customers:  active,
        registered_count:  Number(row.registered_count ?? 0),
        ghost_count:       Number(row.ghost_count ?? 0),
        has_account_count: Number(row.has_account_count ?? 0),
        gold_count:        Number(row.gold_count ?? 0),
        silver_count:      Number(row.silver_count ?? 0),
        bronze_count:      Number(row.bronze_count ?? 0),
        spend_vip_count:   Number(row.spend_vip_count ?? 0),
        at_risk_count:     Number(row.at_risk_count ?? 0),
        new_count:         Number(row.new_count ?? 0),
        legacy_count:      Number(row.legacy_count ?? 0),
        online_count:      Number(row.online_count ?? 0),
        total_spent_cents: totalSpent,
        avg_spend_cents:   active > 0 ? Math.round(totalSpent / active) : 0,
      });
    } catch (err) {
      console.error('[admin.customers.stats] failed:', err);
      res.status(500).json({ error: 'stats_failed' });
    }
  });

  // GET /api/admin/accounts/stats
  // Powers the "Accounts & Logins" panel on the Dashboard tab: app account
  // sign-ups (users) + customer login activity (auth_sessions).
  // "Today"/"this month" are Brunei-local (Asia/Brunei). Note users.created_at
  // is a naive UTC timestamp, so it is shifted UTC->Brunei; auth_sessions
  // .created_at is timestamptz, so AT TIME ZONE alone converts it.
  app.get('/api/admin/accounts/stats', requireStaff, requireStaffRole('owner', 'manager'), async (_req, res) => {
    try {
      const row = (await db.execute(sql`
        SELECT
          (SELECT COUNT(*)::int FROM users) AS total_accounts,
          (SELECT COUNT(*)::int FROM users
             WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Brunei')::date
                   = (now() AT TIME ZONE 'Asia/Brunei')::date) AS registered_today,
          (SELECT COUNT(*)::int FROM users
             WHERE date_trunc('month', created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Brunei')
                   = date_trunc('month', now() AT TIME ZONE 'Asia/Brunei')) AS registered_this_month,
          (SELECT COUNT(DISTINCT user_id)::int FROM auth_sessions
             WHERE user_type = 'customer'
               AND (created_at AT TIME ZONE 'Asia/Brunei')::date
                   = (now() AT TIME ZONE 'Asia/Brunei')::date) AS logins_today,
          (SELECT COUNT(DISTINCT user_id)::int FROM auth_sessions
             WHERE user_type = 'customer' AND expires_at > now()) AS currently_logged_in,
          (SELECT COUNT(DISTINCT user_id)::int FROM auth_sessions
             WHERE user_type = 'customer') AS ever_logged_in
      `)).rows[0] as any;

      const recent = (await db.execute(sql`
        SELECT s.created_at AS at,
               NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS name
        FROM auth_sessions s
        JOIN users u ON u.id::text = s.user_id
        WHERE s.user_type = 'customer'
        ORDER BY s.created_at DESC
        LIMIT 8
      `)).rows as Array<{ at: string; name: string | null }>;

      const months = (await db.execute(sql`
        SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Brunei'), 'YYYY-MM') AS month,
               COUNT(*)::int AS count
        FROM users
        WHERE created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Brunei'
              >= date_trunc('month', now() AT TIME ZONE 'Asia/Brunei') - INTERVAL '11 months'
        GROUP BY 1 ORDER BY 1
      `)).rows as Array<{ month: string; count: number }>;

      const recentMapped = recent.map((r) => ({ at: r.at, name: r.name || 'Customer' }));

      res.json({
        total_accounts:        Number(row.total_accounts ?? 0),
        registered_today:      Number(row.registered_today ?? 0),
        registered_this_month: Number(row.registered_this_month ?? 0),
        logins_today:          Number(row.logins_today ?? 0),
        currently_logged_in:   Number(row.currently_logged_in ?? 0),
        ever_logged_in:        Number(row.ever_logged_in ?? 0),
        last_login:            recentMapped[0] ?? null,
        recent_logins:         recentMapped,
        signups_by_month:      months.map((m) => ({ month: m.month, count: Number(m.count) })),
      });
    } catch (err) {
      console.error('[admin.accounts.stats] failed:', err);
      res.status(500).json({ error: 'stats_failed' });
    }
  });

  // GET /api/admin/accounts/detail?metric=<key>
  // Drill-down list behind each "Accounts & Logins" tile. Registration
  // metrics list the app accounts (users); login metrics list the customers
  // with matching sessions (deduped to their most recent session). "Today"/
  // "this month" match the stats endpoint (Brunei-local). Capped at 1000 rows.
  app.get('/api/admin/accounts/detail', requireStaff, requireStaffRole('owner', 'manager'), async (req, res) => {
    const metric = String(req.query.metric ?? '');
    const TITLES: Record<string, string> = {
      total_accounts:        'All accounts',
      registered_today:      'Registered today',
      registered_this_month: 'New sign-ups this month',
      logins_today:          'Logged in today',
      currently_logged_in:   'Currently signed in',
      ever_logged_in:        'Ever logged in',
    };
    if (!(metric in TITLES)) return res.status(400).json({ error: 'invalid_metric' });

    const nameExpr = sql`NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '')`;
    try {
      let rows: Array<{ id: number; name: string | null; email: string | null; phone: string | null; at: string | null }>;

      if (metric === 'total_accounts' || metric === 'registered_today' || metric === 'registered_this_month') {
        const where =
          metric === 'registered_today'
            ? sql`WHERE (u.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Brunei')::date
                        = (now() AT TIME ZONE 'Asia/Brunei')::date`
            : metric === 'registered_this_month'
              ? sql`WHERE date_trunc('month', u.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Brunei')
                          = date_trunc('month', now() AT TIME ZONE 'Asia/Brunei')`
              : sql``;
        rows = (await db.execute(sql`
          SELECT u.id, ${nameExpr} AS name, u.email, u.phone_number AS phone,
                 u.created_at AS at
            FROM users u
            ${where}
           ORDER BY u.created_at DESC NULLS LAST
           LIMIT 1000
        `)).rows as any;
      } else {
        const where =
          metric === 'logins_today'
            ? sql`AND (s.created_at AT TIME ZONE 'Asia/Brunei')::date
                      = (now() AT TIME ZONE 'Asia/Brunei')::date`
            : metric === 'currently_logged_in'
              ? sql`AND s.expires_at > now()`
              : sql``;
        rows = (await db.execute(sql`
          SELECT u.id, ${nameExpr} AS name, u.email, u.phone_number AS phone,
                 MAX(s.created_at) AS at
            FROM auth_sessions s
            JOIN users u ON u.id::text = s.user_id
           WHERE s.user_type = 'customer' ${where}
           GROUP BY u.id, u.first_name, u.last_name, u.email, u.phone_number
           ORDER BY MAX(s.created_at) DESC
           LIMIT 1000
        `)).rows as any;
      }

      res.json({
        metric,
        title: TITLES[metric],
        rows: rows.map((r) => ({
          id: Number(r.id),
          name: r.name || 'Customer',
          email: r.email ?? null,
          phone: r.phone ?? null,
          at: r.at,
        })),
      });
    } catch (err) {
      console.error('[admin.accounts.detail] failed:', err);
      res.status(500).json({ error: 'detail_failed' });
    }
  });

  // GET /api/admin/customers/export.csv — Phase 12b-2.
  // Same filters as list (search/branch/segment) but no pagination.
  // Streams a CSV the user can open in Excel / Google Sheets.
  app.get('/api/admin/customers/export.csv', requireStaff, requireStaffRole('owner', 'manager'), async (req, res) => {
    const f = parseCustomerFilters(req);
    if ('error' in f) return res.status(400).json({ error: f.error });
    const { searchFilter, branchFilter, segmentFilter } = f;
    try {
      const rows = (await db.execute(sql`
        ${personCte()}
        SELECT p.ref_id AS id, p.kind, p.has_account,
               p.name, p.phone, p.created_at,
               p.vehicle_count, p.visits, p.total_spent_cents,
               p.last_visit_at, p.plates, p.vip_tier, p.favourite_branch
          FROM person p
         WHERE 1=1 ${searchFilter} ${branchFilter} ${segmentFilter}
         ORDER BY p.last_visit_at DESC NULLS LAST, p.created_at DESC
         LIMIT 10000
      `)).rows;

      const csvEscape = (v: any): string => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = ['id','kind','has_account','name','phone','plates','vip_tier','favourite_branch','vehicles','visits','lifetime_spend_bnd','last_visit_at','created_at'];
      const lines = [header.join(',')];
      for (const r of rows as any[]) {
        const spendBnd = (Number(r.total_spent_cents ?? 0) / 100).toFixed(2);
        lines.push([
          r.id, r.kind, r.has_account ? 'true' : 'false',
          r.name, r.phone, r.plates ?? '',
          r.vip_tier ?? '', r.favourite_branch ?? '',
          r.vehicle_count ?? 0, r.visits ?? 0, spendBnd,
          r.last_visit_at ? new Date(r.last_visit_at).toISOString() : '',
          r.created_at ? new Date(r.created_at).toISOString() : '',
        ].map(csvEscape).join(','));
      }

      const today = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="cucixpress-customers-${today}.csv"`);
      // BOM so Excel opens UTF-8 cleanly
      res.send('\uFEFF' + lines.join('\n'));
    } catch (err) {
      console.error('[admin.customers.export] failed:', err);
      res.status(500).json({ error: 'export_failed' });
    }
  });

  // ============================================================
  // Plate ownership tools (owner-only)
  //
  // Some plates were bulk-claimed by branch shell accounts, blocking the
  // real customer from adding their own car ("this plate is mine").
  // These endpoints let the owner look up who currently holds a plate
  // and transfer the car (with all its wash history — orders follow
  // vehicle_id) to the right customer, or detach it back to unclaimed.
  // ============================================================

  // GET /api/admin/plate-ownership?plate=KG2151
  app.get('/api/admin/plate-ownership', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const raw = String(req.query.plate ?? '').trim();
    if (!raw || raw.length > 20) return res.status(400).json({ error: 'invalid_plate' });
    const normalized = raw.toUpperCase().replace(/\s+/g, '');
    try {
      const car = (await db.execute(sql`
        SELECT car.id, car.license_plate, car.brand, car.model, car.color,
               car.user_id, car.customer_id, car.vip_tier,
               u.email        AS holder_email,
               TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS holder_user_name,
               u.phone_number AS holder_user_phone,
               c.name         AS holder_customer_name,
               c.phone        AS holder_customer_phone,
               (SELECT COUNT(*)::int FROM orders o WHERE o.vehicle_id = car.id AND o.status <> 'refunded') AS wash_count,
               (SELECT MAX(o.created_at) FROM orders o WHERE o.vehicle_id = car.id AND o.status <> 'refunded') AS last_visit_at
          FROM cars car
          LEFT JOIN users u     ON u.id = car.user_id
          LEFT JOIN customers c ON c.id = car.customer_id
         WHERE UPPER(REGEXP_REPLACE(car.license_plate, '\\s+', '', 'g')) = ${normalized}
         LIMIT 1
      `)).rows[0] as any;

      if (!car) return res.json({ found: false, plate: normalized });

      res.json({
        found: true,
        car: {
          id: Number(car.id),
          license_plate: car.license_plate,
          brand: car.brand ?? null,
          model: car.model ?? null,
          color: car.color ?? null,
          vip_tier: car.vip_tier ?? null,
          wash_count: Number(car.wash_count ?? 0),
          last_visit_at: car.last_visit_at ?? null,
        },
        holder: (car.user_id || car.customer_id) ? {
          user_id: car.user_id != null ? Number(car.user_id) : null,
          customer_id: car.customer_id != null ? Number(car.customer_id) : null,
          name: car.holder_customer_name || car.holder_user_name || null,
          email: car.holder_email ?? null,
          phone: car.holder_customer_phone || car.holder_user_phone || null,
        } : null,
      });
    } catch (err) {
      console.error('[admin.plateOwnership] failed:', err);
      res.status(500).json({ error: 'lookup_failed' });
    }
  });

  // POST /api/admin/plate-transfer
  // Body: { car_id: number, target_customer_id: number | null }
  // target_customer_id = null → detach the car back to "unclaimed"
  // (both user_id and customer_id NULL) so the rightful customer can
  // claim it themselves by adding the plate in their dashboard.
  app.post('/api/admin/plate-transfer', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const bodySchema = z.object({
      car_id: z.number().int().positive(),
      target_customer_id: z.number().int().positive().nullable(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
    const { car_id, target_customer_id } = parsed.data;

    try {
      const car = (await db.execute(sql`
        SELECT id, license_plate, user_id, customer_id FROM cars WHERE id = ${car_id} LIMIT 1
      `)).rows[0] as any;
      if (!car) return res.status(404).json({ error: 'car_not_found' });

      let newUserId: number | null = null;
      let targetName: string | null = null;
      if (target_customer_id !== null) {
        const target = (await db.execute(sql`
          SELECT c.id, c.name, c.user_id, u.email
            FROM customers c LEFT JOIN users u ON u.id = c.user_id
           WHERE c.id = ${target_customer_id} LIMIT 1
        `)).rows[0] as any;
        if (!target) return res.status(404).json({ error: 'customer_not_found' });
        newUserId = target.user_id != null ? Number(target.user_id) : null;
        targetName = target.name ?? null;
      }

      await db.execute(sql`
        UPDATE cars SET user_id = ${newUserId}, customer_id = ${target_customer_id}
         WHERE id = ${car_id}
      `);

      console.log(
        `[admin.plateTransfer] staff=${(req as any).staff?.user?.email ?? 'unknown'} ` +
        `car=${car_id} plate=${car.license_plate} ` +
        `from(user=${car.user_id ?? '-'},cust=${car.customer_id ?? '-'}) ` +
        `to(user=${newUserId ?? '-'},cust=${target_customer_id ?? '-'})`
      );

      res.json({
        ok: true,
        car_id,
        license_plate: car.license_plate,
        transferred_to: target_customer_id === null
          ? null
          : { customer_id: target_customer_id, name: targetName, user_id: newUserId },
      });
    } catch (err) {
      console.error('[admin.plateTransfer] failed:', err);
      res.status(500).json({ error: 'transfer_failed' });
    }
  });

  // GET /api/admin/customers/:id — full profile (vehicles + recent orders + LTV).
  // A negative `id` (e.g. `-7736`) addresses a "ghost" customer: a car that has
  // VIP/legacy data but isn't linked to any customer record yet.
  app.get('/api/admin/customers/:id', requireStaff, requireStaffRole('owner', 'manager'), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id === 0) return res.status(400).json({ error: 'invalid_id' });

    // -------- Ghost (unlinked car) profile -------------------------------------
    if (id < 0) {
      const carId = -id;
      try {
        const car = (await db.execute(sql`
          SELECT id, license_plate, brand, model, color, "type", last_seen_at,
                 vip_tier, vip_rank, total_visits AS cached_total_visits,
                 customer_id
            FROM cars WHERE id = ${carId} LIMIT 1
        `)).rows[0] as any;
        if (!car || car.customer_id) return res.status(404).json({ error: 'not_found' });

        const orders = (await db.execute(sql`
          SELECT o.id, o.ticket_code, o.plate, o.created_at, o.payment_method,
                 o.package_name, o.total_cents, o.status, o.refunded_at,
                 o.qr_provider, o.legacy_source,
                 b.name AS branch_name, s.name AS staff_name
            FROM orders o
            LEFT JOIN branches b ON b.id = o.branch_id
            LEFT JOIN staff    s ON s.id = o.staff_id
           WHERE o.vehicle_id = ${carId}
           ORDER BY o.created_at DESC
           LIMIT 100
        `)).rows;

        const stats = (await db.execute(sql`
          SELECT COUNT(*) FILTER (WHERE o.status <> 'refunded')::int AS visits,
                 COUNT(*) FILTER (WHERE o.status =  'refunded')::int AS refund_count,
                 COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END),0)::bigint AS spent_cents,
                 MIN(o.created_at) AS first_visit_at,
                 MAX(o.created_at) AS last_visit_at,
                 COUNT(DISTINCT o.branch_id)::int AS branch_count,
                 COUNT(*) FILTER (WHERE o.legacy_source IS NOT NULL)::int AS legacy_visits,
                 COUNT(*) FILTER (WHERE o.legacy_source IS NULL AND o.status <> 'refunded')::int AS native_visits
            FROM orders o WHERE o.vehicle_id = ${carId}
        `)).rows[0] as any;

        const branchSplit = (await db.execute(sql`
          SELECT b.id AS branch_id, b.name AS branch_name,
                 COUNT(*) FILTER (WHERE o.status <> 'refunded')::int AS visits,
                 COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END),0)::bigint AS spent_cents
            FROM orders o JOIN branches b ON b.id = o.branch_id
           WHERE o.vehicle_id = ${carId}
           GROUP BY b.id, b.name ORDER BY visits DESC, b.name
        `)).rows.map((r: any) => ({ ...r, spent_cents: Number(r.spent_cents ?? 0) }));

        const fav = branchSplit[0];

        return res.json({
          customer: {
            id, phone: null, name: car.license_plate, notes: null,
            user_id: null, created_at: car.last_seen_at,
            kind: 'ghost', has_account: false, email: null,
          },
          vehicles: [{
            id: car.id, license_plate: car.license_plate, brand: car.brand, model: car.model,
            color: car.color, type: car.type, last_seen_at: car.last_seen_at,
            vip_tier: car.vip_tier, vip_rank: car.vip_rank,
            cached_total_visits: car.cached_total_visits,
            visit_count: Number(stats.visits ?? 0),
            spent_cents: Number(stats.spent_cents ?? 0),
          }],
          orders,
          branch_split: branchSplit,
          stats: {
            visits: Number(stats.visits ?? 0),
            refund_count: Number(stats.refund_count ?? 0),
            spent_cents: Number(stats.spent_cents ?? 0),
            first_visit_at: stats.first_visit_at,
            last_visit_at: stats.last_visit_at,
            branch_count: Number(stats.branch_count ?? 0),
            legacy_visits: Number(stats.legacy_visits ?? 0),
            native_visits: Number(stats.native_visits ?? 0),
            favourite_branch_id: fav?.branch_id ?? null,
            favourite_branch_name: fav?.branch_name ?? null,
            vip_tier: car.vip_tier ?? null,
          },
        });
      } catch (err) {
        console.error('[admin.customers.detail.ghost] failed:', err);
        return res.status(500).json({ error: 'detail_failed' });
      }
    }

    try {
      const cust = (await db.execute(sql`
        SELECT c.id, c.phone, c.name, c.notes, c.user_id, c.created_at,
               'customer'::text AS kind, (c.user_id IS NOT NULL) AS has_account,
               u.email AS email
          FROM customers c
          LEFT JOIN users u ON u.id = c.user_id
         WHERE c.id = ${id} LIMIT 1
      `)).rows[0] as any;
      if (!cust) return res.status(404).json({ error: 'not_found' });

      const vehicles = (await db.execute(sql`
        SELECT id, license_plate, brand, model, color, "type", last_seen_at,
               vip_tier, vip_rank, total_visits AS cached_total_visits,
               (SELECT COUNT(*)::int FROM orders o WHERE o.vehicle_id = cars.id AND o.status <> 'refunded') AS visit_count,
               (SELECT COALESCE(SUM(o.total_cents),0)::bigint FROM orders o WHERE o.vehicle_id = cars.id AND o.status <> 'refunded') AS spent_cents
          FROM cars
         WHERE customer_id = ${id}
         ORDER BY
            CASE vip_tier WHEN 'gold' THEN 1 WHEN 'silver' THEN 2 WHEN 'bronze' THEN 3 ELSE 9 END,
            COALESCE(last_seen_at, 'epoch'::timestamptz) DESC, id DESC
      `)).rows.map((r: any) => ({ ...r, spent_cents: Number(r.spent_cents ?? 0) }));

      const orders = (await db.execute(sql`
        SELECT o.id, o.ticket_code, o.plate, o.created_at, o.payment_method,
               o.package_name, o.total_cents, o.status, o.refunded_at,
               o.qr_provider,
               b.name AS branch_name, s.name AS staff_name
          FROM orders o
          LEFT JOIN branches b ON b.id = o.branch_id
          LEFT JOIN staff    s ON s.id = o.staff_id
         WHERE o.vehicle_id IN (SELECT id FROM cars WHERE customer_id = ${id})
         ORDER BY o.created_at DESC
         LIMIT 100
      `)).rows;

      const stats = (await db.execute(sql`
        SELECT COUNT(*) FILTER (WHERE o.status <> 'refunded')::int AS visits,
               COUNT(*) FILTER (WHERE o.status =  'refunded')::int AS refund_count,
               COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END),0)::bigint AS spent_cents,
               MIN(o.created_at) AS first_visit_at,
               MAX(o.created_at) AS last_visit_at,
               COUNT(DISTINCT o.branch_id)::int AS branch_count,
               COUNT(*) FILTER (WHERE o.legacy_source IS NOT NULL)::int AS legacy_visits,
               COUNT(*) FILTER (WHERE o.legacy_source IS NULL AND o.status <> 'refunded')::int AS native_visits
          FROM orders o
         WHERE o.vehicle_id IN (SELECT id FROM cars WHERE customer_id = ${id})
      `)).rows[0] as any;

      // Favourite branch (most paid visits, ties broken by recency).
      const favRow = (await db.execute(sql`
        SELECT b.id, b.name
          FROM orders o
          JOIN branches b ON b.id = o.branch_id
         WHERE o.vehicle_id IN (SELECT id FROM cars WHERE customer_id = ${id})
           AND o.status <> 'refunded'
         GROUP BY b.id, b.name
         ORDER BY COUNT(*) DESC, MAX(o.created_at) DESC
         LIMIT 1
      `)).rows[0] as any | undefined;

      // Per-branch visit + spend split (for the profile).
      const branchSplit = (await db.execute(sql`
        SELECT b.id AS branch_id, b.name AS branch_name,
               COUNT(*) FILTER (WHERE o.status <> 'refunded')::int AS visits,
               COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END),0)::bigint AS spent_cents
          FROM orders o
          JOIN branches b ON b.id = o.branch_id
         WHERE o.vehicle_id IN (SELECT id FROM cars WHERE customer_id = ${id})
         GROUP BY b.id, b.name
         ORDER BY visits DESC, b.name
      `)).rows.map((r: any) => ({ ...r, spent_cents: Number(r.spent_cents ?? 0) }));

      // Best VIP tier across this customer's vehicles.
      const bestTier = (vehicles
        .map((v: any) => v.vip_tier as string | null)
        .filter(Boolean) as string[])
        .sort((a, b) => {
          const order: Record<string, number> = { gold: 1, silver: 2, bronze: 3 };
          return (order[a] ?? 9) - (order[b] ?? 9);
        })[0] ?? null;

      res.json({
        customer: cust,
        vehicles,
        orders,
        branch_split: branchSplit,
        stats: {
          visits: Number(stats.visits ?? 0),
          refund_count: Number(stats.refund_count ?? 0),
          spent_cents: Number(stats.spent_cents ?? 0),
          first_visit_at: stats.first_visit_at,
          last_visit_at: stats.last_visit_at,
          branch_count: Number(stats.branch_count ?? 0),
          legacy_visits: Number(stats.legacy_visits ?? 0),
          native_visits: Number(stats.native_visits ?? 0),
          favourite_branch_id: favRow?.id ?? null,
          favourite_branch_name: favRow?.name ?? null,
          vip_tier: bestTier,
        },
      });
    } catch (err) {
      console.error('[admin.customers.detail] failed:', err);
      res.status(500).json({ error: 'detail_failed' });
    }
  });

  // PATCH /api/admin/customers/:id — edit name + notes.
  app.patch('/api/admin/customers/:id', requireStaff, requireStaffRole('owner', 'manager'), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid_id_or_ghost' });
    const schema = z.object({
      name: z.string().trim().min(1).max(120).optional(),
      notes: z.string().trim().max(2000).nullable().optional(),
      email: z.string().trim().email().max(254).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    const { name, notes } = parsed.data;
    const email = parsed.data.email?.toLowerCase();

    // Sentinel for "return this HTTP status from inside the transaction".
    // Thrown (not returned) so the transaction rolls back — we never want a
    // partial commit where name/notes save but the email change is rejected.
    const httpErr = (status: number, body: unknown) =>
      Object.assign(new Error('http_result'), { __http: { status, body } });

    try {
      const customer = await db.transaction(async (tx) => {
        const rows = (await tx.execute(sql`
          UPDATE customers SET
            name       = COALESCE(${name ?? null}, name),
            notes      = CASE WHEN ${notes === undefined} THEN notes ELSE ${notes ?? null} END,
            updated_at = NOW()
           WHERE id = ${id}
          RETURNING id, phone, name, notes, user_id, created_at, updated_at
        `)).rows;
        if (rows.length === 0) throw httpErr(404, { error: 'not_found' });
        const row = rows[0] as any;

        // Optional email change. Email lives on the linked users row, not on
        // customers, so this is only valid for customers who actually have an
        // account. The new address must be free (case-insensitive) to avoid
        // colliding with another user's login identifier.
        if (email !== undefined) {
          if (!row.user_id) throw httpErr(400, { error: 'no_account' });
          const clash = (await tx.execute(sql`
            SELECT id FROM users WHERE LOWER(email) = ${email} AND id <> ${row.user_id} LIMIT 1
          `)).rows[0];
          if (clash) throw httpErr(409, { error: 'email_taken' });
          await tx.execute(sql`UPDATE users SET email = ${email} WHERE id = ${row.user_id}`);
          row.email = email;
        } else if (row.user_id) {
          const u = (await tx.execute(sql`
            SELECT email FROM users WHERE id = ${row.user_id} LIMIT 1
          `)).rows[0] as any;
          row.email = u?.email ?? null;
        } else {
          row.email = null;
        }
        return row;
      });
      res.json({ customer });
    } catch (err: any) {
      if (err?.__http) return res.status(err.__http.status).json(err.__http.body);
      // Race fallback: a concurrent writer grabbed the email between our
      // check and update and the DB rejected the duplicate.
      if (err?.code === '23505') return res.status(409).json({ error: 'email_taken' });
      console.error('[admin.customers.update] failed:', err);
      res.status(500).json({ error: 'update_failed' });
    }
  });

  // GET /api/admin/orders/pending-payments — Phase 12b-1.
  // Lists Pocket Pay orders sitting in 'pending_payment' so staff can
  // chase or manually void abandoned web checkouts.
  app.get('/api/admin/orders/pending-payments', requireStaff, requireStaffRole('owner', 'manager'), async (_req, res) => {
    try {
      const rows = (await db.execute(sql`
        SELECT o.id, o.plate, o.created_at, o.total_cents,
               o.package_name, o.payment_ref, o.qr_provider,
               EXTRACT(EPOCH FROM (NOW() - o.created_at))::int AS age_seconds,
               b.name  AS branch_name,
               c.id    AS customer_id,
               c.name  AS customer_name,
               c.phone AS customer_phone
          FROM orders o
          LEFT JOIN branches  b   ON b.id  = o.branch_id
          LEFT JOIN cars      car ON car.id = o.vehicle_id
          LEFT JOIN customers c   ON c.id  = car.customer_id
         WHERE o.status = 'pending_payment'
           AND o.qr_provider = 'pocket_pay'
         ORDER BY o.created_at DESC
         LIMIT 200
      `)).rows.map((r: any) => ({
        ...r,
        total_cents: Number(r.total_cents ?? 0),
        age_seconds: Number(r.age_seconds ?? 0),
      }));
      res.json({ rows, count: rows.length });
    } catch (err) {
      console.error('[admin.orders.pending] failed:', err);
      res.status(500).json({ error: 'list_failed' });
    }
  });

  // GET /api/admin/liabilities — Phase 12e.
  // Owner/manager dashboard of unredeemed prepaid service we still owe
  // customers. Three buckets:
  //   1. outstanding_qrs   : web Pocket Pay orders paid but not yet
  //                          scanned at /pos (status='paid', ticket
  //                          still NULL, qr_provider='pocket_pay').
  //   2. active_packs      : memberships.kind='pack' with remaining > 0.
  //                          Liability = remaining_washes × (price /
  //                          total_washes).
  //   3. active_unlimited  : memberships.kind='unlimited' not yet
  //                          expired. Liability is straight-line
  //                          deferred = price × (days_left / total_days).
  // Totals are summed in cents and returned alongside row-level rows
  // so the frontend can render a real liability ledger.
  app.get('/api/admin/liabilities', requireStaff, requireStaffRole('owner', 'manager'), async (_req, res) => {
    try {
      const qrRows = (await db.execute(sql`
        SELECT o.id, o.plate, o.created_at, o.total_cents,
               o.package_name, o.payment_ref,
               EXTRACT(EPOCH FROM (NOW() - o.created_at))::int AS age_seconds,
               b.name  AS branch_name,
               c.id    AS customer_id,
               c.name  AS customer_name,
               c.phone AS customer_phone
          FROM orders o
          LEFT JOIN branches  b   ON b.id  = o.branch_id
          LEFT JOIN cars      car ON car.id = o.vehicle_id
          LEFT JOIN customers c   ON c.id  = car.customer_id
         WHERE o.status         = 'paid'
           AND o.ticket_code   IS NULL
           AND o.qr_provider   = 'pocket_pay'
         ORDER BY o.created_at ASC
         LIMIT 500
      `)).rows.map((r: any) => ({
        ...r,
        total_cents: Number(r.total_cents ?? 0),
        age_seconds: Number(r.age_seconds ?? 0),
      }));

      const packRows = (await db.execute(sql`
        SELECT m.id, m.customer_id, m.vehicle_id,
               m.total_washes, m.remaining_washes, m.price_cents,
               m.created_at, m.expires_at,
               c.name  AS customer_name,
               c.phone AS customer_phone,
               car.license_plate AS plate,
               b.name AS sold_at_branch_name
          FROM memberships m
          LEFT JOIN customers c   ON c.id  = m.customer_id
          LEFT JOIN cars      car ON car.id = m.vehicle_id
          LEFT JOIN branches  b   ON b.id  = m.sold_at_branch_id
         WHERE m.kind             = 'pack'
           AND m.status           = 'active'
           AND m.remaining_washes > 0
         ORDER BY m.created_at ASC
         LIMIT 500
      `)).rows.map((r: any) => {
        const total = Number(r.total_washes ?? 0);
        const remaining = Number(r.remaining_washes ?? 0);
        const price = Number(r.price_cents ?? 0);
        const perWash = total > 0 ? Math.round(price / total) : 0;
        return {
          ...r,
          total_washes: total,
          remaining_washes: remaining,
          price_cents: price,
          per_wash_cents: perWash,
          deferred_cents: perWash * remaining,
        };
      });

      const unlimitedRows = (await db.execute(sql`
        SELECT m.id, m.customer_id, m.vehicle_id,
               m.price_cents, m.created_at, m.expires_at,
               EXTRACT(EPOCH FROM (m.expires_at - m.created_at))::bigint AS total_seconds,
               EXTRACT(EPOCH FROM (m.expires_at - NOW()))::bigint        AS remaining_seconds,
               c.name  AS customer_name,
               c.phone AS customer_phone,
               car.license_plate AS plate,
               b.name AS sold_at_branch_name
          FROM memberships m
          LEFT JOIN customers c   ON c.id  = m.customer_id
          LEFT JOIN cars      car ON car.id = m.vehicle_id
          LEFT JOIN branches  b   ON b.id  = m.sold_at_branch_id
         WHERE m.kind        = 'unlimited'
           AND m.status      = 'active'
           AND m.expires_at IS NOT NULL
           AND m.expires_at  > NOW()
         ORDER BY m.created_at ASC
         LIMIT 500
      `)).rows.map((r: any) => {
        const price = Number(r.price_cents ?? 0);
        const totalSec = Math.max(1, Number(r.total_seconds ?? 0));
        const remSec   = Math.max(0, Number(r.remaining_seconds ?? 0));
        // Straight-line deferred revenue, clamped to [0, price].
        const deferred = Math.min(price, Math.max(0, Math.round(price * (remSec / totalSec))));
        const daysLeft = Math.ceil(remSec / 86400);
        return {
          ...r,
          price_cents: price,
          deferred_cents: deferred,
          earned_cents: price - deferred,
          days_left: daysLeft,
        };
      });

      const outstandingQrTotal = qrRows.reduce((a: number, r: any) => a + (r.total_cents || 0), 0);
      const packDeferredTotal  = packRows.reduce((a: number, r: any) => a + (r.deferred_cents || 0), 0);
      const unlimitedDeferredTotal = unlimitedRows.reduce((a: number, r: any) => a + (r.deferred_cents || 0), 0);

      res.json({
        outstanding_qrs:    { rows: qrRows,        count: qrRows.length,        total_cents: outstandingQrTotal },
        active_packs:       { rows: packRows,      count: packRows.length,      deferred_cents: packDeferredTotal },
        active_unlimited:   { rows: unlimitedRows, count: unlimitedRows.length, deferred_cents: unlimitedDeferredTotal },
        grand_liability_cents: outstandingQrTotal + packDeferredTotal + unlimitedDeferredTotal,
      });
    } catch (err) {
      console.error('[admin.liabilities] failed:', err);
      res.status(500).json({ error: 'list_failed' });
    }
  });

  // POST /api/admin/orders/:id/void-pending — Phase 12b-1.
  // Manual void of a pending_payment row. Idempotent: a Pocket Pay
  // callback that arrives after a manual void won't override us
  // because /api/payment-callback gates on status='pending_payment'.
  app.post('/api/admin/orders/:id/void-pending', requireStaff, requireStaffRole('owner', 'manager'), async (req, res) => {
    const id = String(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid_id' });
    try {
      const rows = (await db.execute(sql`
        UPDATE orders
           SET status = 'voided'
         WHERE id = ${id}
           AND status = 'pending_payment'
        RETURNING id, status
      `)).rows;
      if (rows.length === 0) return res.status(409).json({ error: 'not_pending_or_not_found' });
      res.json({ ok: true });
    } catch (err) {
      console.error('[admin.orders.void] failed:', err);
      res.status(500).json({ error: 'void_failed' });
    }
  });

  // GET /api/admin/branches/full — owner branch list with full columns + counts.
  app.get('/api/admin/branches/full', requireStaff, requireStaffRole('owner', 'manager'), async (_req, res) => {
    try {
      const rows = (await db.execute(sql`
        SELECT b.id, b.name, b.location, b.google_maps_url, b.google_maps_embed_url,
               b.review_url, b.is_open, b.status, b.status_note, b.queue_count, b.last_queue_update,
               (SELECT COUNT(*)::int FROM staff  s WHERE s.branch_id  = b.id AND s.is_active = true) AS staff_count,
               (SELECT COUNT(*)::int FROM orders o WHERE o.branch_id = b.id) AS order_count
          FROM branches b
         ORDER BY b.name
      `)).rows;
      res.json({ rows });
    } catch (err) {
      console.error('[admin.branches.full] failed:', err);
      res.status(500).json({ error: 'list_failed' });
    }
  });

  const BRANCH_STATUSES = ['open', 'closed', 'maintenance', 'busy'] as const;
  // open/busy => branch keeps taking cars; closed/maintenance => it doesn't.
  const isOpenForStatus = (s: string) => s === 'open' || s === 'busy';

  const branchBodySchema = z.object({
    name: z.string().trim().min(1).max(120),
    location: z.string().trim().min(1).max(255),
    google_maps_url: z.string().trim().url().max(1000),
    google_maps_embed_url: z.string().trim().url().max(2000),
    review_url: z.string().trim().url().max(1000),
    is_open: z.boolean().optional(),
    status: z.enum(BRANCH_STATUSES).optional(),
    status_note: z.string().trim().max(160).nullable().optional(),
  });

  app.post('/api/admin/branches', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const parsed = branchBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    const b = parsed.data;
    // status is the source of truth; fall back to the legacy is_open flag.
    const status = b.status ?? (b.is_open === false ? 'closed' : 'open');
    const isOpen = isOpenForStatus(status);
    const note = b.status_note ?? null;
    try {
      const rows = (await db.execute(sql`
        INSERT INTO branches (name, location, google_maps_url, google_maps_embed_url, review_url, is_open, status, status_note)
        VALUES (${b.name}, ${b.location}, ${b.google_maps_url}, ${b.google_maps_embed_url}, ${b.review_url}, ${isOpen}, ${status}, ${note})
        RETURNING id, name, location, google_maps_url, google_maps_embed_url, review_url, is_open, status, status_note
      `)).rows;
      res.status(201).json({ branch: rows[0] });
    } catch (err) {
      console.error('[admin.branches.create] failed:', err);
      res.status(500).json({ error: 'create_failed' });
    }
  });

  app.patch('/api/admin/branches/:id', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
    const schema = branchBodySchema.partial();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    const b = parsed.data;
    // status drives is_open. If status is provided, derive is_open from it.
    // Otherwise, a bare is_open toggle (legacy) maps to open/closed.
    let status: string | null = b.status ?? null;
    let isOpen: boolean | null = b.is_open ?? null;
    if (status != null) {
      isOpen = isOpenForStatus(status);
    } else if (isOpen != null) {
      status = isOpen ? 'open' : 'closed';
    }
    // status_note: undefined = leave as-is; null/'' = clear.
    const noteProvided = b.status_note !== undefined;
    const note = b.status_note && b.status_note.length > 0 ? b.status_note : null;
    try {
      const rows = (await db.execute(sql`
        UPDATE branches SET
          name                  = COALESCE(${b.name ?? null}, name),
          location              = COALESCE(${b.location ?? null}, location),
          google_maps_url       = COALESCE(${b.google_maps_url ?? null}, google_maps_url),
          google_maps_embed_url = COALESCE(${b.google_maps_embed_url ?? null}, google_maps_embed_url),
          review_url            = COALESCE(${b.review_url ?? null}, review_url),
          is_open               = COALESCE(${isOpen}, is_open),
          status                = COALESCE(${status}, status),
          status_note           = CASE WHEN ${noteProvided} THEN ${note} ELSE status_note END
         WHERE id = ${id}
        RETURNING id, name, location, google_maps_url, google_maps_embed_url, review_url, is_open, status, status_note
      `)).rows;
      if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
      res.json({ branch: rows[0] });
    } catch (err) {
      console.error('[admin.branches.update] failed:', err);
      res.status(500).json({ error: 'update_failed' });
    }
  });

  app.get('/api/admin/catalog/packages', requireStaff, requireStaffRole('owner'), async (_req, res) => {
    try {
      const rows = (await db.execute(sql`
        SELECT id, name, description, duration_minutes, price_cents, is_active, sort_order, category_id, created_at
          FROM packages
         ORDER BY is_active DESC, sort_order ASC, name ASC
      `)).rows;
      // Tag each row with whether it's safe to hard-delete.
      const used = (await db.execute(sql`
        SELECT package_id, COUNT(*)::int AS n
          FROM orders
         WHERE package_id IS NOT NULL
         GROUP BY 1
      `)).rows as Array<{ package_id: string; n: number }>;
      const usage = new Map(used.map((u) => [u.package_id, u.n]));
      // Branch assignments. Empty array = "available at all branches"
      // (the migration's default; matches POS read logic).
      const pb = (await db.execute(sql`
        SELECT package_id, branch_id FROM package_branches
      `)).rows as Array<{ package_id: string; branch_id: number }>;
      const branchMap = new Map<string, number[]>();
      for (const r of pb) {
        const arr = branchMap.get(r.package_id) ?? [];
        arr.push(r.branch_id);
        branchMap.set(r.package_id, arr);
      }
      res.json({
        rows: rows.map((r: any) => ({
          ...r,
          order_count: usage.get(r.id) ?? 0,
          branch_ids: (branchMap.get(r.id) ?? []).sort((a, b) => a - b),
        })),
      });
    } catch (err) {
      console.error('[admin.catalog.packages.list] failed:', err);
      res.status(500).json({ error: 'list_failed' });
    }
  });

  const packageBodySchema = z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable().optional(),
    duration_minutes: z.number().int().min(1).max(600).nullable().optional(),
    price_cents: z.number().int().min(0).max(1_000_00),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(999).optional(),
    // POS Control Room: optional category grouping. null = Uncategorised.
    category_id: z.string().trim().min(1).max(60).nullable().optional(),
    // Empty array = available at all branches (POS treats "no rows" as
    // "show everywhere"). A non-empty array restricts the package to
    // those specific branches.
    branch_ids: z.array(z.number().int().positive()).max(50).optional(),
  });

  // Replace the package_branches join rows for a given package with
  // exactly the supplied list. Wrapped in a single UPSERT-style block
  // so a partial failure doesn't leave the join half-rewritten.
  async function rewritePackageBranches(packageId: string, branchIds: number[]) {
    await db.execute(sql`DELETE FROM package_branches WHERE package_id = ${packageId}`);
    if (branchIds.length === 0) return;
    // Insert all rows in one statement; ON CONFLICT no-ops in case the
    // caller passed duplicates by accident.
    for (const bid of branchIds) {
      await db.execute(sql`
        INSERT INTO package_branches (package_id, branch_id)
        VALUES (${packageId}, ${bid})
        ON CONFLICT DO NOTHING
      `);
    }
  }

  // POST /api/admin/catalog/packages
  app.post('/api/admin/catalog/packages', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const parsed = packageBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const { name, description, duration_minutes, price_cents, is_active, sort_order, category_id, branch_ids } = parsed.data;
    const id = `pkg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const inserted = (await db.execute(sql`
        INSERT INTO packages (id, name, description, duration_minutes, price_cents, is_active, sort_order, category_id)
        VALUES (
          ${id}, ${name}, ${description ?? null}, ${duration_minutes ?? null},
          ${price_cents}, ${is_active ?? true}, ${sort_order ?? 0}, ${category_id ?? null}
        )
        RETURNING id, name, description, duration_minutes, price_cents, is_active, sort_order, category_id, created_at
      `)).rows[0];
      if (branch_ids && branch_ids.length > 0) {
        await rewritePackageBranches(id, branch_ids);
      }
      res.json({ row: { ...inserted, branch_ids: (branch_ids ?? []).slice().sort((a, b) => a - b) } });
    } catch (err) {
      console.error('[admin.catalog.packages.create] failed:', err);
      res.status(500).json({ error: 'create_failed' });
    }
  });

  // PATCH /api/admin/catalog/packages/:id
  app.patch('/api/admin/catalog/packages/:id', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    if (!id) return res.status(400).json({ error: 'missing_id' });
    const parsed = packageBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const p = parsed.data;
    try {
      const updated = (await db.execute(sql`
        UPDATE packages
           SET name             = COALESCE(${p.name             ?? null}, name),
               description      = CASE WHEN ${p.description !== undefined} THEN ${p.description ?? null} ELSE description END,
               duration_minutes = CASE WHEN ${p.duration_minutes !== undefined} THEN ${p.duration_minutes ?? null} ELSE duration_minutes END,
               price_cents      = COALESCE(${p.price_cents      ?? null}, price_cents),
               is_active        = COALESCE(${p.is_active        ?? null}, is_active),
               sort_order       = COALESCE(${p.sort_order       ?? null}, sort_order),
               category_id      = CASE WHEN ${p.category_id !== undefined} THEN ${p.category_id ?? null} ELSE category_id END
         WHERE id = ${id}
         RETURNING id, name, description, duration_minutes, price_cents, is_active, sort_order, category_id, created_at
      `)).rows[0];
      if (!updated) return res.status(404).json({ error: 'not_found' });
      // Only touch branch assignments when the caller actually sent the
      // field. `branch_ids: []` is a meaningful "none / all" assignment
      // — see the migration header for the empty-set semantics.
      if (p.branch_ids !== undefined) {
        await rewritePackageBranches(id, p.branch_ids);
      }
      const currentBranches = (await db.execute(sql`
        SELECT branch_id FROM package_branches WHERE package_id = ${id} ORDER BY branch_id
      `)).rows as Array<{ branch_id: number }>;
      res.json({ row: { ...updated, branch_ids: currentBranches.map((r) => r.branch_id) } });
    } catch (err) {
      console.error('[admin.catalog.packages.update] failed:', err);
      res.status(500).json({ error: 'update_failed' });
    }
  });

  // DELETE /api/admin/catalog/packages/:id   (soft by default; ?force=1 hard-deletes if unused)
  app.delete('/api/admin/catalog/packages/:id', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    const force = String(req.query.force ?? '') === '1';
    if (!id) return res.status(400).json({ error: 'missing_id' });
    try {
      if (force) {
        const used = (await db.execute(
          sql`SELECT COUNT(*)::int AS n FROM orders WHERE package_id = ${id}`,
        )).rows[0] as { n: number };
        if (used.n > 0) {
          return res.status(409).json({ error: 'in_use', order_count: used.n });
        }
        const deleted = (await db.execute(
          sql`DELETE FROM packages WHERE id = ${id} RETURNING id`,
        )).rows[0];
        if (!deleted) return res.status(404).json({ error: 'not_found' });
        return res.json({ ok: true, deleted: true });
      }
      const updated = (await db.execute(sql`
        UPDATE packages SET is_active = false WHERE id = ${id}
        RETURNING id, is_active
      `)).rows[0];
      if (!updated) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true, deactivated: true });
    } catch (err) {
      console.error('[admin.catalog.packages.delete] failed:', err);
      res.status(500).json({ error: 'delete_failed' });
    }
  });

  // ---- Add-ons --------------------------------------------------------

  const addonBodySchema = z.object({
    name: z.string().trim().min(1).max(120),
    price_cents: z.number().int().min(0).max(1_000_00),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(999).optional(),
    // Optional category for grouping in the POS. NULL = Uncategorised.
    // Mirrors packageBodySchema.category_id. Added 2026-06-07_07.
    category_id: z.string().trim().min(1).max(60).nullable().optional(),
    // Same empty-set semantics as package_branches: [] = available at
    // every branch. Added 2026-05-08_02 (addon_branches migration).
    branch_ids: z.array(z.number().int().positive()).max(50).optional(),
  });

  // Replace the addon_branches join rows for a given add-on with
  // exactly the supplied list. Mirrors rewritePackageBranches above.
  async function rewriteAddonBranches(addonId: string, branchIds: number[]) {
    await db.execute(sql`DELETE FROM addon_branches WHERE addon_id = ${addonId}`);
    if (branchIds.length === 0) return;
    for (const bid of branchIds) {
      await db.execute(sql`
        INSERT INTO addon_branches (addon_id, branch_id)
        VALUES (${addonId}, ${bid})
        ON CONFLICT DO NOTHING
      `);
    }
  }

  // GET /api/admin/catalog/addons
  app.get('/api/admin/catalog/addons', requireStaff, requireStaffRole('owner'), async (_req, res) => {
    try {
      const rows = (await db.execute(sql`
        SELECT id, name, price_cents, is_active, sort_order, category_id
          FROM addons_catalog
         ORDER BY is_active DESC, sort_order ASC, name ASC
      `)).rows;
      // Add-ons live inside orders.addons jsonb — count usage by id.
      const used = (await db.execute(sql`
        SELECT (a->>'id') AS addon_id, COUNT(*)::int AS n
          FROM orders, jsonb_array_elements(COALESCE(addons,'[]'::jsonb)) a
         WHERE (a->>'id') IS NOT NULL
         GROUP BY 1
      `)).rows as Array<{ addon_id: string; n: number }>;
      const usage = new Map(used.map((u) => [u.addon_id, u.n]));
      // Branch assignments — same empty-array-means-all rule as packages.
      const ab = (await db.execute(sql`
        SELECT addon_id, branch_id FROM addon_branches
      `)).rows as Array<{ addon_id: string; branch_id: number }>;
      const branchMap = new Map<string, number[]>();
      for (const r of ab) {
        const arr = branchMap.get(r.addon_id) ?? [];
        arr.push(r.branch_id);
        branchMap.set(r.addon_id, arr);
      }
      res.json({
        rows: rows.map((r: any) => ({
          ...r,
          order_count: usage.get(r.id) ?? 0,
          branch_ids: (branchMap.get(r.id) ?? []).sort((a, b) => a - b),
        })),
      });
    } catch (err) {
      console.error('[admin.catalog.addons.list] failed:', err);
      res.status(500).json({ error: 'list_failed' });
    }
  });

  // POST /api/admin/catalog/addons
  app.post('/api/admin/catalog/addons', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const parsed = addonBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const { name, price_cents, is_active, sort_order, category_id, branch_ids } = parsed.data;
    const id = `addon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const inserted = (await db.execute(sql`
        INSERT INTO addons_catalog (id, name, price_cents, is_active, sort_order, category_id)
        VALUES (${id}, ${name}, ${price_cents}, ${is_active ?? true}, ${sort_order ?? 0}, ${category_id ?? null})
        RETURNING id, name, price_cents, is_active, sort_order, category_id
      `)).rows[0];
      if (branch_ids && branch_ids.length > 0) {
        await rewriteAddonBranches(id, branch_ids);
      }
      res.json({
        row: { ...inserted, branch_ids: (branch_ids ?? []).slice().sort((a, b) => a - b) },
      });
    } catch (err) {
      console.error('[admin.catalog.addons.create] failed:', err);
      res.status(500).json({ error: 'create_failed' });
    }
  });

  // PATCH /api/admin/catalog/addons/:id
  app.patch('/api/admin/catalog/addons/:id', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    if (!id) return res.status(400).json({ error: 'missing_id' });
    const parsed = addonBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const p = parsed.data;
    try {
      const updated = (await db.execute(sql`
        UPDATE addons_catalog
           SET name        = COALESCE(${p.name        ?? null}, name),
               price_cents = COALESCE(${p.price_cents ?? null}, price_cents),
               is_active   = COALESCE(${p.is_active   ?? null}, is_active),
               sort_order  = COALESCE(${p.sort_order  ?? null}, sort_order),
               category_id = CASE WHEN ${p.category_id !== undefined} THEN ${p.category_id ?? null} ELSE category_id END
         WHERE id = ${id}
         RETURNING id, name, price_cents, is_active, sort_order, category_id
      `)).rows[0];
      if (!updated) return res.status(404).json({ error: 'not_found' });
      // Only rewrite the join when the caller actually sent the field.
      // `branch_ids: []` is meaningful ("available everywhere again").
      if (p.branch_ids !== undefined) {
        await rewriteAddonBranches(id, p.branch_ids);
      }
      const currentBranches = (await db.execute(sql`
        SELECT branch_id FROM addon_branches WHERE addon_id = ${id} ORDER BY branch_id
      `)).rows as Array<{ branch_id: number }>;
      res.json({ row: { ...updated, branch_ids: currentBranches.map((r) => r.branch_id) } });
    } catch (err) {
      console.error('[admin.catalog.addons.update] failed:', err);
      res.status(500).json({ error: 'update_failed' });
    }
  });

  // DELETE /api/admin/catalog/addons/:id   (soft by default; ?force=1 hard-deletes if unused)
  app.delete('/api/admin/catalog/addons/:id', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    const force = String(req.query.force ?? '') === '1';
    if (!id) return res.status(400).json({ error: 'missing_id' });
    try {
      if (force) {
        const used = (await db.execute(sql`
          SELECT COUNT(*)::int AS n
            FROM orders, jsonb_array_elements(COALESCE(addons,'[]'::jsonb)) a
           WHERE (a->>'id') = ${id}
        `)).rows[0] as { n: number };
        if (used.n > 0) {
          return res.status(409).json({ error: 'in_use', order_count: used.n });
        }
        const deleted = (await db.execute(
          sql`DELETE FROM addons_catalog WHERE id = ${id} RETURNING id`,
        )).rows[0];
        if (!deleted) return res.status(404).json({ error: 'not_found' });
        return res.json({ ok: true, deleted: true });
      }
      const updated = (await db.execute(sql`
        UPDATE addons_catalog SET is_active = false WHERE id = ${id}
        RETURNING id, is_active
      `)).rows[0];
      if (!updated) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true, deactivated: true });
    } catch (err) {
      console.error('[admin.catalog.addons.delete] failed:', err);
      res.status(500).json({ error: 'delete_failed' });
    }
  });

  // ====================================================================
  // POS CONTROL ROOM — Categories / Discounts / Promo codes /
  // Payment methods / Staff / Customer create+delete. (Task #7)
  // All owner-gated except where noted. Mirrors the soft-delete +
  // ?force=1 hard-delete-if-unused pattern used by the catalog routes.
  // ====================================================================

  // ---- Categories -----------------------------------------------------
  const categoryBodySchema = z.object({
    name: z.string().trim().min(1).max(80),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(999).optional(),
  });

  app.get('/api/admin/catalog/categories', requireStaff, requireStaffRole('owner'), async (_req, res) => {
    try {
      const rows = (await db.execute(sql`
        SELECT c.id, c.name, c.is_active, c.sort_order, c.created_at,
               COALESCE(p.n, 0)::int AS package_count
          FROM categories c
          LEFT JOIN (
            SELECT category_id, COUNT(*)::int AS n
              FROM packages WHERE category_id IS NOT NULL GROUP BY category_id
          ) p ON p.category_id = c.id
         ORDER BY c.is_active DESC, c.sort_order ASC, c.name ASC
      `)).rows;
      res.json({ rows });
    } catch (err) {
      console.error('[admin.categories.list] failed:', err);
      res.status(500).json({ error: 'list_failed' });
    }
  });

  app.post('/api/admin/catalog/categories', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const parsed = categoryBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const { name, is_active, sort_order } = parsed.data;
    const id = `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const row = (await db.execute(sql`
        INSERT INTO categories (id, name, is_active, sort_order)
        VALUES (${id}, ${name}, ${is_active ?? true}, ${sort_order ?? 0})
        RETURNING id, name, is_active, sort_order, created_at
      `)).rows[0];
      res.json({ row: { ...row, package_count: 0 } });
    } catch (err) {
      console.error('[admin.categories.create] failed:', err);
      res.status(500).json({ error: 'create_failed' });
    }
  });

  app.patch('/api/admin/catalog/categories/:id', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    if (!id) return res.status(400).json({ error: 'missing_id' });
    const parsed = categoryBodySchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const p = parsed.data;
    try {
      const row = (await db.execute(sql`
        UPDATE categories
           SET name       = COALESCE(${p.name ?? null}, name),
               is_active  = COALESCE(${p.is_active ?? null}, is_active),
               sort_order = COALESCE(${p.sort_order ?? null}, sort_order)
         WHERE id = ${id}
         RETURNING id, name, is_active, sort_order, created_at
      `)).rows[0];
      if (!row) return res.status(404).json({ error: 'not_found' });
      res.json({ row });
    } catch (err) {
      console.error('[admin.categories.update] failed:', err);
      res.status(500).json({ error: 'update_failed' });
    }
  });

  // DELETE — soft by default; ?force=1 hard-deletes. Hard delete is always
  // safe: the FK on packages.category_id is ON DELETE SET NULL, so any
  // packages just fall back to "Uncategorised".
  app.delete('/api/admin/catalog/categories/:id', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    const force = String(req.query.force ?? '') === '1';
    if (!id) return res.status(400).json({ error: 'missing_id' });
    try {
      if (force) {
        // Same rule as packages/add-ons/discounts/etc: hard-delete only
        // when nothing references it. A category still assigned to packages
        // is soft-deactivated instead, so we never silently strip the
        // category off live packages via FK ON DELETE SET NULL.
        const inUse = (await db.execute(sql`
          SELECT 1 FROM packages WHERE category_id = ${id}
          UNION ALL
          SELECT 1 FROM addons_catalog WHERE category_id = ${id}
          LIMIT 1
        `)).rows.length > 0;
        if (inUse) {
          const updated = (await db.execute(sql`
            UPDATE categories SET is_active = false WHERE id = ${id} RETURNING id
          `)).rows[0];
          if (!updated) return res.status(404).json({ error: 'not_found' });
          return res.status(409).json({ error: 'in_use', deactivated: true });
        }
        const deleted = (await db.execute(sql`DELETE FROM categories WHERE id = ${id} RETURNING id`)).rows[0];
        if (!deleted) return res.status(404).json({ error: 'not_found' });
        return res.json({ ok: true, deleted: true });
      }
      const updated = (await db.execute(sql`
        UPDATE categories SET is_active = false WHERE id = ${id} RETURNING id
      `)).rows[0];
      if (!updated) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true, deactivated: true });
    } catch (err) {
      console.error('[admin.categories.delete] failed:', err);
      res.status(500).json({ error: 'delete_failed' });
    }
  });

  // ---- Discounts ------------------------------------------------------
  const discountBaseSchema = z.object({
    name: z.string().trim().min(1).max(120),
    kind: z.enum(['percent', 'fixed']),
    value: z.number().int(),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(999).optional(),
  });
  const discountBodySchema = discountBaseSchema.refine(
    (d) => (d.kind === 'percent' ? d.value >= 1 && d.value <= 100 : d.value >= 0),
    { message: 'percent must be 1-100; fixed must be >= 0', path: ['value'] },
  );

  app.get('/api/admin/discounts', requireStaff, requireStaffRole('owner'), async (_req, res) => {
    try {
      const rows = (await db.execute(sql`
        SELECT d.id, d.name, d.kind, d.value, d.is_active, d.sort_order, d.created_at,
               COALESCE(o.n, 0)::int AS order_count
          FROM discounts d
          LEFT JOIN (
            SELECT discount_id, COUNT(*)::int AS n
              FROM orders WHERE discount_id IS NOT NULL GROUP BY discount_id
          ) o ON o.discount_id = d.id
         ORDER BY d.is_active DESC, d.sort_order ASC, d.name ASC
      `)).rows;
      res.json({ rows });
    } catch (err) {
      console.error('[admin.discounts.list] failed:', err);
      res.status(500).json({ error: 'list_failed' });
    }
  });

  app.post('/api/admin/discounts', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const parsed = discountBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const { name, kind, value, is_active, sort_order } = parsed.data;
    const id = `disc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const row = (await db.execute(sql`
        INSERT INTO discounts (id, name, kind, value, is_active, sort_order)
        VALUES (${id}, ${name}, ${kind}, ${value}, ${is_active ?? true}, ${sort_order ?? 0})
        RETURNING id, name, kind, value, is_active, sort_order, created_at
      `)).rows[0];
      res.json({ row: { ...row, order_count: 0 } });
    } catch (err) {
      console.error('[admin.discounts.create] failed:', err);
      res.status(500).json({ error: 'create_failed' });
    }
  });

  app.patch('/api/admin/discounts/:id', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    if (!id) return res.status(400).json({ error: 'missing_id' });
    const parsed = discountBaseSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const p = parsed.data;
    try {
      const row = (await db.execute(sql`
        UPDATE discounts
           SET name       = COALESCE(${p.name ?? null}, name),
               kind       = COALESCE(${p.kind ?? null}, kind),
               value      = COALESCE(${p.value ?? null}, value),
               is_active  = COALESCE(${p.is_active ?? null}, is_active),
               sort_order = COALESCE(${p.sort_order ?? null}, sort_order)
         WHERE id = ${id}
         RETURNING id, name, kind, value, is_active, sort_order, created_at
      `)).rows[0];
      if (!row) return res.status(404).json({ error: 'not_found' });
      res.json({ row });
    } catch (err: any) {
      if (err?.code === '23514') return res.status(400).json({ error: 'invalid_value' });
      console.error('[admin.discounts.update] failed:', err);
      res.status(500).json({ error: 'update_failed' });
    }
  });

  app.delete('/api/admin/discounts/:id', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    const force = String(req.query.force ?? '') === '1';
    if (!id) return res.status(400).json({ error: 'missing_id' });
    try {
      if (force) {
        const used = (await db.execute(
          sql`SELECT COUNT(*)::int AS n FROM orders WHERE discount_id = ${id}`,
        )).rows[0] as { n: number };
        if (used.n > 0) return res.status(409).json({ error: 'in_use', order_count: used.n });
        const deleted = (await db.execute(sql`DELETE FROM discounts WHERE id = ${id} RETURNING id`)).rows[0];
        if (!deleted) return res.status(404).json({ error: 'not_found' });
        return res.json({ ok: true, deleted: true });
      }
      const updated = (await db.execute(sql`
        UPDATE discounts SET is_active = false WHERE id = ${id} RETURNING id
      `)).rows[0];
      if (!updated) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true, deactivated: true });
    } catch (err) {
      console.error('[admin.discounts.delete] failed:', err);
      res.status(500).json({ error: 'delete_failed' });
    }
  });

  // ---- Promo codes ----------------------------------------------------
  const promoBaseSchema = z.object({
    code: z.string().trim().min(2).max(40),
    kind: z.enum(['percent', 'fixed']),
    value: z.number().int(),
    is_active: z.boolean().optional(),
    starts_at: z.string().datetime().nullable().optional(),
    expires_at: z.string().datetime().nullable().optional(),
    max_uses: z.number().int().min(1).max(1_000_000).nullable().optional(),
  });
  const promoBodySchema = promoBaseSchema.refine(
    (d) => (d.kind === 'percent' ? d.value >= 1 && d.value <= 100 : d.value >= 0),
    { message: 'percent must be 1-100; fixed must be >= 0', path: ['value'] },
  );

  app.get('/api/admin/promo-codes', requireStaff, requireStaffRole('owner'), async (_req, res) => {
    try {
      const rows = (await db.execute(sql`
        SELECT id, code, kind, value, is_active, starts_at, expires_at,
               max_uses, used_count, created_at
          FROM promo_codes
         ORDER BY is_active DESC, created_at DESC
      `)).rows;
      res.json({ rows });
    } catch (err) {
      console.error('[admin.promo.list] failed:', err);
      res.status(500).json({ error: 'list_failed' });
    }
  });

  app.post('/api/admin/promo-codes', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const parsed = promoBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const { code, kind, value, is_active, starts_at, expires_at, max_uses } = parsed.data;
    const codeNorm = code.toUpperCase().replace(/\s+/g, '');
    const id = `promo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const row = (await db.execute(sql`
        INSERT INTO promo_codes (id, code, kind, value, is_active, starts_at, expires_at, max_uses)
        VALUES (${id}, ${codeNorm}, ${kind}, ${value}, ${is_active ?? true},
                ${starts_at ?? null}, ${expires_at ?? null}, ${max_uses ?? null})
        RETURNING id, code, kind, value, is_active, starts_at, expires_at, max_uses, used_count, created_at
      `)).rows[0];
      res.json({ row });
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'code_taken' });
      console.error('[admin.promo.create] failed:', err);
      res.status(500).json({ error: 'create_failed' });
    }
  });

  app.patch('/api/admin/promo-codes/:id', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    if (!id) return res.status(400).json({ error: 'missing_id' });
    const parsed = promoBaseSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const p = parsed.data;
    const codeNorm = p.code !== undefined ? p.code.toUpperCase().replace(/\s+/g, '') : null;
    try {
      const row = (await db.execute(sql`
        UPDATE promo_codes
           SET code       = COALESCE(${codeNorm}, code),
               kind       = COALESCE(${p.kind ?? null}, kind),
               value      = COALESCE(${p.value ?? null}, value),
               is_active  = COALESCE(${p.is_active ?? null}, is_active),
               starts_at  = CASE WHEN ${p.starts_at !== undefined} THEN ${p.starts_at ?? null} ELSE starts_at END,
               expires_at = CASE WHEN ${p.expires_at !== undefined} THEN ${p.expires_at ?? null} ELSE expires_at END,
               max_uses   = CASE WHEN ${p.max_uses !== undefined} THEN ${p.max_uses ?? null} ELSE max_uses END
         WHERE id = ${id}
         RETURNING id, code, kind, value, is_active, starts_at, expires_at, max_uses, used_count, created_at
      `)).rows[0];
      if (!row) return res.status(404).json({ error: 'not_found' });
      res.json({ row });
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'code_taken' });
      if (err?.code === '23514') return res.status(400).json({ error: 'invalid_value' });
      console.error('[admin.promo.update] failed:', err);
      res.status(500).json({ error: 'update_failed' });
    }
  });

  app.delete('/api/admin/promo-codes/:id', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    const force = String(req.query.force ?? '') === '1';
    if (!id) return res.status(400).json({ error: 'missing_id' });
    try {
      if (force) {
        const used = (await db.execute(
          sql`SELECT COUNT(*)::int AS n FROM orders WHERE promo_code_id = ${id}`,
        )).rows[0] as { n: number };
        if (used.n > 0) return res.status(409).json({ error: 'in_use', order_count: used.n });
        const deleted = (await db.execute(sql`DELETE FROM promo_codes WHERE id = ${id} RETURNING id`)).rows[0];
        if (!deleted) return res.status(404).json({ error: 'not_found' });
        return res.json({ ok: true, deleted: true });
      }
      const updated = (await db.execute(sql`
        UPDATE promo_codes SET is_active = false WHERE id = ${id} RETURNING id
      `)).rows[0];
      if (!updated) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true, deactivated: true });
    } catch (err) {
      console.error('[admin.promo.delete] failed:', err);
      res.status(500).json({ error: 'delete_failed' });
    }
  });

  // ---- Payment methods (POS dropdown config) --------------------------
  // Wallet (method='qr_code') providers are OWNER-DEFINABLE: the owner adds a
  // digital wallet in Admin → Payment Setup and we store a slug code derived
  // from the label (e.g. "Progresif Ding!" → 'progresif_ding'). The slug is
  // free text in the DB (orders.qr_provider) — the only reserved value is
  // 'pocket_pay' (the online Pocket Pay callback idempotency index). The POS
  // order endpoint accepts the same slug shape, so a newly added wallet flows
  // straight through to checkout/reporting without any code change.
  const providerSlug = z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_]+$/, 'provider must be lowercase letters, numbers and underscores')
    .refine((v) => v !== 'pocket_pay', { message: "'pocket_pay' is reserved" });
  const paymentMethodBaseSchema = z.object({
    label: z.string().trim().min(1).max(80),
    method: z.enum([
      'cash', 'bank_transfer', 'card', 'qr_code',
      'baiduri_pay', 'quick_pay', 'subscription', 'voucher',
    ]),
    qr_provider: providerSlug.nullable().optional(),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(999).optional(),
  });
  // A qr_code wallet method MUST carry a provider slug; non-qr_code methods
  // must not. ('pocket_pay' is rejected by providerSlug above and by the DB
  // CHECK constraint.)
  const paymentMethodProviderRefine = (d: { method: string; qr_provider?: string | null }) =>
    d.method === 'qr_code' ? !!d.qr_provider : !d.qr_provider;
  const paymentMethodBodySchema = paymentMethodBaseSchema.refine(
    paymentMethodProviderRefine,
    {
      message: "qr_code methods require a valid qr_provider; other methods must not set one",
      path: ['qr_provider'],
    },
  );

  app.get('/api/admin/payment-methods', requireStaff, requireStaffRole('owner'), async (_req, res) => {
    try {
      const rows = (await db.execute(sql`
        SELECT id, label, method, qr_provider, is_active, sort_order, is_system, created_at
          FROM payment_methods
         ORDER BY sort_order ASC, label ASC
      `)).rows;
      res.json({ rows });
    } catch (err) {
      console.error('[admin.payment_methods.list] failed:', err);
      res.status(500).json({ error: 'list_failed' });
    }
  });

  app.post('/api/admin/payment-methods', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const parsed = paymentMethodBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const { label, method, qr_provider, is_active, sort_order } = parsed.data;
    // Providers only make sense on qr_code methods.
    const provider = method === 'qr_code' ? (qr_provider ?? null) : null;
    if (method === 'qr_code' && !provider) return res.status(400).json({ error: 'provider_required_for_qr' });
    const id = `pm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const row = (await db.execute(sql`
        INSERT INTO payment_methods (id, label, method, qr_provider, is_active, sort_order, is_system)
        VALUES (${id}, ${label}, ${method}, ${provider}, ${is_active ?? true}, ${sort_order ?? 0}, false)
        RETURNING id, label, method, qr_provider, is_active, sort_order, is_system, created_at
      `)).rows[0];
      res.json({ row });
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'method_provider_taken' });
      if (err?.code === '23514') return res.status(400).json({ error: 'invalid_method' });
      console.error('[admin.payment_methods.create] failed:', err);
      res.status(500).json({ error: 'create_failed' });
    }
  });

  // PATCH — label / active / order are always editable. method+provider are
  // editable for custom rows only (system rows are locked to their code).
  app.patch('/api/admin/payment-methods/:id', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    if (!id) return res.status(400).json({ error: 'missing_id' });
    const parsed = paymentMethodBaseSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const p = parsed.data;
    try {
      const existing = (await db.execute(
        sql`SELECT is_system, method, qr_provider FROM payment_methods WHERE id = ${id} LIMIT 1`,
      )).rows[0] as { is_system: boolean; method: string; qr_provider: string | null } | undefined;
      if (!existing) return res.status(404).json({ error: 'not_found' });
      // System rows: ignore any method/provider change (locked to code).
      const allowCode = !existing.is_system;
      // Re-apply the same method↔provider invariant POST enforces, but against
      // the EFFECTIVE final state (partial PATCH may touch only one of the two).
      // For system rows the code is locked, so validate against the stored method.
      const effectiveMethod = allowCode && p.method !== undefined ? p.method : existing.method;
      const effectiveProvider =
        effectiveMethod !== 'qr_code'
          ? null
          : p.qr_provider !== undefined
            ? (p.qr_provider ?? null)
            : existing.qr_provider;
      if (effectiveMethod === 'qr_code' && !effectiveProvider) {
        return res.status(400).json({ error: 'provider_required_for_qr' });
      }
      if (effectiveMethod !== 'qr_code' && effectiveProvider) {
        return res.status(400).json({ error: 'provider_not_allowed' });
      }
      const provider = effectiveProvider;
      const row = (await db.execute(sql`
        UPDATE payment_methods
           SET label       = COALESCE(${p.label ?? null}, label),
               method      = CASE WHEN ${allowCode && p.method !== undefined} THEN ${p.method ?? null} ELSE method END,
               qr_provider = CASE WHEN ${allowCode && (p.method !== undefined || p.qr_provider !== undefined)} THEN ${provider} ELSE qr_provider END,
               is_active   = COALESCE(${p.is_active ?? null}, is_active),
               sort_order  = COALESCE(${p.sort_order ?? null}, sort_order)
         WHERE id = ${id}
         RETURNING id, label, method, qr_provider, is_active, sort_order, is_system, created_at
      `)).rows[0];
      res.json({ row });
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'method_provider_taken' });
      if (err?.code === '23514') return res.status(400).json({ error: 'invalid_method' });
      console.error('[admin.payment_methods.update] failed:', err);
      res.status(500).json({ error: 'update_failed' });
    }
  });

  // DELETE — system rows can't be hard-deleted (only deactivated).
  app.delete('/api/admin/payment-methods/:id', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    const force = String(req.query.force ?? '') === '1';
    if (!id) return res.status(400).json({ error: 'missing_id' });
    try {
      const existing = (await db.execute(
        sql`SELECT is_system, method, qr_provider FROM payment_methods WHERE id = ${id} LIMIT 1`,
      )).rows[0] as { is_system: boolean; method: string; qr_provider: string | null } | undefined;
      if (!existing) return res.status(404).json({ error: 'not_found' });
      if (force) {
        if (existing.is_system) return res.status(409).json({ error: 'system_locked' });
        // Protect historical reporting: never hard-delete a method/provider
        // mapping that real orders were recorded against. Deactivate instead.
        const used = (await db.execute(sql`
          SELECT COUNT(*)::int AS n FROM orders
           WHERE payment_method = ${existing.method}
             AND qr_provider IS NOT DISTINCT FROM ${existing.qr_provider}
        `)).rows[0] as { n: number };
        if (used.n > 0) {
          await db.execute(sql`UPDATE payment_methods SET is_active = false WHERE id = ${id}`);
          return res.status(409).json({ error: 'in_use', order_count: used.n, deactivated: true });
        }
        await db.execute(sql`DELETE FROM payment_methods WHERE id = ${id}`);
        return res.json({ ok: true, deleted: true });
      }
      await db.execute(sql`UPDATE payment_methods SET is_active = false WHERE id = ${id}`);
      res.json({ ok: true, deactivated: true });
    } catch (err) {
      console.error('[admin.payment_methods.delete] failed:', err);
      res.status(500).json({ error: 'delete_failed' });
    }
  });

  // ---- Transaction fee rates (MDR) — owner only ----------------------
  // The merchant fee a payment provider charges per digital transaction.
  // Keyed by the same (payment_method, qr_provider) pair stored on orders.
  const clampBps = (v: unknown) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return null;
    if (n < 0 || n > 2000) return null; // 0%..20% guardrail
    return n;
  };

  app.get('/api/admin/fee-rates', requireStaff, requireStaffRole('owner'), async (_req, res) => {
    try {
      const rows = (await db.execute(sql`
        SELECT id, label, payment_method, qr_provider, mdr_bps
          FROM payment_fee_rates
         ORDER BY mdr_bps, payment_method, qr_provider
      `)).rows;
      res.json({ rows });
    } catch (err) {
      console.error('[admin.fee_rates.list] failed:', err);
      res.status(500).json({ error: 'list_failed' });
    }
  });

  app.post('/api/admin/fee-rates', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const label = String(req.body?.label ?? '').trim();
    const paymentMethod = String(req.body?.payment_method ?? '').trim();
    const qrProviderRaw = req.body?.qr_provider;
    const qrProvider = qrProviderRaw == null || String(qrProviderRaw).trim() === ''
      ? null : String(qrProviderRaw).trim();
    const bps = clampBps(req.body?.mdr_bps);
    if (!label) return res.status(400).json({ error: 'missing_label' });
    if (!paymentMethod) return res.status(400).json({ error: 'missing_payment_method' });
    if (bps === null) return res.status(400).json({ error: 'invalid_mdr_bps' });
    const id = `fee_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      await db.execute(sql`
        INSERT INTO payment_fee_rates (id, label, payment_method, qr_provider, mdr_bps)
        VALUES (${id}, ${label}, ${paymentMethod}, ${qrProvider}, ${bps})
      `);
      res.json({ ok: true, id });
    } catch (err: any) {
      if (String(err?.code) === '23505') {
        return res.status(409).json({ error: 'duplicate_rate' });
      }
      console.error('[admin.fee_rates.create] failed:', err);
      res.status(500).json({ error: 'create_failed' });
    }
  });

  app.patch('/api/admin/fee-rates/:id', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    if (!id) return res.status(400).json({ error: 'missing_id' });
    const sets: ReturnType<typeof sql>[] = [];
    if (req.body?.label !== undefined) {
      const label = String(req.body.label).trim();
      if (!label) return res.status(400).json({ error: 'missing_label' });
      sets.push(sql`label = ${label}`);
    }
    if (req.body?.mdr_bps !== undefined) {
      const bps = clampBps(req.body.mdr_bps);
      if (bps === null) return res.status(400).json({ error: 'invalid_mdr_bps' });
      sets.push(sql`mdr_bps = ${bps}`);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'nothing_to_update' });
    try {
      const result = await db.execute(sql`
        UPDATE payment_fee_rates SET ${sql.join(sets, sql`, `)} WHERE id = ${id}
      `);
      if (result.rowCount === 0) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true });
    } catch (err) {
      console.error('[admin.fee_rates.update] failed:', err);
      res.status(500).json({ error: 'update_failed' });
    }
  });

  app.delete('/api/admin/fee-rates/:id', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    if (!id) return res.status(400).json({ error: 'missing_id' });
    try {
      const result = await db.execute(sql`DELETE FROM payment_fee_rates WHERE id = ${id}`);
      if (result.rowCount === 0) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true, deleted: true });
    } catch (err) {
      console.error('[admin.fee_rates.delete] failed:', err);
      res.status(500).json({ error: 'delete_failed' });
    }
  });

  // ---- Staff management ----------------------------------------------
  app.get('/api/admin/staff', requireStaff, requireStaffRole('owner'), async (_req, res) => {
    try {
      const rows = (await db.execute(sql`
        SELECT s.id, s.email, s.name, s.role, s.branch_id, s.is_active, s.created_at,
               b.name AS branch_name,
               COALESCE(o.n, 0)::int AS order_count
          FROM staff s
          LEFT JOIN branches b ON b.id = s.branch_id
          LEFT JOIN (
            SELECT staff_id, COUNT(*)::int AS n FROM orders
             WHERE staff_id IS NOT NULL GROUP BY staff_id
          ) o ON o.staff_id = s.id
         ORDER BY s.is_active DESC, s.role ASC, s.name ASC
      `)).rows;
      res.json({ rows });
    } catch (err) {
      console.error('[admin.staff.list] failed:', err);
      res.status(500).json({ error: 'list_failed' });
    }
  });

  const staffCreateSchema = z.object({
    email: z.string().trim().email().max(160),
    name: z.string().trim().min(1).max(120),
    role: z.enum(STAFF_ROLES),
    branch_id: z.number().int().positive().nullable().optional(),
    password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  });

  app.post('/api/admin/staff', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const parsed = staffCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const { email, name, role, branch_id, password } = parsed.data;
    // Lane/cashier/manager are branch-bound; owner and investor are global.
    if (role !== 'owner' && role !== 'investor' && branch_id == null) {
      return res.status(400).json({ error: 'branch_required_for_role' });
    }
    try {
      const isGlobalRole = role === 'owner' || role === 'investor';
      const id = await createStaff({ email, name, role, branchId: isGlobalRole ? null : branch_id, password });
      const row = (await db.execute(sql`
        SELECT s.id, s.email, s.name, s.role, s.branch_id, s.is_active, s.created_at,
               b.name AS branch_name
          FROM staff s LEFT JOIN branches b ON b.id = s.branch_id
         WHERE s.id = ${id} LIMIT 1
      `)).rows[0];
      res.json({ row: { ...row, order_count: 0 } });
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'email_taken' });
      if (typeof err?.message === 'string' && err.message.includes('password')) {
        return res.status(400).json({ error: 'weak_password' });
      }
      console.error('[admin.staff.create] failed:', err);
      res.status(500).json({ error: 'create_failed' });
    }
  });

  const staffUpdateSchema = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    role: z.enum(STAFF_ROLES).optional(),
    branch_id: z.number().int().positive().nullable().optional(),
    is_active: z.boolean().optional(),
    password: z.string().min(MIN_PASSWORD_LENGTH).max(200).optional(),
  });

  app.patch('/api/admin/staff/:id', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    if (!id) return res.status(400).json({ error: 'missing_id' });
    const parsed = staffUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const p = parsed.data;
    const selfId = (req.staff!.user as any).id as string;
    try {
      const target = (await db.execute(
        sql`SELECT id, role, is_active FROM staff WHERE id = ${id} LIMIT 1`,
      )).rows[0] as { id: string; role: string; is_active: boolean } | undefined;
      if (!target) return res.status(404).json({ error: 'not_found' });

      // Guard: don't let the owner demote / deactivate the last active owner
      // (that would lock everyone out of the Control Room).
      const wouldDropOwner =
        (p.role !== undefined && p.role !== 'owner' && target.role === 'owner') ||
        (p.is_active === false && target.role === 'owner');
      if (wouldDropOwner) {
        const owners = (await db.execute(sql`
          SELECT COUNT(*)::int AS n FROM staff WHERE role = 'owner' AND is_active = true
        `)).rows[0] as { n: number };
        if (owners.n <= 1) return res.status(409).json({ error: 'last_owner' });
      }
      if (p.is_active === false && id === selfId) {
        return res.status(409).json({ error: 'cannot_deactivate_self' });
      }

      const newRole = p.role ?? target.role;
      // Keep the branch rule consistent with create: owner and investor are global.
      const isGlobalRole = newRole === 'owner' || newRole === 'investor';
      const branchSql =
        p.branch_id !== undefined
          ? (isGlobalRole ? null : p.branch_id)
          : undefined;
      const passwordHash = p.password ? await hashStaffPassword(p.password) : null;

      const row = (await db.execute(sql`
        UPDATE staff
           SET name          = COALESCE(${p.name ?? null}, name),
               role          = COALESCE(${p.role ?? null}, role),
               branch_id     = CASE
                                 WHEN ${isGlobalRole} THEN NULL
                                 WHEN ${branchSql !== undefined} THEN ${branchSql ?? null}
                                 ELSE branch_id
                               END,
               is_active     = COALESCE(${p.is_active ?? null}, is_active),
               password_hash = COALESCE(${passwordHash}, password_hash)
         WHERE id = ${id}
         RETURNING id, email, name, role, branch_id, is_active, created_at
      `)).rows[0];
      const branch = row && (row as any).branch_id != null
        ? (await db.execute(sql`SELECT name FROM branches WHERE id = ${(row as any).branch_id} LIMIT 1`)).rows[0]
        : null;
      res.json({ row: { ...row, branch_name: (branch as any)?.name ?? null } });
    } catch (err: any) {
      if (typeof err?.message === 'string' && err.message.includes('password')) {
        return res.status(400).json({ error: 'weak_password' });
      }
      console.error('[admin.staff.update] failed:', err);
      res.status(500).json({ error: 'update_failed' });
    }
  });

  // DELETE — soft (deactivate) by default; ?force=1 hard-deletes only when
  // the account has never rung an order. Can't delete yourself or the last owner.
  app.delete('/api/admin/staff/:id', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    const force = String(req.query.force ?? '') === '1';
    if (!id) return res.status(400).json({ error: 'missing_id' });
    const selfId = (req.staff!.user as any).id as string;
    if (id === selfId) return res.status(409).json({ error: 'cannot_delete_self' });
    try {
      const target = (await db.execute(
        sql`SELECT id, role FROM staff WHERE id = ${id} LIMIT 1`,
      )).rows[0] as { id: string; role: string } | undefined;
      if (!target) return res.status(404).json({ error: 'not_found' });
      if (target.role === 'owner') {
        const owners = (await db.execute(sql`
          SELECT COUNT(*)::int AS n FROM staff WHERE role = 'owner' AND is_active = true
        `)).rows[0] as { n: number };
        if (owners.n <= 1) return res.status(409).json({ error: 'last_owner' });
      }
      if (force) {
        const used = (await db.execute(
          sql`SELECT COUNT(*)::int AS n FROM orders WHERE staff_id = ${id}`,
        )).rows[0] as { n: number };
        if (used.n > 0) return res.status(409).json({ error: 'in_use', order_count: used.n });
        const deleted = (await db.execute(sql`DELETE FROM staff WHERE id = ${id} RETURNING id`)).rows[0];
        if (!deleted) return res.status(404).json({ error: 'not_found' });
        return res.json({ ok: true, deleted: true });
      }
      await db.execute(sql`UPDATE staff SET is_active = false WHERE id = ${id}`);
      res.json({ ok: true, deactivated: true });
    } catch (err) {
      console.error('[admin.staff.delete] failed:', err);
      res.status(500).json({ error: 'delete_failed' });
    }
  });

  // ---- Customers: create + delete (list/stats/patch already exist) ----
  const customerCreateSchema = z.object({
    phone: z.string().trim().min(4).max(40),
    name: z.string().trim().min(1).max(120),
    notes: z.string().trim().max(2000).nullable().optional(),
  });

  app.post('/api/admin/customers', requireStaff, requireStaffRole('owner', 'manager'), async (req, res) => {
    const parsed = customerCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    const { phone, name, notes } = parsed.data;
    try {
      const row = (await db.execute(sql`
        INSERT INTO customers (phone, name, notes)
        VALUES (${phone}, ${name}, ${notes ?? null})
        RETURNING id, phone, name, notes, user_id, created_at, updated_at
      `)).rows[0];
      res.json({ customer: row });
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'phone_taken' });
      console.error('[admin.customers.create] failed:', err);
      res.status(500).json({ error: 'create_failed' });
    }
  });

  // DELETE — blocked when the customer still holds memberships (prepaid
  // liability). Otherwise detaches their vehicles and removes the row.
  app.delete('/api/admin/customers/:id', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
    try {
      const mem = (await db.execute(
        sql`SELECT COUNT(*)::int AS n FROM memberships WHERE customer_id = ${id}`,
      )).rows[0] as { n: number };
      if (mem.n > 0) return res.status(409).json({ error: 'has_memberships', membership_count: mem.n });
      await db.execute(sql`UPDATE cars SET customer_id = NULL WHERE customer_id = ${id}`);
      const deleted = (await db.execute(sql`DELETE FROM customers WHERE id = ${id} RETURNING id`)).rows[0];
      if (!deleted) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true, deleted: true });
    } catch (err) {
      console.error('[admin.customers.delete] failed:', err);
      res.status(500).json({ error: 'delete_failed' });
    }
  });

  // Test Google API key endpoint
  app.get("/api/test-google-api", async (req, res) => {
    try {
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      const placeId = process.env.GOOGLE_BUSINESS_PLACE_ID;

      if (!apiKey || !placeId) {
        return res.json({ 
          status: "error",
          message: "API credentials not configured" 
        });
      }

      // Simple test request to verify API key
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating&key=${apiKey}`
      );

      const data = await response.json();
      
      res.json({
        status: data.status,
        message: data.status === "OK" ? "API key is working!" : data.error_message || "API error",
        businessName: data.result?.name || "Not available",
        rating: data.result?.rating || "Not available"
      });

    } catch (error) {
      res.json({ 
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Google Reviews API endpoint
  app.get("/api/reviews", async (req, res) => {
    try {
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      const requestedPlaceId = req.query.placeId as string;
      const defaultPlaceId = process.env.GOOGLE_BUSINESS_PLACE_ID;
      
      // Use requested place ID or fall back to default (Tungku branch)
      const placeId = requestedPlaceId || defaultPlaceId;

      if (!apiKey || !placeId) {
        return res.status(500).json({ 
          error: "Google API credentials not configured" 
        });
      }

      // Allowlist: only the default place or known branch slugs. Prevents
      // arbitrary place IDs from triggering paid Google API calls or
      // spamming the cache with unbounded keys.
      if (requestedPlaceId && requestedPlaceId !== defaultPlaceId && !REVIEW_BRANCH_SLUGS.has(requestedPlaceId)) {
        return res.status(400).json({ error: "Unknown location" });
      }

      const reviewsCacheKey = `reviews:${placeId}`;
      const cachedReviews = googleCacheGet(reviewsCacheKey);
      if (cachedReviews) {
        return res.status(cachedReviews.status).json(cachedReviews.body);
      }

      // For branches without configured Place IDs, search for them dynamically
      if (placeId !== defaultPlaceId && !placeId.startsWith('ChIJ')) {
        // Get search query for the branch
        const branchQueries: { [key: string]: string } = {
          "salar-branch": "Cuci Xpress Salar Link Brunei",
          "bengkurong-branch": "Cuci Xpress Bengkurong Link Brunei", 
          "tutong-branch": "Cuci Xpress Tutong Link Brunei",
          "lambak-branch": "Cuci Xpress Lambak Brunei"
        };
        
        const searchQuery = branchQueries[placeId];
        if (searchQuery) {
          try {
            // Search for Place ID using Google Places API
            const searchResponse = await fetch(
              `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(searchQuery)}&inputtype=textquery&fields=place_id,name&key=${apiKey}`
            );
            
            if (searchResponse.ok) {
              const searchData = await searchResponse.json();
              if (searchData.status === "OK" && searchData.candidates && searchData.candidates.length > 0) {
                const foundPlaceId = searchData.candidates[0].place_id;
                
                // Get reviews using the found Place ID
                const reviewsResponse = await fetch(
                  `https://maps.googleapis.com/maps/api/place/details/json?place_id=${foundPlaceId}&fields=reviews,rating,user_ratings_total&key=${apiKey}`
                );
                
                if (reviewsResponse.ok) {
                  const reviewsData = await reviewsResponse.json();
                  if (reviewsData.status === "OK") {
                    // Process authentic Google Reviews
                    const reviews = reviewsData.result.reviews || [];
                    const allReviews = reviews.map((review: any) => {
                      const initials = review.author_name
                        .split(" ")
                        .map((name: string) => name[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2);

                      const colors = [
                        'bg-gradient-to-br from-purple-500 to-purple-600',
                        'bg-gradient-to-br from-orange-500 to-orange-600',
                        'bg-gradient-to-br from-green-500 to-green-600',
                        'bg-gradient-to-br from-blue-500 to-blue-600',
                        'bg-gradient-to-br from-pink-500 to-pink-600',
                        'bg-gradient-to-br from-indigo-500 to-indigo-600'
                      ];

                      return {
                        name: review.author_name,
                        role: "Verified Customer",
                        content: review.text,
                        rating: review.rating,
                        initials,
                        bgColor: colors[Math.floor(Math.random() * colors.length)],
                        date: review.relative_time_description
                      };
                    });

                    // Filter for positive reviews (4-5 stars)
                    const positiveReviews = allReviews.filter((review: any) => review.rating >= 4);

                    const branchBody = {
                      reviews: positiveReviews,
                      averageRating: reviewsData.result.rating || 0,
                      totalReviews: reviewsData.result.user_ratings_total || 0
                    };
                    googleCacheSet(reviewsCacheKey, 200, branchBody, true);
                    return res.json(branchBody);
                  }
                }
              }
            }
          } catch (error) {
            console.error(`Error fetching reviews for ${placeId}:`, error);
          }
        }
        
        // If search or review fetch fails, return empty with loading message
        const emptyBody = { 
          reviews: [], 
          averageRating: 0, 
          totalReviews: 0,
          message: "Loading authentic Google reviews for this location..."
        };
        googleCacheSet(reviewsCacheKey, 200, emptyBody, false);
        return res.json(emptyBody);
      }

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews,rating,user_ratings_total&key=${apiKey}`
      );

      if (!response.ok) {
        throw new Error(`Google API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.status !== "OK") {
        let errorDetails = `Status: ${data.status}`;
        if (data.error_message) {
          errorDetails += ` - ${data.error_message}`;
        }
        
        // Provide specific guidance based on error type
        if (data.status === "REQUEST_DENIED") {
          if (data.error_message?.includes("invalid")) {
            errorDetails += " (Check: API key validity, Places API enabled, billing active)";
          } else {
            errorDetails += " (Check: API restrictions, domain allowlist)";
          }
        } else if (data.status === "OVER_QUERY_LIMIT") {
          errorDetails += " (API quota exceeded)";
        } else if (data.status === "INVALID_REQUEST") {
          errorDetails += " (Check Place ID format)";
        }
        
        throw new Error(errorDetails);
      }

      // Transform Google reviews to our format and filter for positive reviews
      interface ReviewData {
        name: string;
        role: string;
        content: string;
        rating: number;
        initials: string;
        bgColor: string;
        date: string;
      }

      const allReviews: ReviewData[] = data.result.reviews?.map((review: any) => ({
        name: review.author_name,
        role: "Verified Customer",
        content: review.text,
        rating: review.rating,
        initials: review.author_name
          .split(" ")
          .map((name: string) => name[0])
          .join("")
          .toUpperCase()
          .slice(0, 2),
        bgColor: review.rating >= 4 ? "#6C5CE7" : review.rating >= 3 ? "#FFA500" : "#EF4444",
        date: new Date(review.time * 1000).toLocaleDateString()
      })) || [];

      // Filter to show only 4-5 star reviews for representative customer experience
      const positiveReviews = allReviews.filter((review: ReviewData) => review.rating >= 4);

      const mainBody = {
        reviews: positiveReviews.slice(0, 6), // Show latest 6 positive reviews
        averageRating: data.result.rating,
        totalReviews: data.result.user_ratings_total
      };
      googleCacheSet(`reviews:${placeId}`, 200, mainBody, true);
      res.json(mainBody);

    } catch (error) {
      console.error("Error fetching Google reviews:", error);
      const errBody = { 
        error: "Failed to fetch reviews",
        details: error instanceof Error ? error.message : "Unknown error"
      };
      const failKey = `reviews:${(req.query.placeId as string) || process.env.GOOGLE_BUSINESS_PLACE_ID}`;
      googleCacheSet(failKey, 500, errBody, false);
      res.status(500).json(errBody);
    }
  });

  // API endpoint to get overall average rating across all branches
  app.get("/api/average-rating", async (req, res) => {
    try {
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      const defaultPlaceId = process.env.GOOGLE_BUSINESS_PLACE_ID;

      if (!apiKey || !defaultPlaceId) {
        return res.json({ 
          averageRating: 4.8,
          totalReviews: 150,
          message: "Using estimated rating - configure Google API for real data"
        });
      }

      const ratingCached = googleCacheGet("average-rating");
      if (ratingCached) {
        return res.status(ratingCached.status).json(ratingCached.body);
      }

      const branches = [
        { name: "Tungku Link", placeId: defaultPlaceId },
        { name: "Salar", placeId: "salar-branch" },
        { name: "Bengkurong", placeId: "bengkurong-branch" },
        { name: "Tutong", placeId: "tutong-branch" },
        { name: "Lambak", placeId: "lambak-branch" }
      ];

      let totalRating = 0;
      let totalReviewCount = 0;
      let validBranches = 0;

      for (const branch of branches) {
        try {
          let actualPlaceId = branch.placeId;
          
          // For non-default branches, search for Place ID first
          if (branch.placeId !== defaultPlaceId && !branch.placeId.startsWith('ChIJ')) {
            const branchQueries: { [key: string]: string } = {
              "salar-branch": "Cuci Xpress Salar Link Brunei",
              "bengkurong-branch": "Cuci Xpress Bengkurong Link Brunei", 
              "tutong-branch": "Cuci Xpress Tutong Link Brunei",
              "lambak-branch": "Cuci Xpress Lambak Brunei"
            };
            
            const searchQuery = branchQueries[branch.placeId];
            if (searchQuery) {
              const searchResponse = await fetch(
                `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(searchQuery)}&inputtype=textquery&fields=place_id,name&key=${apiKey}`
              );
              
              if (searchResponse.ok) {
                const searchData = await searchResponse.json();
                if (searchData.status === "OK" && searchData.candidates && searchData.candidates.length > 0) {
                  actualPlaceId = searchData.candidates[0].place_id;
                }
              }
            }
          }

          // Get branch details including rating
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${actualPlaceId}&fields=rating,user_ratings_total&key=${apiKey}`
          );

          if (response.ok) {
            const data = await response.json();
            if (data.status === "OK" && data.result.rating) {
              totalRating += data.result.rating;
              totalReviewCount += data.result.user_ratings_total || 0;
              validBranches++;
            }
          }
        } catch (error) {
          console.error(`Error fetching rating for ${branch.name}:`, error);
          continue;
        }
      }

      if (validBranches > 0) {
        const averageRating = totalRating / validBranches;
        const ratingBody = {
          averageRating: parseFloat((averageRating).toFixed(1)),
          totalReviews: totalReviewCount,
          validBranches,
          message: "Authentic Google ratings across all branches"
        };
        googleCacheSet("average-rating", 200, ratingBody, true);
        return res.json(ratingBody);
      } else {
        const fallbackBody = {
          averageRating: 4.8,
          totalReviews: 150,
          message: "Unable to fetch authentic ratings - using estimated data"
        };
        googleCacheSet("average-rating", 200, fallbackBody, false);
        return res.json(fallbackBody);
      }

    } catch (error) {
      console.error("Error calculating average rating:", error);
      res.status(500).json({ 
        error: "Failed to calculate average rating",
        averageRating: 4.8,
        totalReviews: 150
      });
    }
  });

  // Payment processing endpoint
  // Sends the web-checkout receipt (+ QR) for a paid Pocket Pay order exactly
  // once. Claims the send atomically via receipt_email_sent_at so the two
  // triggers (payment-callback + success-page rehydration) can both call it
  // without double-emailing; on a send failure the claim is released so a later
  // trigger retries. Never throws — all paths are best-effort.
  async function sendReceiptEmailIfUnsent(ppOrderId: string): Promise<void> {
    let claimed:
      | { customer_email: string | null; plate: string | null; package_name: string | null; total_cents: number | null; payment_ref: string | null }
      | undefined;
    try {
      const claim = await db.execute(sql`
        UPDATE orders
           SET receipt_email_sent_at = now()
         WHERE qr_provider = 'pocket_pay'
           AND payment_ref = ${ppOrderId}
           AND status = 'paid'
           AND customer_email IS NOT NULL
           AND receipt_email_sent_at IS NULL
        RETURNING customer_email, plate, package_name, total_cents, payment_ref
      `);
      claimed = claim.rows[0] as typeof claimed;
    } catch (claimErr) {
      console.error('[receipt-email] claim failed (non-blocking):', claimErr);
      return;
    }
    if (!claimed?.customer_email) return; // already sent, not paid yet, or no email on file

    let ok = false;
    try {
      ok = await sendPaymentConfirmation({
        customerEmail: claimed.customer_email,
        transactionId: claimed.payment_ref ?? ppOrderId,
        orderId: claimed.payment_ref ?? ppOrderId,
        service: claimed.package_name ?? 'Car Wash Service',
        amount: Number(claimed.total_cents ?? 0) / 100,
        branch: 'Any Cuci Xpress branch',
        customerName: claimed.plate ?? undefined,
        isOnline: true,
      });
    } catch (mailErr) {
      console.error('[receipt-email] send threw:', mailErr);
    }
    if (!ok) {
      // Release the claim so the next trigger (callback retry / success page) can retry.
      try {
        await db.execute(sql`
          UPDATE orders SET receipt_email_sent_at = NULL
           WHERE qr_provider = 'pocket_pay' AND payment_ref = ${ppOrderId}
        `);
      } catch (relErr) {
        console.error('[receipt-email] failed to release claim after send failure:', relErr);
      }
    }
  }

  app.post("/api/process-payment", async (req, res) => {
    try {
      const paymentData = req.body;
      
      // Validate required fields. Note: branch is intentionally NOT
      // required — customers buy from anywhere and the branch is set
      // when they scan the QR at the lane (see /api/verify-qr).
      const requiredFields = ['serviceName', 'amount', 'carPlate', 'phone', 'email'];
      const missingFields = requiredFields.filter(field => !paymentData[field]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`
        });
      }

      // Website checkout requires a valid email — that's where the receipt
      // (and scannable QR) is sent once /api/payment-callback confirms payment.
      const customerEmail = String(paymentData.email).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
        return res.status(400).json({
          success: false,
          message: 'A valid email address is required.'
        });
      }

      // Branch-at-scan model (2026-05-06_01): orders insert with
      // branch_id = NULL. The lane that scans the QR stamps its own
      // branch_id onto the row in /api/verify-qr. Until then the
      // order doesn't appear on any POS / live-queue snapshot.
      const branchId: number | null = null;

      // Resolve package: try exact name match first, fall back to amount
      // match (BND price → cents). package_id is nullable on orders, so
      // a no-match case still inserts cleanly using the snapshot fields.
      const amountCents = Math.round(Number(paymentData.amount) * 100);
      const pkgRows = (await db.execute(sql`
        SELECT id, name, price_cents
          FROM packages
         WHERE is_active = true
           AND (LOWER(name) = LOWER(${paymentData.serviceName})
                OR price_cents = ${amountCents})
         ORDER BY (LOWER(name) = LOWER(${paymentData.serviceName})) DESC,
                  price_cents ASC
         LIMIT 1
      `)).rows as Array<{ id: string; name: string; price_cents: number }>;
      const matchedPkg = pkgRows[0] ?? null;
      const packageId   = matchedPkg?.id ?? null;
      const packageName = matchedPkg?.name ?? String(paymentData.serviceName);
      const priceCents  = matchedPkg?.price_cents ?? amountCents;

      // Normalise plate (mirrors POS upsert in /api/pos/orders).
      const plateUpper = String(paymentData.carPlate).toUpperCase();
      const plateNorm  = plateUpper.replace(/\s+/g, '');
      const phoneStr   = String(paymentData.phone).trim();

      // Override the client-supplied amount with the server-authoritative
      // package price so Pocket Pay is always charged the correct amount.
      // This prevents an attacker from submitting a lower amount for an
      // expensive package and still receiving a paid order.
      paymentData.amount = priceCents / 100;

      // Process payment through Pocket Pay
      const result = await processPocketPayPayment(paymentData);
      
      if (result.success) {
        // Log successful payment link creation
        console.log('Payment link created successfully:', {
          transaction_id: result.transaction_id,
          order_id: result.order_id,
          car_plate: paymentData.carPlate,
          phone: paymentData.phone,
          amount: paymentData.amount,
          service: paymentData.serviceName,
          branch: 'unassigned (set at lane scan)'
        });

        // ── Phase 12a: upsert customer + car + insert pending_payment order
        // so the wash exists in the CRM the moment the link is generated.
        // The Pocket Pay callback (below) flips status to 'paid' (or
        // 'voided' on failure) by looking up payment_ref. All inside one
        // transaction so a partial failure can't half-write the customer.
        // Wrapped in try/catch — a DB hiccup must NOT break the customer's
        // payment flow; they already have a working Pocket Pay link.
        try {
          await db.transaction(async (tx) => {
            const fallbackName = `Online: ${plateUpper}`;
            // Upsert customer by phone. ON CONFLICT bumps updated_at only —
            // we don't overwrite an existing customer's real name with our
            // "Online: <plate>" placeholder.
            const cuRows = (await tx.execute(sql`
              INSERT INTO customers (phone, name)
              VALUES (${phoneStr}, ${fallbackName})
              ON CONFLICT (phone) DO UPDATE
                 SET updated_at = now()
              RETURNING id
            `)).rows as Array<{ id: number }>;
            const customerId = cuRows[0]?.id ?? null;

            // Upsert car by normalised plate, link it to the customer.
            // Same dedup ordering as the POS path so we hit the same row.
            let vehicleId: number | null = null;
            const existing = (await tx.execute(sql`
              SELECT id FROM cars
               WHERE UPPER(REGEXP_REPLACE(license_plate, '\\s+', '', 'g')) = ${plateNorm}
               ORDER BY (CASE WHEN customer_id = ${customerId ?? -1} THEN 0 ELSE 1 END) ASC,
                        COALESCE(last_seen_at, 'epoch'::timestamptz) DESC,
                        id DESC
               LIMIT 1
            `)).rows as Array<{ id: number }>;
            if (existing.length > 0) {
              vehicleId = existing[0].id;
              await tx.execute(sql`
                UPDATE cars SET
                  customer_id  = COALESCE(customer_id, ${customerId}),
                  last_seen_at = now()
                 WHERE id = ${vehicleId}
              `);
            } else {
              const ins = (await tx.execute(sql`
                INSERT INTO cars (license_plate, customer_id, last_seen_at)
                VALUES (${plateUpper}, ${customerId}, now())
                RETURNING id
              `)).rows as Array<{ id: number }>;
              vehicleId = ins[0]?.id ?? null;
            }

            // Insert the pending_payment order. ticket_code stays NULL —
            // staff allocates a T-NNN ticket at QR-scan time. payment_ref
            // is the Pocket Pay order_id (the field we get back in the
            // callback) so the partial-unique-index makes the callback
            // idempotent.
            const orderId = `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
            await tx.execute(sql`
              INSERT INTO orders (
                id, branch_id, plate, vehicle_id, customer_id,
                package_id, package_name, package_price_cents,
                addons, subtotal_cents, total_cents,
                payment_method, payment_ref, pocket_pay_success_indicator, qr_provider,
                status, customer_name_walkin, customer_email
              ) VALUES (
                ${orderId}, ${branchId}, ${plateUpper}, ${vehicleId}, ${customerId},
                ${packageId}, ${packageName}, ${priceCents},
                '[]'::jsonb, ${priceCents}, ${priceCents},
                'qr_code', ${result.order_id}, ${result.success_indicator ?? null}, 'pocket_pay',
                'pending_payment', ${fallbackName}, ${customerEmail || null}
              )
            `);
          });
        } catch (dbErr) {
          // Don't block the payment flow on a DB hiccup — log loudly so
          // we can backfill from Pocket Pay's transaction list later.
          console.error('Phase 12a: failed to record pending_payment order (continuing):', dbErr);
        }

        // Create order in KedaiPOS system (async - don't wait)
        kedaiPOSIntegration.createOrder({
          transaction_id: result.transaction_id,
          car_plate: paymentData.carPlate,
          phone: paymentData.phone,
          service: paymentData.serviceName,
          amount: paymentData.amount,
          branch: 'unassigned'
        }).then(kedaiResult => {
          if (kedaiResult.success) {
            console.log('Order created in KedaiPOS:', kedaiResult.kedai_order_id);
          } else {
            console.log('KedaiPOS integration not configured or failed:', kedaiResult.error);
          }
        }).catch(error => {
          console.log('KedaiPOS integration error (non-blocking):', error);
        });
        
        res.json({
          success: true,
          message: 'Payment link created successfully',
          redirect_url: result.payment_url,
          order_details: {
            transaction_id: result.transaction_id,
            order_id: result.order_id,
            order_ref: result.order_ref,
            service: paymentData.serviceName,
            amount: paymentData.amount,
            branch: null,
            car_plate: paymentData.carPlate,
            phone: paymentData.phone
          },
          qr_code: result.qr_code
        });
      } else {
        // Log failed payment
        console.log('Payment processing failed:', {
          car_plate: paymentData.carPlate,
          phone: paymentData.phone,
          amount: paymentData.amount,
          service: paymentData.serviceName,
          error: result.message
        });
        
        res.status(400).json({
          success: false,
          message: result.message || 'Payment processing failed'
        });
      }
      
    } catch (error) {
      console.error('Payment processing error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during payment processing'
      });
    }
  });

  // Save customer information - now handled by queue app's users table
  app.post("/api/save-customer", async (req, res) => {
    try {
      const { carPlate, phone } = req.body;
      
      if (!carPlate || !phone) {
        return res.status(400).json({
          success: false,
          message: 'Car plate and phone number are required'
        });
      }
      
      // Customer info is logged here - full customer management is handled by CuciXpressLiveQue app
      console.log('Customer payment info:', { carPlate, phone });
      
      res.json({
        success: true,
        message: 'Customer information recorded',
        customer: { carPlate, phone }
      });
      
    } catch (error) {
      console.error('Customer save error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error while saving customer information'
      });
    }
  });

  // Send payment confirmation email
  app.post("/api/send-payment-confirmation", async (req, res) => {
    try {
      const { carPlate, phone, transactionId, orderId, service, amount, branch, customerEmail, customerName } = req.body;
      
      if (!transactionId || !orderId || !service || !amount || !branch) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields for payment confirmation'
        });
      }
      
      console.log('Payment confirmation for:', { carPlate, phone, transactionId, orderId, service, amount, branch, customerEmail });
      
      let emailSent = false;
      if (customerEmail) {
        emailSent = await sendPaymentConfirmation({
          customerEmail,
          transactionId,
          orderId,
          service,
          amount,
          branch,
          customerName: customerName || carPlate || 'Customer'
        });
      }
      
      res.json({
        success: true,
        message: emailSent
          ? `Payment confirmation email sent to ${customerEmail}`
          : 'Payment confirmed - no email address provided'
      });
      
    } catch (error) {
      console.error('Payment confirmation error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error while processing confirmation'
      });
    }
  });

  // QR Code Verification endpoint for staff POS system
  app.get('/verify/:transactionId', async (req, res) => {
    const { transactionId } = req.params;
    
    try {
      // In a real implementation, you would verify this against your database
      // For now, return verification details for valid-looking transaction IDs
      if (!transactionId || transactionId === 'CX_UNKNOWN') {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      // Mock verification data - in production this would come from your payment database
      const verificationData = {
        success: true,
        transaction_id: transactionId,
        status: 'PAID',
        service: 'Car Wash Service',
        amount: 12,
        branch: 'Tungku Link',
        car_plate: 'BB1234',
        phone: '673 7654321',
        timestamp: new Date().toISOString(),
        verified_at: new Date().toISOString()
      };

      res.json(verificationData);
    } catch (error) {
      console.error('QR verification error:', error);
      res.status(500).json({
        success: false,
        message: 'Verification system error'
      });
    }
  });

  // QR Code Verification API for staff scanning.
  // Locked to staff (Task 2.3): only the lane/cashier should be able to
  // mark a transaction's QR as verified.
  // POST /api/verify-qr — Phase 12c.
  // Staff scans the customer's Pocket Pay QR receipt at the lane.
  // We look up the prepaid order by `payment_ref`, allocate the next
  // T-NNN ticket for this branch+day (mirroring /api/pos/orders), and
  // flip status from 'paid' -> 'queued'. Idempotent: rescanning a
  // ticket that's already in the queue returns the existing ticket
  // code instead of allocating a new one.
  app.post('/api/verify-qr', requireStaff, requireStaffRole('owner', 'manager', 'lane', 'cashier'), async (req, res) => {
    const { qr_data, branch_id: scanBranchRaw } = req.body ?? {};
    if (typeof qr_data !== 'string' || qr_data.length === 0) {
      return res.status(400).json({ success: false, message: 'Missing qr_data' });
    }

    // The cashier's active POS branch. Required for the lane scan to
    // assign the order to a branch (branch-at-scan model, 2026-05-06_01)
    // — orders are created branchless from web checkout / loyalty
    // redeem, and only land on a POS / live queue once a lane scans
    // their QR. The standalone admin scan-in page (no per-branch
    // context) can still scan, but a branchless order without a scan
    // branch can't be ticketed; we surface a clear error in that case.
    const scanBranchId =
      typeof scanBranchRaw === 'number' && Number.isInteger(scanBranchRaw) && scanBranchRaw > 0
        ? scanBranchRaw
        : null;

    let paymentData: any;
    try {
      paymentData = JSON.parse(qr_data);
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid QR code format' });
    }
    if (paymentData?.type !== 'CUCI_XPRESS_PAYMENT' || !paymentData?.order_id) {
      return res.status(400).json({ success: false, message: 'Invalid Cuci Xpress payment QR code' });
    }

    const ppOrderId = String(paymentData.order_id);

    try {
      const result = await db.transaction(async (tx) => {
        // 1. Look up the order by Pocket Pay reference.
        const orderRows = (await tx.execute(sql`
          SELECT o.id, o.branch_id, o.status, o.ticket_code, o.plate,
                 o.package_name, o.total_cents, o.payment_ref,
                 o.qr_provider,
                 o.vehicle_id, o.customer_id,
                 b.name AS branch_name,
                 c.name AS customer_name, c.phone AS customer_phone
            FROM orders o
            LEFT JOIN branches  b ON b.id = o.branch_id
            LEFT JOIN cars    car ON car.id = o.vehicle_id
            LEFT JOIN customers c ON c.id = car.customer_id
           WHERE o.qr_provider IN ('pocket_pay','loyalty','membership')
             AND o.payment_ref = ${ppOrderId}
           LIMIT 1
           FOR UPDATE OF o
        `)).rows as any[];

        if (orderRows.length === 0) {
          return { http: 404, body: { success: false, code: 'order_not_found', message: 'Order not in our system. Customer may have a legacy receipt.' } };
        }
        const order = orderRows[0];

        // 2. Status gates.
        if (order.status === 'pending_payment') {
          return { http: 402, body: { success: false, code: 'payment_pending', message: 'Payment not yet confirmed by Pocket Pay. Ask the customer to wait or pay again.' } };
        }
        if (order.status === 'voided' || order.status === 'refunded') {
          return { http: 409, body: { success: false, code: order.status, message: `Order is ${order.status}. Do not service this car.` } };
        }

        // 2a. Membership expiry fail-safe. A membership check-in QR is a
        //     B$0 voucher whose pre-created order stays 'paid' indefinitely,
        //     so it can be screenshotted and re-presented after the plan
        //     lapses. Before admitting a *fresh* membership wash, re-verify
        //     the vehicle still has an active, unexpired Unlimited plan.
        //     (Rescans of an already-queued ticket skip this — that wash was
        //     admitted while the plan was valid, and the car is mid-service.)
        if (order.qr_provider === 'membership' && order.status === 'paid' && !order.ticket_code) {
          const memRows = (await tx.execute(sql`
            SELECT 1
              FROM memberships
             WHERE vehicle_id = ${order.vehicle_id}
               AND kind   = 'unlimited'
               AND status = 'active'
               AND (expires_at IS NULL OR expires_at > now())
             LIMIT 1
          `)).rows as any[];
          if (memRows.length === 0) {
            return {
              http: 409,
              body: {
                success: false,
                code: 'membership_expired',
                message: 'Unlimited Xpress membership has expired or is no longer active. This QR is likely an old screenshot — do not service. Ask the customer to renew in the app.',
              },
            };
          }
        }

        // 2b. Branch-at-scan stamping (2026-05-06_01). Web orders and
        //     free-wash vouchers are created branchless. The first
        //     scan stamps the cashier's branch onto the order so it
        //     appears on that POS + queue. Re-scans (status already
        //     queued/washing/done) leave branch_id alone so the order
        //     stays on the lane that started it.
        if (order.status === 'paid' && !order.ticket_code) {
          if (scanBranchId === null) {
            // Standalone admin scan-in page can't ticket a branchless
            // order — there's no lane context. Surface a clear error.
            if (order.branch_id == null) {
              return {
                http: 400,
                body: {
                  success: false,
                  code: 'branch_required',
                  message: 'This QR has no branch yet. Scan it from a POS lane (which knows its branch) instead of the admin scan-in page.',
                },
              };
            }
            // Order already has a branch (legacy row) — fall through.
          } else if (Number(order.branch_id ?? -1) !== scanBranchId) {
            const newBranchRow = (await tx.execute(sql`
              SELECT name FROM branches WHERE id = ${scanBranchId} LIMIT 1
            `)).rows[0] as any;
            if (newBranchRow) {
              await tx.execute(sql`
                UPDATE orders SET branch_id = ${scanBranchId} WHERE id = ${order.id}
              `);
              if (order.qr_provider === 'loyalty') {
                await tx.execute(sql`
                  UPDATE loyalty_redemptions
                     SET branch_id = ${scanBranchId}
                   WHERE voucher_order_id = ${order.id}
                `);
              }
              order.branch_id = scanBranchId;
              order.branch_name = newBranchRow.name;
            }
          }
        }

        // 3. Already in the queue — return existing ticket (idempotent rescan).
        if (order.ticket_code && ['queued', 'washing', 'done'].includes(order.status)) {
          return {
            http: 200,
            body: {
              success: true,
              message: 'Already in queue',
              newly_allocated: false,
              order: {
                id: order.id,
                ticket_code: order.ticket_code,
                plate: order.plate,
                package_name: order.package_name,
                total_cents: Number(order.total_cents ?? 0),
                branch_id: order.branch_id,
                branch_name: order.branch_name,
                status: order.status,
                customer: order.customer_name
                  ? { name: order.customer_name, phone: order.customer_phone }
                  : null,
                is_prepaid: true,
              },
            },
          };
        }

        // 4. Allocate next T-NNN for this branch + today (UTC). Same algorithm
        //    as /api/pos/orders so prepaid + walk-in tickets share one stream.
        const seqRow = (await tx.execute(sql`
          SELECT COALESCE(
            MAX( NULLIF(regexp_replace(ticket_code, '\\D', '', 'g'), '')::int ),
            0
          ) + 1 AS next_seq
            FROM orders
           WHERE branch_id = ${order.branch_id}
             AND ticket_day = (now() AT TIME ZONE 'UTC')::date
        `)).rows as Array<{ next_seq: number }>;
        const seq = seqRow[0]?.next_seq ?? 1;
        const ticketCode = `T-${String(seq).padStart(3, '0')}`;

        // 5. Flip the order into the queue with its new ticket.
        const updated = (await tx.execute(sql`
          UPDATE orders
             SET ticket_code = ${ticketCode},
                 status      = 'queued',
                 claimed_at  = COALESCE(claimed_at, now()),
                 ticket_day  = (now() AT TIME ZONE 'UTC')::date
           WHERE id = ${order.id}
             AND status = 'paid'
             AND ticket_code IS NULL
          RETURNING id, ticket_code, status
        `)).rows as any[];

        if (updated.length === 0) {
          // Race: another scan beat us to it. Re-read and return idempotent.
          const re = (await tx.execute(sql`
            SELECT ticket_code, status FROM orders WHERE id = ${order.id} LIMIT 1
          `)).rows[0] as any;
          return {
            http: 200,
            body: {
              success: true,
              message: 'Already in queue',
              newly_allocated: false,
              order: {
                id: order.id,
                ticket_code: re?.ticket_code ?? null,
                plate: order.plate,
                package_name: order.package_name,
                total_cents: Number(order.total_cents ?? 0),
                branch_id: order.branch_id,
                branch_name: order.branch_name,
                status: re?.status ?? order.status,
                customer: order.customer_name
                  ? { name: order.customer_name, phone: order.customer_phone }
                  : null,
                is_prepaid: true,
              },
            },
          };
        }

        return {
          http: 200,
          body: {
            success: true,
            message: 'Ticket allocated',
            newly_allocated: true,
            order: {
              id: order.id,
              ticket_code: ticketCode,
              plate: order.plate,
              package_name: order.package_name,
              total_cents: Number(order.total_cents ?? 0),
              branch_id: order.branch_id,
              branch_name: order.branch_name,
              status: 'queued',
              customer: order.customer_name
                ? { name: order.customer_name, phone: order.customer_phone }
                : null,
              is_prepaid: true,
            },
          },
        };
      });

      return res.status(result.http).json(result.body);
    } catch (error) {
      console.error('[verify-qr] failed:', error);
      return res.status(500).json({ success: false, message: 'Verification system error' });
    }
  });

  // /payment-success is handled by the React SPA (wouter route)
  // Pocket Pay redirects here with successIndicator, Message, OrderId query params
  // No server-side redirect needed — Express falls through to the SPA catch-all

  // Payment callback endpoint for Pocket Pay
  app.post("/api/payment-callback", async (req, res) => {
    try {
      // handlePaymentCallback() normalises Pocket Pay's real callback shape
      // ({ OrderId, Message, successIndicator }) and logs it.
      const result = handlePaymentCallback(req.body);

      const ppOrderId = result.order_id;
      if (!ppOrderId) {
        console.warn('payment-callback: missing OrderId in callback');
        return res.status(400).json({ status: 'ERROR', message: 'Missing order id' });
      }

      // ── Authenticate the callback. Pocket Pay does NOT sign the callback with
      // a hash; instead it echoes the per-order `successIndicator` it gave us at
      // create time. We look up the value we stored for THIS order id and require
      // the callback to match it. An attacker can't forge a callback without
      // knowing this per-order secret. We check both the subscription flow
      // (pocket_pay_ref) and the single-wash order flow (payment_ref).
      const subRow = (await db.execute(sql`
        SELECT pocket_pay_success_indicator AS ind
          FROM subscriptions
         WHERE pocket_pay_ref = ${ppOrderId} AND payment_provider = 'pocket_pay'
         LIMIT 1
      `)).rows[0] as { ind: string | null } | undefined;
      const ordRow = (await db.execute(sql`
        SELECT pocket_pay_success_indicator AS ind
          FROM orders
         WHERE payment_ref = ${ppOrderId} AND qr_provider = 'pocket_pay'
         LIMIT 1
      `)).rows[0] as { ind: string | null } | undefined;

      if (!subRow && !ordRow) {
        console.warn('payment-callback: no subscription/order found for OrderId', ppOrderId);
        return res.status(404).json({ status: 'ERROR', message: 'Unknown order' });
      }

      const expectedIndicator = subRow?.ind ?? ordRow?.ind ?? null;
      const provided = result.success_indicator;
      const authentic = !!expectedIndicator && !!provided && expectedIndicator === provided;
      if (!authentic) {
        console.warn('payment-callback: success_indicator mismatch for OrderId', ppOrderId);
        return res.status(400).json({ status: 'ERROR', message: 'Invalid callback authentication' });
      }

      // ── Determine the outcome. Pocket Pay only echoes the per-order
      // `successIndicator` on a GENUINE successful payment, so an AUTHENTICATED
      // callback (we already returned above when the indicator didn't match) is
      // itself the success signal. The deeplink / in-app flow (customer completes
      // payment inside the Pocket app rather than the web gateway) omits the
      // "Successful Payment" Message that the web flow sends — it arrives as
      // `Message: null`. So we must NOT require the message text to confirm
      // success; doing so wrongly voided real paid orders completed in the app.
      // Only an EXPLICIT failure message marks the order voided.
      const msg = (result.message ?? '').trim().toLowerCase();
      const explicitFailure =
        /unsuccess|fail|cancel|declin|reject|expired|timeout/.test(msg);
      const paid = !explicitFailure;
      // ── Phase 12a: flip the pending_payment order to 'paid' or 'voided'. The
      // partial unique index on payment_ref (WHERE qr_provider='pocket_pay') +
      // the status guard make this idempotent — Pocket Pay can safely re-deliver
      // the callback, and a manual override (refund, void) sticks.
      const newStatus = paid ? 'paid' : 'voided';
      try {
        await db.execute(sql`
          UPDATE orders
             SET status       = ${newStatus},
                 completed_at = CASE WHEN ${newStatus} = 'paid' THEN now() ELSE completed_at END
           WHERE qr_provider = 'pocket_pay'
             AND payment_ref = ${ppOrderId}
             AND status      = 'pending_payment'
        `);
      } catch (dbErr) {
        // Non-blocking: callback ack still goes back to Pocket Pay. The pending
        // row stays visible in the CRM as 'pending_payment' and can be
        // reconciled by hand or by a future status-poll cron.
        console.error('Phase 12a: failed to flip order status from callback (non-blocking):', dbErr);
      }

      // If this Pocket Pay order funded a ONE-TIME subscription purchase,
      // finalize it now (activate the 1-month unlimited membership per car).
      // Idempotent and a no-op for ordinary single-wash order callbacks.
      if (paid) {
        try {
          await activatePocketPaySubscription(ppOrderId);
        } catch (subErr) {
          console.error('payment-callback: subscription activation failed (non-blocking):', subErr);
        }
      }

      // Email the receipt + scannable QR the moment payment is confirmed. The
      // helper claims the send atomically (receipt_email_sent_at), so Pocket
      // Pay's callback retries never double-send, and a transient failure is
      // released so the success-page fallback can retry. Non-blocking.
      if (paid) {
        await sendReceiptEmailIfUnsent(ppOrderId);
      }

      if (paid) {
        return res.json({ status: 'OK', message: 'Callback processed' });
      }
      // Authentic but a non-success status (failed/cancelled): ack so Pocket Pay
      // stops retrying — we've already voided the pending order above.
      return res.json({ status: 'OK', message: `Callback processed (${result.message})` });
    } catch (error) {
      console.error('Payment callback error:', error);
      res.status(500).json({ status: 'ERROR', message: 'Internal server error' });
    }
  });

  // Payment status query endpoint — asks Pocket Pay for the real, current status
  // of an order (used for back-office reconciliation of stuck/voided orders).
  // Staff-only: the response reveals whether an order_id was paid and its amount,
  // and order_ids are short sequential integers, so leaving this public would make
  // it a payment-enumeration oracle. Owner/manager only.
  app.post("/api/payment-status", requireStaff, requireStaffRole('owner', 'manager'), async (req, res) => {
    try {
      const { order_id } = req.body;
      
      if (!order_id) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required'
        });
      }

      const result = await queryTransactionStatus(order_id);
      res.json(result);
      
    } catch (error) {
      console.error('Payment status query error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // GET /api/payment-success-order — secret-gated receipt rehydration.
  // The /payment-success page reads ?OrderId= and ?successIndicator= from the
  // Pocket Pay redirect. sessionStorage is the fast path, but it is gone on a
  // page refresh (we removeItem it on first load) or if the gateway round-trip
  // dropped it — which is exactly why the receipt used to fall back to
  // "UNKNOWN"/"N/A". This rehydrates the real order straight from the DB so the
  // plate, phone, package and branch always show.
  //
  // Auth: the per-order `successIndicator` is a secret Pocket Pay handed the
  // buyer in the redirect URL; we require it to match the value stored at create
  // time (the same secret /api/payment-callback authenticates with). That keeps
  // this from being a plate/phone enumeration oracle. We NEVER echo the
  // indicator back to the client.
  app.get("/api/payment-success-order", async (req, res) => {
    const orderId = String(req.query.orderId ?? '').trim();
    const successIndicator = String(req.query.successIndicator ?? '').trim();
    if (!orderId || !successIndicator) {
      return res.status(400).json({ success: false, message: 'Missing order id or indicator' });
    }
    try {
      const rows = (await db.execute(sql`
        SELECT o.payment_ref, o.plate, o.package_name, o.total_cents,
               o.status, o.created_at,
               b.name  AS branch_name,
               c.phone AS customer_phone
          FROM orders o
          LEFT JOIN branches  b ON b.id = o.branch_id
          LEFT JOIN customers c ON c.id = o.customer_id
         WHERE o.payment_ref = ${orderId}
           AND o.qr_provider = 'pocket_pay'
           AND o.pocket_pay_success_indicator = ${successIndicator}
         LIMIT 1
      `)).rows as Array<{
        payment_ref: string; plate: string | null; package_name: string | null;
        total_cents: number | null; status: string | null; created_at: string;
        branch_name: string | null; customer_phone: string | null;
      }>;
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      const o = rows[0];
      // Fallback receipt sender: if the Pocket Pay callback was missed or its
      // email send failed transiently, fire it here when the buyer lands on the
      // success page. The helper's atomic claim prevents a double-send with the
      // callback. Fire-and-forget — never blocks the receipt response.
      if (o.status === 'paid') {
        void sendReceiptEmailIfUnsent(o.payment_ref);
      }
      res.json({
        success: true,
        order_details: {
          transaction_id: o.payment_ref,
          order_id: o.payment_ref,
          service: o.package_name ?? 'Car Wash Service',
          amount: Number(o.total_cents ?? 0) / 100,
          branch: o.branch_name ?? null,
          car_plate: o.plate ?? null,
          phone: o.customer_phone ?? null,
          status: o.status ?? null,
          timestamp: o.created_at,
        },
      });
    } catch (err) {
      console.error('[payment-success-order] lookup failed:', err);
      res.status(500).json({ success: false, message: 'Lookup failed' });
    }
  });



  // Payment cancel page route
  app.get("/payment-cancel", (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payment Cancelled - Cuci Xpress</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f8f9fa; }
            .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .cancel { color: #dc3545; font-size: 48px; margin-bottom: 20px; }
            h1 { color: #dc3545; margin-bottom: 20px; }
            p { color: #666; line-height: 1.6; margin-bottom: 30px; }
            .btn { background: #6C5CE7; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px; }
            .btn-secondary { background: #6c757d; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="cancel">✗</div>
            <h1>Payment Cancelled</h1>
            <p>Your payment was cancelled. No charges were made to your account.</p>
            <p>If you'd like to try again, please return to our service page.</p>
            <a href="/" class="btn">Return to Home</a>
            <a href="/#service-pricing" class="btn btn-secondary">Try Again</a>
          </div>
        </body>
      </html>
    `);
  });

  // Serve diagnostic page for API testing
  app.get("/diagnostic", (req, res) => {
    res.sendFile(process.cwd() + "/diagnostic.html");
  });

  // === Customer Authentication Endpoints ===
  //
  // 2026-05-09 cutover: legacy email+password login/register endpoints
  // were removed. The customer flow is now phone/email + email-OTP only,
  // backed by Lucia v3 sessions (cx_session cookie, 365-day TTL). The
  // new endpoints live below at /api/auth/customer/{register,signin}/*.
  //
  // The two stubs below preserve the URL paths so any old client cached
  // in someone's browser gets a clear 410 instead of a confusing 404.

  app.post('/api/auth/login', (_req, res) => {
    res.status(410).json({
      success: false,
      error: 'Password login is no longer supported. Sign in with your email — we\'ll send a one-time code.',
      redirect: '/login',
    });
  });

  app.post('/api/auth/register', (_req, res) => {
    res.status(410).json({
      success: false,
      error: 'Password registration is no longer supported. Create your account with email — we\'ll send a one-time code.',
      redirect: '/login',
    });
  });

  // Logout endpoint — invalidates the Lucia session (if any) and clears
  // both the new cx_session cookie and the legacy cuci_auth_token JWT
  // cookie so existing logged-in users are fully signed out on cutover.
  app.post('/api/auth/logout', async (req, res) => {
    try {
      const sid = req.lucia?.session?.id;
      if (sid) {
        await lucia.invalidateSession(sid);
      }
    } catch (err) {
      console.error('[logout] lucia invalidate failed', err);
    }
    // Clear new session cookie
    const blank = lucia.createBlankSessionCookie();
    res.appendHeader('Set-Cookie', blank.serialize());
    // Clear legacy JWT cookies (both bare and cross-domain variants)
    unifiedAuth.clearAuthCookies(res);
    res.json({ success: true, message: 'Logged out successfully' });
  });

  // Get current user endpoint with car details from queue app database.
  //
  // 2026-05-05 — auth-unification fix. Originally this only accepted the
  // legacy JWT cookie (set by Google OAuth + the deprecated
  // username/password login). After Phase 12 the customer dashboard moved
  // to phone+OTP, which mints a Lucia `cx_session` cookie instead. That
  // left /checkout (which uses this endpoint via the `useAuth` hook)
  // unable to see a phone-OTP-logged-in customer, forcing them to sign
  // in twice — once on /dashboard and again on /checkout.
  //
  // The fix: try Lucia first, fall back to the legacy JWT only if Lucia
  // didn't recognise the request. Both paths resolve to a numeric user
  // id and the rest of the handler is unchanged.
  app.get('/api/auth/me', async (req, res) => {
    try {
      // 2026-05-09 cutover: Lucia is the only auth path now. Legacy JWT
      // cookies are intentionally NOT honoured anymore — existing
      // password users must re-verify with email-OTP on next visit.
      const luciaUserId = req.lucia?.user?.id;
      const userId = luciaUserId ? Number(luciaUserId) : NaN;

      if (!Number.isFinite(userId)) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated',
        });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Fetch user's car from the cars table
      let carPlate = '';
      try {
        const carResult = await db.execute(
          sql`SELECT license_plate FROM cars WHERE user_id = ${user.id} LIMIT 1`
        );
        if (carResult.rows && carResult.rows.length > 0) {
          carPlate = (carResult.rows[0] as any).license_plate || '';
        }
      } catch (err) {
        console.log('Could not fetch car info:', err);
      }

      res.json({
        success: true,
        user: { 
          ...user, 
          password: undefined,
          phone_number: user.phone_number,
          car_plate: carPlate,
          profile_data: {
            carPlate: carPlate,
            phone: user.phone_number
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get user data'
      });
    }
  });

  // /api/auth/verify-token removed in 2026-05-09 cutover (legacy JWT).

  // === Lucia v3 scaffold endpoints (Task 1.3) ===
  // These run side-by-side with the legacy JWT auth above. They are
  // wired so we can prove the Lucia stack works end-to-end without
  // touching production traffic. The legacy /api/auth/* endpoints stay
  // authoritative until the Week-2 migration.

  // GET /api/auth/whoami — read the cx_session cookie if present and
  // report what Lucia thinks about it. Always 200, never 401. Useful for
  // debugging cookie/session plumbing without taking a route hostage.
  app.get('/api/auth/whoami', (req, res) => {
    const lc = req.lucia ?? { user: null, session: null };
    if (!lc.user || !lc.session) {
      return res.json({ authenticated: false });
    }
    res.json({
      authenticated: true,
      user: {
        id: lc.user.id,
        email: (lc.user as any).email,
        firstName: (lc.user as any).firstName,
        lastName: (lc.user as any).lastName,
      },
      session: {
        id: lc.session.id,
        expiresAt: lc.session.expiresAt,
        fresh: lc.session.fresh,
      },
    });
  });

  // GET /api/dev/login-as?plate=...|email=...|id=...  — DEV-ONLY click-
  // through impersonation. Mints a Lucia session for the matched
  // customer and 302-redirects to /dashboard so you can browse the
  // app from the customer's point of view in one click. Returns 404
  // in production (same guard as /dev/last-otp).
  app.get(['/api/dev/login-as', '/login-as'], async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).send('Not found');
    }
    try {
      let userId: number | null = null;
      const idQ = String(req.query.id ?? '').trim();
      const emailQ = String(req.query.email ?? '').trim().toLowerCase();
      const plateQ = String(req.query.plate ?? '').trim();

      if (idQ && /^\d+$/.test(idQ)) {
        userId = Number(idQ);
      } else if (emailQ) {
        const r = (await db.execute(sql`
          SELECT id FROM users WHERE LOWER(email) = ${emailQ} LIMIT 1
        `)).rows[0] as { id: number } | undefined;
        userId = r?.id ?? null;
      } else if (plateQ) {
        const norm = plateQ.toUpperCase().replace(/\s+/g, '');
        const r = (await db.execute(sql`
          SELECT user_id FROM cars
           WHERE UPPER(REGEXP_REPLACE(license_plate, '\\s+', '', 'g')) = ${norm}
             AND user_id IS NOT NULL
           LIMIT 1
        `)).rows[0] as { user_id: number } | undefined;
        userId = r?.user_id ?? null;
      }

      if (!userId) {
        return res.status(404).type('text/html').send(
          `<pre>No user matched. Try ?plate=BBG2629 or ?email=foo@bar.com or ?id=546</pre>`
        );
      }

      const session = await lucia.createSession(String(userId), {});
      const cookie = lucia.createSessionCookie(session.id);
      res.appendHeader('Set-Cookie', cookie.serialize());
      const next = String(req.query.next ?? '/dashboard');
      res.redirect(next);
    } catch (err) {
      console.error('[dev/login-as] failed', err);
      res.status(500).type('text/html').send('<pre>dev impersonation failed</pre>');
    }
  });

  // POST /api/auth/lucia/dev-login — DEV-ONLY helper that mints a Lucia
  // session for an existing customer (by email). Lets us smoke-test the
  // adapter without wiring a full login flow yet. Disabled outside dev.
  app.post('/api/auth/lucia/dev-login', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Not found' });
    }
    const { email } = req.body ?? {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'email required' });
    }
    const rows = (await db.execute(
      sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`
    )).rows as Array<{ id: number }>;
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No customer with that email' });
    }
    const userId = String(rows[0].id);
    const session = await lucia.createSession(userId, {});
    const cookie = lucia.createSessionCookie(session.id);
    res.appendHeader('Set-Cookie', cookie.serialize());
    res.json({ ok: true, userId, sessionId: session.id });
  });

  // POST /api/auth/lucia/logout — invalidate the Lucia session and clear
  // the cookie. Independent of the legacy logout above.
  app.post('/api/auth/lucia/logout', requireLuciaUser, async (req, res) => {
    const sid = req.lucia!.session!.id;
    await lucia.invalidateSession(sid);
    const cookie = lucia.createBlankSessionCookie();
    res.appendHeader('Set-Cookie', cookie.serialize());
    res.json({ ok: true });
  });

  // === OTP endpoints (Task 1.4 — dev-mocked WhatsApp / email codes) ===
  // Same contract the Week-4 real WABA wrapper will satisfy. These do
  // NOT mint a session on success — that wiring lands in Week 2/4. For
  // now they are pure send/verify primitives the front-end can call.

  const otpSendSchema = z.object({
    identifier: z.string().min(1).max(200),
    purpose: z.enum(OTP_CONSTANTS.ALLOWED_PURPOSES),
  });
  const otpVerifySchema = otpSendSchema.extend({
    code: z.string().regex(/^\d{6}$/, "code must be 6 digits"),
  });

  app.post('/api/auth/otp/send', async (req, res) => {
    const parsed = otpSendSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, reason: 'invalid_request', errors: parsed.error.flatten() });
    }
    const ip = req.ip ?? null;
    const result = await sendOtp({ ...parsed.data, ip });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    res.json({
      ok: true,
      expiresAt: result.expiresAt,
      ttlSeconds: OTP_CONSTANTS.TTL_SECONDS,
    });
  });

  app.post('/api/auth/otp/verify', async (req, res) => {
    const parsed = otpVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, reason: 'invalid_request', errors: parsed.error.flatten() });
    }
    const ip = req.ip ?? null;
    const result = await verifyOtp({ ...parsed.data, ip });
    if (!result.ok) {
      // Reason-based status: rate-limit-ish failures are 429, the rest 400.
      const status = result.reason === 'too_many_attempts' ? 429 : 400;
      return res.status(status).json(result);
    }
    res.json({ ok: true });
  });

  // ===================================================================
  // Customer phone-OTP login (Phase 6B). Two-step:
  //   /login/start  → sendOtp(purpose='login') with phone as identifier
  //   /login/verify → verifyOtp + find-or-create (users, customers) +
  //                   mint Lucia cx_session cookie
  //
  // The legacy `users` table demands non-null email and password even
  // for phone-only customers. We synthesise both: an unguessable random
  // password (never used because OTP is the only path) and an email of
  // the form `phone-<digits>@cucixpress.local` (only displayed if the
  // user later hooks up Google or staff edits it). The customer never
  // sees these.
  // ===================================================================
  // Canonical Brunei phone form = bare digits, country-code prefixed.
  // Accepts: "+6738669378", " 673 8669378 ", "8669378", "(673) 866-9378"
  // Returns: "6738669378" (or "" if not a usable number).
  // Why bare digits (no '+'): 375 of 512 existing rows are bare-digits, so
  // we go with the dominant form. Without this, "+6738669378" and
  // "6738669378" hash to different OTP buckets and create duplicate
  // accounts on login.
  const normalisePhone = (s: string) => {
    const digits = (s ?? '').replace(/\D+/g, '');
    if (!digits) return '';
    // Local-format 7-digit Brunei number (e.g. "8669378") → prepend 673.
    if (digits.length === 7) return `673${digits}`;
    return digits;
  };
  const phoneStartSchema = z.object({ phone: z.string().min(7).max(20) });
  const phoneVerifySchema = z.object({
    phone: z.string().min(7).max(20),
    code: z.string().regex(/^\d{6}$/),
    name: z.string().min(1).max(100).optional(),
    // Phase 2 (2026-05-08): optional plate the customer claims is theirs.
    // We link/create a `cars` row pointing at this customer so their full
    // historical wash record (including pre-Lucia legacy SharePoint rows)
    // shows up under "My washes" on the dashboard.
    plate: z.string().min(1).max(20).optional(),
  });

  // GET /api/dev/last-otp?phone=...
  // DEV ONLY: returns the most recent mock OTP (read from /tmp/last_otp.json
  // which the otp module writes on every send). Returns 404 in production.
  // Lets you log in as a customer without a real WhatsApp delivery.
  app.get('/api/dev/last-otp', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ ok: false, reason: 'not_available' });
    }
    try {
      const fs = await import('node:fs/promises');
      const raw = await fs.readFile('/tmp/last_otp.json', 'utf8');
      const data = JSON.parse(raw) as { identifier: string; purpose: string; code: string; at: string };
      // Loose digits-only match so '+', spaces, and URL-decoded '+' all
      // resolve to the same number. Dev only — no security concern.
      const digits = (s: string) => s.replace(/\D+/g, '');
      const wanted = digits(String(req.query.phone ?? ''));
      if (wanted && digits(data.identifier) !== wanted) {
        return res.status(404).json({ ok: false, reason: 'no_match', last_identifier: data.identifier });
      }
      res.json({ ok: true, ...data });
    } catch (err) {
      res.status(404).json({ ok: false, reason: 'no_code_yet' });
    }
  });

  app.post('/api/auth/customer/login/start', async (req, res) => {
    const parsed = phoneStartSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, reason: 'invalid_request' });
    }
    const phone = normalisePhone(parsed.data.phone);
    if (!phone) {
      return res.status(400).json({ ok: false, reason: 'invalid_request' });
    }
    const result = await sendOtp({ identifier: phone, purpose: 'login', ip: req.ip ?? null });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    res.json({ ok: true, expiresAt: result.expiresAt, ttlSeconds: OTP_CONSTANTS.TTL_SECONDS });
  });

  app.post('/api/auth/customer/login/verify', async (req, res) => {
    const parsed = phoneVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, reason: 'invalid_request' });
    }
    const phone = normalisePhone(parsed.data.phone);
    if (!phone) {
      return res.status(400).json({ ok: false, reason: 'invalid_request' });
    }

    const verify = await verifyOtp({
      identifier: phone,
      purpose: 'login',
      code: parsed.data.code,
      ip: req.ip ?? null,
    });
    if (!verify.ok) {
      const status = verify.reason === 'too_many_attempts' ? 429 : 400;
      return res.status(status).json(verify);
    }

    try {
      // 1) Existing customer with linked user → just use it.
      const cust = (await db.execute(sql`
        SELECT id, user_id, name FROM customers WHERE phone = ${phone} LIMIT 1
      `)).rows[0] as { id: number; user_id: number | null; name: string } | undefined;

      let userId: number;
      if (cust && cust.user_id) {
        userId = cust.user_id;
      } else {
        // 2) An existing users row may already carry this phone (e.g. a
        // previous Google sign-in where the customer typed their phone).
        const userByPhone = (await db.execute(sql`
          SELECT id FROM users WHERE phone_number = ${phone} LIMIT 1
        `)).rows[0] as { id: number } | undefined;

        if (userByPhone) {
          userId = userByPhone.id;
        } else {
          // 3) Brand-new sign-up. Require a real name so new customers don't
          // land as the "Customer <last4>" placeholder. We only reach this
          // branch for genuinely new phone numbers (no linked user), so
          // returning customers are never asked. Enforced here — after OTP
          // verification — so it can't be used to enumerate which phones
          // already have an account.
          const isPlaceholderName = (n: string) =>
            n.length === 0 || /^customer\s*\d{2,4}$/i.test(n);
          const providedName = (parsed.data.name ?? '').trim();
          const existingName = (cust?.name ?? '').trim();
          if (providedName.length === 0 && isPlaceholderName(existingName)) {
            return res.status(400).json({ ok: false, reason: 'name_required' });
          }
          // Synthesise the legacy required fields.
          const fakeEmail = `phone-${phone}@cucixpress.local`;
          const fakePass = crypto.randomUUID() + crypto.randomUUID();
          const rawName = (parsed.data.name ?? cust?.name ?? `Customer ${phone.slice(-4)}`).trim();
          const [first, ...rest] = rawName.split(/\s+/);
          const last = rest.join(' ').trim() || ' ';
          const inserted = (await db.execute(sql`
            INSERT INTO users (first_name, last_name, email, password, phone_number)
            VALUES (${first || 'Customer'}, ${last}, ${fakeEmail}, ${fakePass}, ${phone})
            RETURNING id
          `)).rows[0] as { id: number };
          userId = inserted.id;
        }

        // Ensure a customers row exists and is linked.
        if (cust) {
          await db.execute(sql`UPDATE customers SET user_id = ${userId} WHERE id = ${cust.id}`);
        } else {
          const newName = (parsed.data.name ?? `Customer ${phone.slice(-4)}`).trim();
          await db.execute(sql`
            INSERT INTO customers (phone, name, user_id)
            VALUES (${phone}, ${newName}, ${userId})
            ON CONFLICT (phone) DO UPDATE SET user_id = EXCLUDED.user_id
          `);
        }
      }

      // Phase 2 (2026-05-08): if the customer typed a plate, link the
      // matching `cars` row to them (or create one) so legacy SharePoint
      // wash history shows up on their dashboard. The car's normalised
      // plate is unique, so we look it up via the same expression the
      // partial unique index uses, then either:
      //   - bind it to this user (preserving any existing brand/model);
      //   - or insert a fresh row owned by them.
      const rawPlate = (parsed.data.plate ?? '').trim();
      if (rawPlate) {
        const plateNorm = rawPlate.toUpperCase().replace(/\s+/g, '');
        if (plateNorm.length >= 2) {
          // The customers row that's linked to this user (we always have
          // one by now, either pre-existing or just created above).
          const linkedCust = (await db.execute(sql`
            SELECT id FROM customers WHERE user_id = ${userId} LIMIT 1
          `)).rows[0] as { id: number } | undefined;
          const custId = linkedCust?.id ?? null;

          const existing = (await db.execute(sql`
            SELECT id, customer_id, user_id FROM cars
             WHERE UPPER(REGEXP_REPLACE(license_plate, '\\s+', '', 'g')) = ${plateNorm}
             LIMIT 1
          `)).rows[0] as { id: number; customer_id: number | null; user_id: number | null } | undefined;

          if (existing) {
            // Only attach if no other customer owns this plate yet — refuse
            // to silently steal a car already linked to someone else.
            const ownedByOther =
              (existing.customer_id !== null && existing.customer_id !== custId) ||
              (existing.user_id !== null && existing.user_id !== userId);
            if (!ownedByOther) {
              await db.execute(sql`
                UPDATE cars
                   SET user_id     = COALESCE(user_id, ${userId}),
                       customer_id = COALESCE(customer_id, ${custId})
                 WHERE id = ${existing.id}
              `);
            }
          } else {
            await db.execute(sql`
              INSERT INTO cars (license_plate, user_id, customer_id)
              VALUES (${rawPlate}, ${userId}, ${custId})
            `);
          }
        }
      }

      const session = await lucia.createSession(String(userId), {});
      const cookie = lucia.createSessionCookie(session.id);
      res.appendHeader('Set-Cookie', cookie.serialize());
      res.json({ ok: true, userId });
    } catch (err) {
      console.error('[customer-login] failed', err);
      res.status(500).json({ ok: false, reason: 'server_error' });
    }
  });

  // ===================================================================
  // NEW (2026-05-09) — All-required register & email-or-phone signin.
  //
  // Spec:
  //   - Register requires phone + name + email + plate (all 4).
  //   - Phone, email, and plate are all uniqueness-checked. Plate
  //     conflict = block (CEO decision: refuse to silently steal /
  //     share another customer's vehicle).
  //   - Sign-in identifier is phone OR email; OTP always goes to the
  //     email on file so customers don't need WhatsApp wired yet.
  //   - 365-day Lucia session — once verified, the customer effectively
  //     never sees the OTP screen again on that device.
  // ===================================================================

  const isEmailLike = (s: string) => /@/.test(s);
  const normaliseEmail = (s: string) => s.trim().toLowerCase();
  const normalisePlate = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '');
  // Light email shape check; we don't try to be RFC-strict.
  const looksLikeValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

  /**
   * Minimal in-memory rate limiter for the customer auth endpoints.
   * Tracks hit counts per key inside a fixed time window. Entries are
   * evicted lazily on the next check after the window expires, so memory
   * stays bounded to the number of unique keys seen within one window.
   *
   * Not suitable as a cluster-wide solution, but sufficient for a single-
   * process server: each dyno enforces its own window independently.
   */
  const _rl = new Map<string, { count: number; windowStart: number }>();
  function checkRateLimit(key: string, maxHits: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = _rl.get(key);
    if (!entry || now - entry.windowStart >= windowMs) {
      _rl.set(key, { count: 1, windowStart: now });
      return true; // within limit
    }
    entry.count += 1;
    if (entry.count > maxHits) return false; // exceeded
    return true;
  }

  const registerSchema = z.object({
    phone: z.string().min(7).max(20),
    name: z.string().min(1).max(100),
    email: z.string().min(3).max(200),
    plate: z.string().min(2).max(20),
  });
  const registerVerifySchema = registerSchema.extend({
    code: z.string().regex(/^\d{6}$/),
  });
  const signinStartSchema = z.object({ identifier: z.string().min(3).max(200) });
  const signinVerifySchema = signinStartSchema.extend({
    code: z.string().regex(/^\d{6}$/),
  });

  /**
   * Run all three uniqueness checks and return a reason if any fails.
   * Pure read — no side effects. Race window is closed by the verify-step
   * inserts being inside a transaction with the same checks.
   */
  async function findRegistrationConflict(args: {
    phone: string;
    email: string;
    plateNorm: string;
  }): Promise<'phone_taken' | 'email_taken' | 'plate_taken' | null> {
    const phoneHit = (await db.execute(sql`
      SELECT 1 WHERE EXISTS (SELECT 1 FROM users     WHERE phone_number = ${args.phone})
                 OR EXISTS (SELECT 1 FROM customers WHERE phone        = ${args.phone})
    `)).rows;
    if (phoneHit.length > 0) return 'phone_taken';

    const emailHit = (await db.execute(sql`
      SELECT 1 FROM users WHERE LOWER(email) = ${args.email} LIMIT 1
    `)).rows;
    if (emailHit.length > 0) return 'email_taken';

    const plateHit = (await db.execute(sql`
      SELECT user_id, customer_id FROM cars
       WHERE UPPER(REGEXP_REPLACE(license_plate, '\\s+', '', 'g')) = ${args.plateNorm}
       LIMIT 1
    `)).rows[0] as { user_id: number | null; customer_id: number | null } | undefined;
    if (plateHit && (plateHit.user_id !== null || plateHit.customer_id !== null)) {
      return 'plate_taken';
    }
    return null;
  }

  // POST /api/auth/customer/register/start
  app.post('/api/auth/customer/register/start', async (req, res) => {
    const ip = req.ip ?? 'unknown';

    // Per-IP: max 10 OTP send attempts per 10 minutes.
    if (!checkRateLimit(`reg_start_ip:${ip}`, 10, 10 * 60 * 1000)) {
      return res.status(429).json({ ok: false, reason: 'too_many_requests' });
    }

    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, reason: 'invalid_request' });
    }
    const phone = normalisePhone(parsed.data.phone);
    const email = normaliseEmail(parsed.data.email);
    const plateNorm = normalisePlate(parsed.data.plate);
    if (!phone || !looksLikeValidEmail(email) || plateNorm.length < 2) {
      return res.status(400).json({ ok: false, reason: 'invalid_request' });
    }

    // Per-email: max 3 OTP sends per 15 minutes to avoid inbox flooding.
    if (!checkRateLimit(`reg_start_id:${email}`, 3, 15 * 60 * 1000)) {
      return res.status(429).json({ ok: false, reason: 'too_many_requests' });
    }

    const conflict = await findRegistrationConflict({ phone, email, plateNorm });

    // If any field is already taken, do NOT send an OTP and do NOT reveal
    // the conflict to the caller. Return the same 200-shaped response as a
    // real send so the endpoint is non-oracular: an attacker probing which
    // emails/phones/plates are registered gets an indistinguishable result.
    // The user will learn about the conflict at verify time (no_active_code),
    // which is only reached after submitting a 6-digit code and therefore
    // cannot be used for unauthenticated enumeration.
    if (conflict) {
      return res.json({ ok: true, expiresAt: null, ttlSeconds: OTP_CONSTANTS.TTL_SECONDS });
    }

    const result = await sendOtp({ identifier: email, purpose: 'verify_email', ip: req.ip ?? null });
    if (!result.ok) return res.status(400).json(result);
    res.json({ ok: true, expiresAt: result.expiresAt, ttlSeconds: OTP_CONSTANTS.TTL_SECONDS });
  });

  // POST /api/auth/customer/register/verify
  app.post('/api/auth/customer/register/verify', async (req, res) => {
    const parsed = registerVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, reason: 'invalid_request' });
    }
    const phone = normalisePhone(parsed.data.phone);
    const email = normaliseEmail(parsed.data.email);
    const plateNorm = normalisePlate(parsed.data.plate);
    const rawPlate = parsed.data.plate.trim();
    const name = parsed.data.name.trim();
    if (!phone || !looksLikeValidEmail(email) || plateNorm.length < 2 || !name) {
      return res.status(400).json({ ok: false, reason: 'invalid_request' });
    }

    // Re-check conflicts to close the race between /start and /verify.
    const conflict = await findRegistrationConflict({ phone, email, plateNorm });
    if (conflict) return res.status(409).json({ ok: false, reason: conflict });

    const verify = await verifyOtp({
      identifier: email,
      purpose: 'verify_email',
      code: parsed.data.code,
      ip: req.ip ?? null,
    });
    if (!verify.ok) {
      const status = verify.reason === 'too_many_attempts' ? 429 : 400;
      return res.status(status).json(verify);
    }

    try {
      const [first, ...rest] = name.split(/\s+/);
      const last = rest.join(' ').trim() || ' ';
      // No password is ever set / used; we synthesise a random one to
      // satisfy the legacy NOT NULL column. The OTP path is the only
      // way in.
      const fakePass = crypto.randomUUID() + crypto.randomUUID();

      const inserted = (await db.execute(sql`
        INSERT INTO users (first_name, last_name, email, password, phone_number)
        VALUES (${first || 'Customer'}, ${last}, ${email}, ${fakePass}, ${phone})
        RETURNING id
      `)).rows[0] as { id: number };
      const userId = inserted.id;

      await db.execute(sql`
        INSERT INTO customers (phone, name, user_id)
        VALUES (${phone}, ${name}, ${userId})
        ON CONFLICT (phone) DO UPDATE SET user_id = EXCLUDED.user_id, name = EXCLUDED.name
      `);
      const cust = (await db.execute(sql`
        SELECT id FROM customers WHERE user_id = ${userId} LIMIT 1
      `)).rows[0] as { id: number };

      // Plate handling: link an existing orphan row if there is one,
      // otherwise insert a fresh car. Conflict-with-other-owner is
      // already excluded by findRegistrationConflict() above.
      const existingCar = (await db.execute(sql`
        SELECT id FROM cars
         WHERE UPPER(REGEXP_REPLACE(license_plate, '\\s+', '', 'g')) = ${plateNorm}
         LIMIT 1
      `)).rows[0] as { id: number } | undefined;
      if (existingCar) {
        await db.execute(sql`
          UPDATE cars SET user_id = ${userId}, customer_id = ${cust.id}
           WHERE id = ${existingCar.id}
        `);
      } else {
        await db.execute(sql`
          INSERT INTO cars (license_plate, user_id, customer_id)
          VALUES (${rawPlate}, ${userId}, ${cust.id})
        `);
      }

      const session = await lucia.createSession(String(userId), {});
      const cookie = lucia.createSessionCookie(session.id);
      res.appendHeader('Set-Cookie', cookie.serialize());
      res.json({ ok: true, userId });
    } catch (err) {
      console.error('[customer-register] failed', err);
      res.status(500).json({ ok: false, reason: 'server_error' });
    }
  });

  /**
   * Look up a customer by either phone or email. Returns the user row
   * (with email always present) or null.
   */
  async function findCustomerByIdentifier(identifier: string): Promise<
    { id: number; email: string } | null
  > {
    if (isEmailLike(identifier)) {
      const email = normaliseEmail(identifier);
      const row = (await db.execute(sql`
        SELECT id, email FROM users WHERE LOWER(email) = ${email} LIMIT 1
      `)).rows[0] as { id: number; email: string } | undefined;
      return row ?? null;
    }
    const phone = normalisePhone(identifier);
    if (!phone) return null;
    // Prefer users.phone_number; fall back to customers.phone → users.id link.
    const direct = (await db.execute(sql`
      SELECT id, email FROM users WHERE phone_number = ${phone} LIMIT 1
    `)).rows[0] as { id: number; email: string } | undefined;
    if (direct) return direct;
    const linked = (await db.execute(sql`
      SELECT u.id, u.email
        FROM customers c
        JOIN users u ON u.id = c.user_id
       WHERE c.phone = ${phone}
       LIMIT 1
    `)).rows[0] as { id: number; email: string } | undefined;
    return linked ?? null;
  }

  /** "alex@example.com" → "a***@example.com" (cheap PII hint). */
  function maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!local || !domain) return email;
    const head = local.slice(0, 1);
    return `${head}${'*'.repeat(Math.max(1, local.length - 1))}@${domain}`;
  }

  // POST /api/auth/customer/signin/start
  app.post('/api/auth/customer/signin/start', async (req, res) => {
    const ip = req.ip ?? 'unknown';

    // Per-IP: max 10 OTP send attempts per 10 minutes.
    if (!checkRateLimit(`signin_start_ip:${ip}`, 10, 10 * 60 * 1000)) {
      return res.status(429).json({ ok: false, reason: 'too_many_requests' });
    }

    const parsed = signinStartSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, reason: 'invalid_request' });
    }

    const normIdentifier = parsed.data.identifier.trim().toLowerCase();

    // Per-identifier: max 3 OTP sends per 15 minutes to prevent inbox flooding.
    if (!checkRateLimit(`signin_start_id:${normIdentifier}`, 3, 15 * 60 * 1000)) {
      return res.status(429).json({ ok: false, reason: 'too_many_requests' });
    }

    const user = await findCustomerByIdentifier(parsed.data.identifier);

    // Always return 200 regardless of whether the identifier matches an
    // account. Returning a distinct 404/reason for unknown identifiers
    // allows unauthenticated callers to enumerate which emails, phone
    // numbers, and plates are registered. The UI should show a generic
    // "if your account exists, an OTP was sent" message.
    if (!user) {
      return res.json({ ok: true, expiresAt: null, ttlSeconds: OTP_CONSTANTS.TTL_SECONDS });
    }

    const result = await sendOtp({
      identifier: user.email.toLowerCase(),
      purpose: 'login',
      ip: req.ip ?? null,
    });
    if (!result.ok) return res.status(400).json(result);
    res.json({
      ok: true,
      expiresAt: result.expiresAt,
      ttlSeconds: OTP_CONSTANTS.TTL_SECONDS,
    });
  });

  // POST /api/auth/customer/signin/verify
  app.post('/api/auth/customer/signin/verify', async (req, res) => {
    const parsed = signinVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, reason: 'invalid_request' });
    }
    const user = await findCustomerByIdentifier(parsed.data.identifier);
    if (!user) return res.status(404).json({ ok: false, reason: 'no_account' });

    const verify = await verifyOtp({
      identifier: user.email.toLowerCase(),
      purpose: 'login',
      code: parsed.data.code,
      ip: req.ip ?? null,
    });
    if (!verify.ok) {
      const status = verify.reason === 'too_many_attempts' ? 429 : 400;
      return res.status(status).json(verify);
    }

    try {
      const session = await lucia.createSession(String(user.id), {});
      const cookie = lucia.createSessionCookie(session.id);
      res.appendHeader('Set-Cookie', cookie.serialize());
      res.json({ ok: true, userId: user.id });
    } catch (err) {
      console.error('[customer-signin] failed', err);
      res.status(500).json({ ok: false, reason: 'server_error' });
    }
  });

  // NOTE: The public plate-suggest endpoint has been removed.
  // Returning raw stored license plates to unauthenticated callers
  // constitutes an unauthorized disclosure of customer vehicle data —
  // prefix throttling and minimum-length requirements only slow
  // harvesting, they do not prevent it. Customers are expected to
  // type their own plate directly; there is no autocomplete.

  // ---- Customer dashboard endpoints (Lucia-protected) ---------------
  app.get('/api/customer/me', requireLuciaUser, async (req, res) => {
    const userId = Number(req.lucia!.user!.id);
    const profile = (await db.execute(sql`
      SELECT u.id, u.first_name, u.last_name, u.phone_number, u.email,
             c.id AS customer_id, c.name AS customer_name, c.phone AS customer_phone
      FROM users u
      LEFT JOIN customers c ON c.user_id = u.id
      WHERE u.id = ${userId}
      LIMIT 1
    `)).rows[0] as any;
    if (!profile) return res.status(404).json({ error: 'not_found' });

    const stats = (await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM orders
           WHERE customer_id = ${userId} AND status = 'done') AS total_done,
        (SELECT COALESCE(SUM(total_cents),0)::int FROM orders
           WHERE customer_id = ${userId} AND status IN ('done','paid','washing','queued')) AS total_spent_cents,
        (SELECT COALESCE(SUM(remaining_washes),0)::int FROM memberships m
           JOIN customers cu ON cu.id = m.customer_id
           WHERE cu.user_id = ${userId} AND m.status = 'active') AS remaining_washes,
        (SELECT COUNT(*)::int FROM orders
           WHERE customer_id = ${userId}
             AND status = 'done'
             AND date_trunc('month', created_at AT TIME ZONE 'Asia/Brunei')
                 = date_trunc('month', (now() AT TIME ZONE 'Asia/Brunei'))) AS washes_this_month,
        (SELECT COUNT(*)::int FROM orders
           WHERE customer_id = ${userId}
             AND status = 'done'
             AND date_trunc('month', created_at AT TIME ZONE 'Asia/Brunei')
                 = date_trunc('month', (now() AT TIME ZONE 'Asia/Brunei') - interval '1 month')) AS washes_last_month,
        (SELECT MIN(created_at) FROM orders
           WHERE customer_id = ${userId}) AS member_since,
        (SELECT COALESCE(SUM(price_cents),0)::int FROM memberships m
           JOIN customers cu ON cu.id = m.customer_id
           WHERE cu.user_id = ${userId} AND m.status = 'active') AS active_membership_cost_cents
    `)).rows[0] as any;

    const totalDone = Number(stats.total_done ?? 0);
    const washesThisMonth = Number(stats.washes_this_month ?? 0);
    const activeMembershipCost = Number(stats.active_membership_cost_cents ?? 0);
    const BASELINE_WASH_CENTS = 1500; // BND 15 — pay-as-you-go average across packages
    const grossThisCycle = washesThisMonth * BASELINE_WASH_CENTS;
    const savedThisCycle =
      activeMembershipCost > 0 ? Math.max(0, grossThisCycle - activeMembershipCost) : 0;

    res.json({
      profile,
      stats: {
        total_done: totalDone,
        total_spent_cents: Number(stats.total_spent_cents ?? 0),
        remaining_washes: Number(stats.remaining_washes ?? 0),
        washes_this_month: washesThisMonth,
        washes_last_month: Number(stats.washes_last_month ?? 0),
        member_since: stats.member_since ?? null,
        loyalty_points: totalDone * 20,
        saved_this_cycle_cents: savedThisCycle,
      },
    });
  });

  // POST /api/customer/me/change/start — send a one-time code to the
  // customer's CURRENT (on-record) email to authorise a profile change.
  // Every profile edit (name, email, or phone) must be confirmed with this
  // code, proving the account owner — not a hijacked session — made it.
  // The code always goes to the existing email, even when the email itself
  // is the field being changed.
  app.post('/api/customer/me/change/start', requireLuciaUser, async (req, res) => {
    const userId = Number(req.lucia!.user!.id);
    const ip = req.ip ?? 'unknown';
    // Per-user: max 3 sends / 15 min. Per-IP: max 10 sends / 10 min.
    if (!checkRateLimit(`profile_change_user:${userId}`, 3, 15 * 60 * 1000)) {
      return res.status(429).json({ ok: false, reason: 'too_many_requests' });
    }
    if (!checkRateLimit(`profile_change_ip:${ip}`, 10, 10 * 60 * 1000)) {
      return res.status(429).json({ ok: false, reason: 'too_many_requests' });
    }
    const row = (await db.execute(sql`
      SELECT email FROM users WHERE id = ${userId} LIMIT 1
    `)).rows[0] as { email: string } | undefined;
    if (!row?.email) return res.status(404).json({ ok: false, reason: 'not_found' });
    const email = normaliseEmail(row.email);
    const result = await sendOtp({ identifier: email, purpose: 'profile_update', ip });
    if (!result.ok) return res.status(400).json(result);
    res.json({
      ok: true,
      expiresAt: result.expiresAt,
      ttlSeconds: OTP_CONSTANTS.TTL_SECONDS,
      email_hint: maskEmail(email),
    });
  });

  // PATCH /api/customer/me — update the signed-in customer's profile
  // (name, email, phone). Requires a valid `code` from /change/start, which
  // is verified against the customer's CURRENT email. Mirrors the response
  // shape of GET /api/customer/me so the cache update on the client slots in.
  const updateCustomerProfileSchema = z.object({
    first_name: z.string().trim().min(1, 'First name is required').max(80),
    last_name: z.string().trim().min(1, 'Last name is required').max(80),
    email: z.string().trim().toLowerCase().email('Enter a valid email').max(160),
    phone_number: z
      .string()
      .trim()
      .max(40, 'Phone number is too long')
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  });

  app.patch('/api/customer/me', requireLuciaUser, async (req, res) => {
    const parsed = updateCustomerProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_request',
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const userId = Number(req.lucia!.user!.id);

    // Verify the one-time code against the customer's CURRENT email before
    // applying any change. This is the authorisation gate for the edit.
    const currentRow = (await db.execute(sql`
      SELECT email FROM users WHERE id = ${userId} LIMIT 1
    `)).rows[0] as { email: string } | undefined;
    if (!currentRow?.email) return res.status(404).json({ error: 'not_found' });
    const verify = await verifyOtp({
      identifier: normaliseEmail(currentRow.email),
      purpose: 'profile_update',
      code: parsed.data.code,
      ip: req.ip ?? null,
    });
    if (!verify.ok) {
      const status = verify.reason === 'too_many_attempts' ? 429 : 400;
      return res.status(status).json({ error: 'otp_failed', ...verify });
    }
    // Normalise the phone the same way the sign-in flow does so phone-based
    // login resolution stays deterministic (digits only, 7-digit local →
    // +673). Junk that normalises to empty is stored as NULL.
    const rawPhone = parsed.data.phone_number ?? null;
    const normPhone = rawPhone ? normalisePhone(rawPhone) : '';
    const phoneNumber = normPhone.length > 0 ? normPhone : null;
    let updated;
    try {
      updated = await storage.updateCustomerProfile(userId, {
        firstName: parsed.data.first_name,
        lastName: parsed.data.last_name,
        email: parsed.data.email,
        phoneNumber,
      });
    } catch (err: any) {
      // A phone already attached to a DIFFERENT account: users.phone_number is
      // not DB-unique and phone is a login identifier, so a collision would
      // make phone sign-in ambiguous / enable account confusion. Reject it.
      if (err?.phoneConflict) {
        return res.status(409).json({ error: 'conflict', field: 'phone' });
      }
      // 23505 = unique_violation. The login email and the customer phone are
      // both unique; surface a friendly per-field conflict instead of a 500.
      if (err?.code === '23505') {
        const constraint = String(err?.constraint ?? '').toLowerCase();
        const field = constraint.includes('email')
          ? 'email'
          : constraint.includes('phone')
            ? 'phone'
            : 'value';
        return res.status(409).json({ error: 'conflict', field });
      }
      console.error('[customer/me PATCH] failed', err);
      return res.status(500).json({ error: 'server_error' });
    }
    if (!updated) return res.status(404).json({ error: 'not_found' });

    const profile = (await db.execute(sql`
      SELECT u.id, u.first_name, u.last_name, u.phone_number, u.email,
             c.id AS customer_id, c.name AS customer_name, c.phone AS customer_phone
      FROM users u
      LEFT JOIN customers c ON c.user_id = u.id
      WHERE u.id = ${userId}
      LIMIT 1
    `)).rows[0];
    res.json({ profile });
  });

  app.get('/api/customer/orders', requireLuciaUser, async (req, res) => {
    const userId = Number(req.lucia!.user!.id);
    // Show wash history matched any of three ways:
    //   1. order.customer_id = userId  (POS-linked walk-in or self-pay)
    //   2. order.vehicle_id  ∈ cars owned by this user  (saved-car link)
    //   3. order.plate       ∈ plates of cars owned by this user
    //      (catches pre-Lucia legacy SharePoint orders that were imported
    //      before the customer linked their plate at login).
    // De-dup by id so a row matched two ways shows up once.
    const rows = (await db.execute(sql`
      WITH my_cars AS (
        SELECT c.id,
               UPPER(REGEXP_REPLACE(c.license_plate, '\\s+', '', 'g')) AS plate_norm
          FROM cars c
         WHERE c.user_id = ${userId}
            OR c.customer_id = (SELECT id FROM customers WHERE user_id = ${userId} LIMIT 1)
      )
      SELECT DISTINCT ON (o.id)
             o.id, o.branch_id, b.name AS branch_name, o.plate, o.package_name,
             o.package_price_cents, o.addons, o.subtotal_cents, o.discount_cents,
             o.promo_discount_cents, o.total_cents, o.paid_amount_cents,
             o.change_cents, o.item_notes, o.ticket_code, o.payment_method,
             CASE WHEN o.payment_method = 'qr_code' THEN o.qr_provider ELSE NULL END AS qr_provider,
             CASE WHEN o.qr_provider = 'pocket_pay' THEN o.payment_ref ELSE NULL END AS payment_ref,
             s.name AS cashier_name,
             o.status, o.created_at, o.completed_at
      FROM orders o
      LEFT JOIN branches b ON b.id = o.branch_id
      LEFT JOIN staff s ON s.id = o.staff_id
      WHERE o.customer_id = ${userId}
         OR o.vehicle_id IN (SELECT id FROM my_cars)
         OR UPPER(REGEXP_REPLACE(o.plate, '\\s+', '', 'g'))
              IN (SELECT plate_norm FROM my_cars)
      ORDER BY o.id, o.created_at DESC
    `)).rows;
    // The DISTINCT ON forces a primary sort by id; resort by date for
    // the response so newest washes are first.
    rows.sort((a: any, b: any) =>
      String(b.created_at).localeCompare(String(a.created_at)),
    );
    res.json({ orders: rows.slice(0, 200) });
  });

  app.get('/api/customer/memberships', requireLuciaUser, async (req, res) => {
    const userId = Number(req.lucia!.user!.id);
    const rows = (await db.execute(sql`
      SELECT m.id, m.kind, m.total_washes, m.remaining_washes, m.status, m.expires_at,
             m.created_at, m.price_cents, b.name AS sold_at_branch_name,
             m.vehicle_id, ca.license_plate AS vehicle_plate
      FROM memberships m
      JOIN customers c ON c.id = m.customer_id
      LEFT JOIN branches b ON b.id = m.sold_at_branch_id
      LEFT JOIN cars ca ON ca.id = m.vehicle_id
      WHERE c.user_id = ${userId}
      ORDER BY m.created_at DESC
    `)).rows;
    res.json({ memberships: rows });
  });

  app.get('/api/customer/cars', requireLuciaUser, async (req, res) => {
    const userId = Number(req.lucia!.user!.id);
    // Per-car total wash count uses a left join + group by on plate so a
    // brand-new car (no orders yet) still shows up with total_washes=0.
    const rows = (await db.execute(sql`
      SELECT c.id, c.license_plate, c.brand, c.model, c.color, c.photo_url, c.last_seen_at,
             COALESCE(o.total_washes, 0)::int AS total_washes
      FROM cars c
      LEFT JOIN (
        SELECT plate, COUNT(*)::int AS total_washes
        FROM orders
        WHERE customer_id = ${userId} AND status = 'done'
        GROUP BY plate
      ) o ON o.plate = c.license_plate
      WHERE c.user_id = ${userId}
         OR c.customer_id = (SELECT id FROM customers WHERE user_id = ${userId} LIMIT 1)
      ORDER BY c.last_seen_at DESC NULLS LAST, c.id DESC
    `)).rows;
    res.json({ cars: rows });
  });

  // GET /api/customer/leaderboard — lifetime-wash leaderboard windowed
  // around the signed-in customer (10 above + me + 10 below). Ranking
  // mirrors the same matching logic /api/customer/orders uses (orders
  // can be linked by customer_id, vehicle_id, or normalized plate) so
  // the rank a customer sees here lines up with the wash count on their
  // own dashboard. Plates are intentionally NOT censored — the owner is
  // happy to show them; only the surname is shortened to a single
  // initial as a gentle privacy nod.
  app.get('/api/customer/leaderboard', requireLuciaUser, async (req, res) => {
    const userId = Number(req.lucia!.user!.id);
    try {
      const rows = (await db.execute(sql`
        -- Exclude staff/admin users (is_admin = true). Each branch has a
        -- placeholder admin account (e.g. "Tutong Branch Admin") that the
        -- POS attaches walk-in cars to, which would otherwise sweep up
        -- every walk-in wash at that branch into one fake leaderboard row.
        WITH user_plates AS (
          SELECT u.id AS user_id,
                 ca.id AS car_id,
                 UPPER(REGEXP_REPLACE(ca.license_plate, '\\s+', '', 'g')) AS plate_norm
            FROM users u
            LEFT JOIN customers cu ON cu.user_id = u.id
            LEFT JOIN cars ca
                   ON ca.user_id = u.id
                   OR ca.customer_id = cu.id
           WHERE COALESCE(u.is_admin, false) = false
        ),
        user_orders AS (
          SELECT DISTINCT up.user_id, o.id AS order_id
            FROM user_plates up
            JOIN orders o
              ON o.status = 'done'
             AND (
                  o.customer_id = up.user_id
               OR (up.car_id IS NOT NULL AND o.vehicle_id = up.car_id)
               OR (up.plate_norm IS NOT NULL
                   AND UPPER(REGEXP_REPLACE(o.plate, '\\s+', '', 'g')) = up.plate_norm)
             )
        ),
        counts AS (
          SELECT u.id AS user_id,
                 u.first_name,
                 u.last_name,
                 COUNT(uo.order_id)::int AS total_washes
            FROM users u
            LEFT JOIN user_orders uo ON uo.user_id = u.id
           WHERE COALESCE(u.is_admin, false) = false
           GROUP BY u.id
        ),
        top_plate AS (
          SELECT u.id AS user_id,
                 (SELECT ca.license_plate
                    FROM cars ca
                    LEFT JOIN customers cu ON cu.id = ca.customer_id
                   WHERE ca.user_id = u.id OR cu.user_id = u.id
                   ORDER BY ca.last_seen_at DESC NULLS LAST, ca.id DESC
                   LIMIT 1) AS plate
            FROM users u
           WHERE COALESCE(u.is_admin, false) = false
        ),
        ranked AS (
          SELECT c.user_id,
                 c.first_name,
                 c.last_name,
                 c.total_washes,
                 tp.plate,
                 RANK() OVER (ORDER BY c.total_washes DESC, c.user_id ASC) AS rank
            FROM counts c
            LEFT JOIN top_plate tp ON tp.user_id = c.user_id
           WHERE c.total_washes > 0
        ),
        me AS (
          SELECT rank FROM ranked WHERE user_id = ${userId}
        ),
        bounds AS (
          SELECT
            CASE WHEN (SELECT rank FROM me) IS NULL
                 THEN 1
                 ELSE GREATEST(1, (SELECT rank FROM me) - 10)
            END AS lo,
            CASE WHEN (SELECT rank FROM me) IS NULL
                 THEN 21
                 ELSE (SELECT rank FROM me) + 10
            END AS hi
        )
        SELECT r.user_id,
               r.first_name,
               r.last_name,
               r.total_washes,
               r.plate,
               r.rank::int AS rank,
               (r.user_id = ${userId}) AS is_me,
               (SELECT COUNT(*)::int FROM ranked) AS total_ranked
          FROM ranked r, bounds b
         WHERE r.rank BETWEEN b.lo AND b.hi
         ORDER BY r.rank
      `)).rows as Array<{
        user_id: number;
        first_name: string | null;
        last_name: string | null;
        total_washes: number;
        plate: string | null;
        rank: number;
        is_me: boolean;
        total_ranked: number;
      }>;

      const totalRanked = rows[0]?.total_ranked ?? 0;
      const myRow = rows.find((r) => r.is_me);
      res.json({
        total_ranked: totalRanked,
        my_rank: myRow?.rank ?? null,
        my_washes: myRow?.total_washes ?? 0,
        entries: rows.map((r) => ({
          rank: r.rank,
          first_name: r.first_name ?? '',
          last_name: r.last_name ?? '',
          plate: r.plate,
          total_washes: r.total_washes,
          is_me: r.is_me,
        })),
      });
    } catch (err) {
      console.error('[customer/leaderboard] failed', err);
      res.status(500).json({ entries: [], total_ranked: 0, my_rank: null, my_washes: 0 });
    }
  });

  // GET /api/branches/active — public list of active branches for
  // customer-facing pickers (loyalty redeem modal, etc).
  app.get('/api/branches/active', async (_req, res) => {
    try {
      const rows = (await db.execute(sql`
        SELECT id, name, location FROM branches ORDER BY name
      `)).rows;
      res.json({ branches: rows });
    } catch {
      res.status(500).json({ branches: [] });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Phase 12f — Loyalty punch card.
  // Promo: collect 4 paid receipts of the B$12 package
  // (`pkg_basic_tyre_wax`) → redeem 1 free B$12 wash.
  //
  // Eligibility rules (locked with the owner):
  //   1. Only `pkg_basic_tyre_wax` counts (price = B$12).
  //   2. Wash-pack / unlimited redemptions don't count (the customer
  //      didn't pay B$12 for that wash). Detected via the
  //      `membership_redemptions` table.
  //   3. Free voucher washes don't count themselves.
  //      (payment_method='voucher' AND qr_provider='loyalty').
  //   4. No expiry. A receipt counts forever until consumed.
  //   5. Voided / refunded / pending_payment orders never count.
  // ─────────────────────────────────────────────────────────────
  const LOYALTY_PKG_ID         = 'pkg_basic_tyre_wax';
  const LOYALTY_REQUIRED_COUNT = 4;
  // Loyalty collection restarted at the POS cutover: 2026-06-14 Brunei time
  // (UTC+8) = 2026-06-13T16:00:00Z. Only paid qualifying washes created on/after
  // this instant earn AUTO stamps; all historical + imported washes before it no
  // longer count (this is how "clear everyone's stamps, start today" is enforced
  // without deleting order history). Physical receipts from before the cutover
  // are still creditable via the OWNER manual-stamp tool, which is intentionally
  // NOT date-filtered — see /api/pos/loyalty/stamp and the `manual` CTEs below.
  const LOYALTY_COLLECTION_START = '2026-06-13T16:00:00Z';
  // Snapshot name written onto the redeemed voucher ORDER row (order
  // summary / receipt / reports). package_id stays LOYALTY_PKG_ID so
  // eligibility counting + report linking are unaffected; only the
  // human-readable label changes so a redeemed wash reads as the reward,
  // not the paid package it was earned from.
  const LOYALTY_VOUCHER_NAME   = '5th Free Wash';

  // Per-plate loyalty (2026-05-25): stamps + voucher belong to a CAR,
  // not to the customer account, because the POS only captures the plate
  // (not phone/email). When a customer claims a plate in their garage we
  // surface that plate's historical stamps. Match is by vehicle_id OR
  // normalised plate so older orders that have a plate string but no
  // vehicle_id FK still count.
  app.get('/api/customer/loyalty', requireLuciaUser, async (req, res) => {
    const userId = Number(req.lucia!.user!.id);
    try {
      const rows = (await db.execute(sql`
        WITH owned_cars AS (
          SELECT c.id, c.license_plate, c.brand, c.model,
                 REGEXP_REPLACE(UPPER(c.license_plate), '\s+', '', 'g') AS plate_norm
            FROM cars c
           WHERE c.user_id = ${userId}
              OR c.customer_id = (SELECT id FROM customers WHERE user_id = ${userId} LIMIT 1)
        ),
        -- Attribution: each order maps to AT MOST ONE car. Prefer the
        -- vehicle_id FK when set; only fall back to plate-normalised
        -- match when vehicle_id IS NULL. cars_plate_normalized_unique
        -- guarantees the plate fallback resolves to a single car too.
        -- Without this rule a plate reassignment would let one order
        -- double-count across two cards.
        eligible AS (
          SELECT c.id AS vehicle_id, COUNT(*)::int AS stamps
            FROM owned_cars c
            JOIN orders o
              ON (o.vehicle_id = c.id
                  OR (o.vehicle_id IS NULL
                      AND REGEXP_REPLACE(UPPER(o.plate), '\s+', '', 'g') = c.plate_norm))
           WHERE o.package_id           = ${LOYALTY_PKG_ID}
             AND o.loyalty_consumed_in IS NULL
             AND o.status               IN ('paid','queued','washing','done')
             AND NOT (o.payment_method  = 'voucher' AND o.qr_provider = 'loyalty')
             AND o.id NOT IN (SELECT order_id FROM membership_redemptions)
             AND o.created_at           >= ${LOYALTY_COLLECTION_START}
           GROUP BY c.id
        ),
        -- Cashier-credited stamps (digital-receipt migration backstop). Same
        -- attribution: vehicle_id FK wins, plate fallback only when null.
        manual AS (
          SELECT c.id AS vehicle_id, COALESCE(SUM(m.stamps_remaining), 0)::int AS mstamps
            FROM owned_cars c
            JOIN loyalty_manual_stamps m
              ON (m.vehicle_id = c.id
                  OR (m.vehicle_id IS NULL AND m.plate_norm = c.plate_norm))
           WHERE m.stamps_remaining > 0
           GROUP BY c.id
        ),
        pending AS (
          SELECT DISTINCT ON (c.id)
                 c.id AS vehicle_id,
                 o.id AS order_id, o.payment_ref, o.created_at, o.plate,
                 b.name AS branch_name
            FROM owned_cars c
            JOIN orders o
              ON (o.vehicle_id = c.id
                  OR (o.vehicle_id IS NULL
                      AND REGEXP_REPLACE(UPPER(o.plate), '\s+', '', 'g') = c.plate_norm))
            LEFT JOIN branches b ON b.id = o.branch_id
           WHERE o.qr_provider  = 'loyalty'
             AND o.status       = 'paid'
             AND o.ticket_code IS NULL
           ORDER BY c.id, o.created_at DESC
        )
        SELECT c.id            AS vehicle_id,
               c.license_plate AS plate,
               c.brand, c.model,
               (COALESCE(e.stamps, 0) + COALESCE(mn.mstamps, 0)) AS stamps,
               p.order_id, p.payment_ref, p.created_at AS pending_created_at,
               p.plate AS pending_plate, p.branch_name AS pending_branch
          FROM owned_cars c
          LEFT JOIN eligible e ON e.vehicle_id = c.id
          LEFT JOIN manual   mn ON mn.vehicle_id = c.id
          LEFT JOIN pending  p ON p.vehicle_id = c.id
         ORDER BY (COALESCE(e.stamps, 0) + COALESCE(mn.mstamps, 0)) DESC, c.id ASC
      `)).rows as Array<any>;

      const cards = rows.map((r) => {
        const stamps = Number(r.stamps ?? 0);
        return {
          vehicle_id: Number(r.vehicle_id),
          plate: r.plate as string,
          brand: r.brand as string | null,
          model: r.model as string | null,
          stamps: Math.min(stamps, LOYALTY_REQUIRED_COUNT),
          raw_stamps: stamps, // for "X over the line" display if ever needed
          can_redeem: stamps >= LOYALTY_REQUIRED_COUNT,
          pending_voucher: r.order_id
            ? {
                order_id: r.order_id as string,
                payment_ref: r.payment_ref as string,
                created_at: r.pending_created_at as string,
                plate: r.pending_plate as string,
                branch_name: r.pending_branch as string | null,
                qr_payload: JSON.stringify({
                  type: 'CUCI_XPRESS_PAYMENT',
                  order_id: r.payment_ref,
                }),
              }
            : null,
        };
      });

      res.json({
        package_id: LOYALTY_PKG_ID,
        // Qualifying package the customer must buy to earn stamps.
        package_name: 'Basic Wash + Tyre Shine + Spray Wax',
        // Label of the free wash they redeem — matches the voucher order row.
        reward_name: LOYALTY_VOUCHER_NAME,
        required: LOYALTY_REQUIRED_COUNT,
        cards,
      });
    } catch (err) {
      console.error('[customer.loyalty] failed:', err);
      res.status(500).json({ error: 'load_failed' });
    }
  });

  // POST /api/customer/loyalty/redeem
  // Body: { plate: string }
  // Atomically: (a) re-checks eligible count under FOR UPDATE,
  // (b) creates a B$0 branchless voucher order for the plate,
  // (c) writes the loyalty_redemption row, (d) marks the 4 oldest
  // eligible orders consumed. Returns the QR payload the dashboard
  // renders for the customer to show at the lane.
  //
  // Branch-at-scan model (2026-05-06_01): voucher is created without
  // a branch — the branch is stamped on by /api/verify-qr when the
  // cashier scans the QR at any lane.
  const redeemSchema = z.object({
    plate: z.string().trim().min(1).max(20),
  });
  app.post('/api/customer/loyalty/redeem', requireLuciaUser, async (req, res) => {
    const parsed = redeemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
    const userId = Number(req.lucia!.user!.id);
    const plate = parsed.data.plate.toUpperCase().replace(/\s+/g, ' ').trim();

    try {
      const out = await db.transaction(async (tx) => {
        // 1. Resolve the plate to a car THIS user owns + LOCK that car
        //    row for the duration of the tx. Two parallel redeems against
        //    the same plate will serialize here, so only the first can
        //    pass the "no pending voucher" check below.
        const car = (await tx.execute(sql`
          SELECT id, license_plate FROM cars
           WHERE REGEXP_REPLACE(UPPER(license_plate), '\s+', '', 'g')
               = REGEXP_REPLACE(UPPER(${plate}), '\s+', '', 'g')
             AND (user_id = ${userId}
                  OR customer_id = (SELECT id FROM customers WHERE user_id = ${userId} LIMIT 1))
           LIMIT 1
           FOR UPDATE
        `)).rows[0] as { id: number; license_plate: string } | undefined;
        if (!car) {
          return { http: 404, body: { error: 'plate_not_in_garage' } };
        }
        const vehicleId = car.id;
        const carPlate  = car.license_plate;

        // 2. One pending voucher per CAR (was per customer). A multi-plate
        //    customer can have one voucher pending per plate concurrently.
        const existing = (await tx.execute(sql`
          SELECT id FROM orders
           WHERE vehicle_id  = ${vehicleId}
             AND qr_provider = 'loyalty'
             AND status      = 'paid'
             AND ticket_code IS NULL
           LIMIT 1
        `)).rows[0] as any;
        if (existing) {
          return { http: 409, body: { error: 'voucher_pending', voucher_order_id: existing.id } };
        }

        const pkg = (await tx.execute(sql`
          SELECT id, name, price_cents FROM packages WHERE id = ${LOYALTY_PKG_ID} LIMIT 1
        `)).rows[0] as any;
        if (!pkg) return { http: 500, body: { error: 'package_missing' } };

        // 3. Lock + recount eligible orders FOR THIS CAR. Same
        //    attribution rule as the GET: vehicle_id FK wins; plate
        //    fallback only when vehicle_id IS NULL. Keeps stamps
        //    deterministic when the same plate string appears across
        //    historical and current vehicle_id rows.
        const eligibleRows = (await tx.execute(sql`
          SELECT id FROM orders
           WHERE (vehicle_id = ${vehicleId}
                  OR (vehicle_id IS NULL
                      AND REGEXP_REPLACE(UPPER(plate), '\s+', '', 'g')
                        = REGEXP_REPLACE(UPPER(${carPlate}), '\s+', '', 'g')))
             AND package_id           = ${LOYALTY_PKG_ID}
             AND loyalty_consumed_in IS NULL
             AND status               IN ('paid','queued','washing','done')
             AND NOT (payment_method  = 'voucher' AND qr_provider = 'loyalty')
             AND id NOT IN (SELECT order_id FROM membership_redemptions)
             AND created_at           >= ${LOYALTY_COLLECTION_START}
           ORDER BY created_at ASC
           LIMIT ${LOYALTY_REQUIRED_COUNT}
           FOR UPDATE
        `)).rows as Array<{ id: string }>;

        // Cashier-credited manual stamps for this car (digital-receipt
        // migration backstop). Locked + oldest-first so concurrent redeems
        // serialize and we always burn the earliest credits.
        const plateNorm = carPlate.toUpperCase().replace(/\s+/g, '');
        const manualRows = (await tx.execute(sql`
          SELECT id, stamps_remaining FROM loyalty_manual_stamps
           WHERE stamps_remaining > 0
             AND (vehicle_id = ${vehicleId}
                  OR (vehicle_id IS NULL AND plate_norm = ${plateNorm}))
           ORDER BY created_at ASC
           FOR UPDATE
        `)).rows as Array<{ id: string; stamps_remaining: number }>;
        const manualAvailable = manualRows.reduce((s, r) => s + Number(r.stamps_remaining), 0);

        const totalAvailable = eligibleRows.length + manualAvailable;
        if (totalAvailable < LOYALTY_REQUIRED_COUNT) {
          return { http: 400, body: { error: 'not_enough_stamps', have: totalAvailable, need: LOYALTY_REQUIRED_COUNT } };
        }

        // Consume real orders first, then top up from manual credits.
        const ordersToConsume = eligibleRows.slice(0, LOYALTY_REQUIRED_COUNT);
        let needFromManual = LOYALTY_REQUIRED_COUNT - ordersToConsume.length;

        const redemptionId = `loy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const voucherId    = `ord_loy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

        // Voucher order. payment_ref = redemptionId so /api/verify-qr
        // can find it; that endpoint already widens to qr_provider IN
        // ('pocket_pay','loyalty') so the same scan flow allocates a
        // T-NNN ticket and flips paid → queued at the lane.
        // Branchless voucher order — branch_id stays NULL until a
        // cashier scans the QR at a lane.
        await tx.execute(sql`
          INSERT INTO orders (
            id, branch_id, customer_id, vehicle_id, plate,
            package_id, package_name, package_price_cents,
            addons, subtotal_cents, total_cents,
            payment_method, payment_ref, qr_provider,
            ticket_code, status, customer_name_walkin
          ) VALUES (
            ${voucherId}, NULL, ${userId}, ${vehicleId}, ${carPlate},
            ${pkg.id}, ${LOYALTY_VOUCHER_NAME}, 0,
            '[]'::jsonb, 0, 0,
            'voucher', ${redemptionId}, 'loyalty',
            NULL, 'paid', NULL
          )
        `);

        await tx.execute(sql`
          INSERT INTO loyalty_redemptions
            (id, customer_user_id, voucher_order_id, package_id, branch_id)
          VALUES
            (${redemptionId}, ${userId}, ${voucherId}, ${LOYALTY_PKG_ID}, NULL)
        `);

        // Punch the real receipts. Loop instead of ANY(array) — Drizzle's
        // sql tag binds JS arrays as a record tuple, not a text[], which
        // breaks the cast. 4 rows max so the loop cost is negligible.
        for (const row of ordersToConsume) {
          await tx.execute(sql`
            UPDATE orders SET loyalty_consumed_in = ${redemptionId}
             WHERE id = ${row.id}
               AND loyalty_consumed_in IS NULL
          `);
        }

        // Top up the remainder from cashier-credited manual stamps, oldest
        // first, decrementing stamps_remaining (memberships-style).
        for (const row of manualRows) {
          if (needFromManual <= 0) break;
          const take = Math.min(needFromManual, Number(row.stamps_remaining));
          await tx.execute(sql`
            UPDATE loyalty_manual_stamps
               SET stamps_remaining = stamps_remaining - ${take}
             WHERE id = ${row.id}
          `);
          needFromManual -= take;
        }

        return {
          http: 201,
          body: {
            ok: true,
            voucher: {
              order_id: voucherId,
              payment_ref: redemptionId,
              // Branch is set when the QR is scanned at the lane.
              branch_id: null,
              branch_name: null,
              plate,
              package_name: pkg.name,
              qr_payload: JSON.stringify({
                type: 'CUCI_XPRESS_PAYMENT',
                order_id: redemptionId,
              }),
            },
          },
        };
      });

      return res.status(out.http).json(out.body);
    } catch (err) {
      console.error('[customer.loyalty.redeem] failed:', err);
      return res.status(500).json({ error: 'redeem_failed' });
    }
  });

  // POST /api/customer/membership/checkin — Membership Wash QR.
  // The logged-in customer with an ACTIVE Unlimited membership taps
  // "Show wash QR" on the dashboard. We create (or reuse) a branchless
  // B$0 order for that membership's vehicle marked qr_provider='membership'
  // and return a CUCI_XPRESS_PAYMENT QR payload — exactly the shape the
  // loyalty free-wash voucher uses. Staff scan it at the lane, where
  // /api/verify-qr (now widened to 'membership') allocates a T-NNN ticket,
  // stamps the scanning branch, and queues the wash at B$0 as
  // "Unlimited Xpress". Reuses the most recent still-pending membership
  // order for that vehicle instead of stacking duplicates; rescans of the
  // same QR are idempotent at the verify-qr layer.
  app.post('/api/customer/membership/checkin', requireLuciaUser, async (req, res) => {
    const userId = Number(req.lucia!.user!.id);
    // Optional: when the customer taps "Free wash" on a specific garage
    // card we scope the membership lookup to THAT vehicle. Omitted (e.g.
    // the Overview hero button) falls back to the latest active unlimited.
    const rawVehicleId = (req.body ?? {}).vehicle_id;
    const requestedVehicleId =
      rawVehicleId === undefined || rawVehicleId === null
        ? null
        : Number(rawVehicleId);
    if (requestedVehicleId !== null && !Number.isInteger(requestedVehicleId)) {
      return res.status(400).json({ error: 'invalid_vehicle_id' });
    }

    try {
      const out = await db.transaction(async (tx) => {
        // 1. Resolve THIS user's active unlimited membership + its vehicle.
        //    When a vehicle_id is supplied, scope to that car so multi-car
        //    accounts get the voucher for the vehicle they actually tapped;
        //    otherwise pick the latest active unlimited membership.
        const membership = (await tx.execute(sql`
          SELECT m.id, m.vehicle_id, m.status, m.expires_at,
                 ca.license_plate AS vehicle_plate
            FROM memberships m
            JOIN customers c ON c.id = m.customer_id
            LEFT JOIN cars ca ON ca.id = m.vehicle_id
           WHERE c.user_id = ${userId}
             AND m.kind   = 'unlimited'
             AND m.status = 'active'
             AND (m.expires_at IS NULL OR m.expires_at > now())
             ${requestedVehicleId !== null
               ? sql`AND m.vehicle_id = ${requestedVehicleId}`
               : sql``}
           ORDER BY m.created_at DESC
           LIMIT 1
           FOR UPDATE OF m
        `)).rows[0] as
          | { id: string; vehicle_id: number | null; status: string; expires_at: string | null; vehicle_plate: string | null }
          | undefined;

        if (!membership) {
          return { http: 404, body: { error: 'no_active_unlimited_membership' } };
        }
        if (!membership.vehicle_id || !membership.vehicle_plate) {
          // Unlimited plans are single-car; without a linked plate we
          // can't create the wash order (orders.plate is NOT NULL).
          return { http: 409, body: { error: 'membership_no_vehicle' } };
        }
        const vehicleId = membership.vehicle_id;
        const plate     = membership.vehicle_plate;

        // 2. Reuse the most recent still-pending membership order for this
        //    vehicle instead of stacking duplicates. "Pending" = paid (B$0)
        //    but not yet ticketed at a lane.
        const existing = (await tx.execute(sql`
          SELECT id, payment_ref FROM orders
           WHERE vehicle_id  = ${vehicleId}
             AND qr_provider = 'membership'
             AND status      = 'paid'
             AND ticket_code IS NULL
           ORDER BY created_at DESC
           LIMIT 1
        `)).rows[0] as { id: string; payment_ref: string } | undefined;

        if (existing) {
          return {
            http: 200,
            body: {
              ok: true,
              voucher: {
                order_id: existing.id,
                payment_ref: existing.payment_ref,
                branch_id: null,
                branch_name: null,
                plate,
                package_name: 'Unlimited Xpress',
                expires_at: membership.expires_at,
                qr_payload: JSON.stringify({
                  type: 'CUCI_XPRESS_PAYMENT',
                  order_id: existing.payment_ref,
                }),
              },
            },
          };
        }

        // 3. Create a fresh branchless B$0 membership wash order. Branch is
        //    stamped when the cashier scans the QR at a lane.
        const orderId    = `ord_mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const paymentRef = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

        await tx.execute(sql`
          INSERT INTO orders (
            id, branch_id, customer_id, vehicle_id, plate,
            package_id, package_name, package_price_cents,
            addons, subtotal_cents, total_cents,
            payment_method, payment_ref, qr_provider,
            ticket_code, status, customer_name_walkin
          ) VALUES (
            ${orderId}, NULL, ${userId}, ${vehicleId}, ${plate},
            NULL, 'Unlimited Xpress', 0,
            '[]'::jsonb, 0, 0,
            'subscription', ${paymentRef}, 'membership',
            NULL, 'paid', NULL
          )
        `);

        return {
          http: 201,
          body: {
            ok: true,
            voucher: {
              order_id: orderId,
              payment_ref: paymentRef,
              branch_id: null,
              branch_name: null,
              plate,
              package_name: 'Unlimited Xpress',
              expires_at: membership.expires_at,
              qr_payload: JSON.stringify({
                type: 'CUCI_XPRESS_PAYMENT',
                order_id: paymentRef,
              }),
            },
          },
        };
      });

      return res.status(out.http).json(out.body);
    } catch (err) {
      console.error('[customer.membership.checkin] failed:', err);
      return res.status(500).json({ error: 'checkin_failed' });
    }
  });

  // POST /api/customer/cars — customer adds one of their vehicles.
  // Plate is normalised to upper-case + trimmed; we de-dupe so the same
  // customer can't have the same plate twice on their list.
  // photo_url: data: URL (image/jpeg or image/png) capped at ~2MB after
  // base64 inflation. Client-side resize keeps real-world payloads
  // around 100-200KB. We accept null to clear the photo.
  const customerCarSchema = z.object({
    license_plate: z.string().trim().min(1).max(20),
    brand: z.string().trim().max(60).optional().nullable(),
    model: z.string().trim().max(60).optional().nullable(),
    color: z.string().trim().max(40).optional().nullable(),
    photo_url: z.string()
      .max(2_800_000)
      .regex(/^data:image\/(jpeg|png|webp);base64,/, 'must be a data: image URL')
      .optional()
      .nullable(),
    // Counter-sold Unlimited pass claim: when the plate is held by a
    // WALK-IN customer created at the POS (no user account), the customer
    // proves it's theirs by entering the phone number given at the till.
    phone: z.string().trim().max(30).optional().nullable(),
  });
  // Wrong-phone guess limiter for walk-in plate claims (per user+plate,
  // in-memory — resets on restart, which is fine for this abuse control).
  const claimPhoneAttempts = new Map<string, { count: number; firstAt: number }>();
  const CLAIM_ATTEMPT_MAX = 5;
  const CLAIM_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
  app.post('/api/customer/cars', requireLuciaUser, async (req, res) => {
    const parsed = customerCarSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, reason: 'invalid_request' });
    }
    const userId = Number(req.lucia!.user!.id);
    const plate = parsed.data.license_plate.toUpperCase().replace(/\s+/g, ' ').trim();
    // Plate-normalisation: case + whitespace insensitive so "BC 8" and
    // "bc8" collide. Used to detect both self-duplicates and cross-user
    // claims (and to resolve any residual unique-constraint race in catch).
    const plateNorm = plate.toUpperCase().replace(/\s+/g, '');
    try {
      const cust = (await db.execute(sql`
        SELECT id FROM customers WHERE user_id = ${userId} LIMIT 1
      `)).rows[0] as { id: number } | undefined;
      const dupe = (await db.execute(sql`
        SELECT id FROM cars
        WHERE UPPER(REGEXP_REPLACE(license_plate, '\\s+', '', 'g')) = ${plateNorm}
          AND (user_id = ${userId} OR customer_id = ${cust?.id ?? null})
        LIMIT 1
      `)).rows[0];
      if (dupe) return res.status(409).json({ ok: false, reason: 'duplicate_plate' });

      // Cross-user claim guard: refuse if any *other* customer has already
      // linked this plate. Customer can dispute via WhatsApp (handled in
      // the UI) if it's genuinely theirs.
      //
      // EXCEPTION — counter-sold Unlimited pass (2026-07-18): the POS
      // creates a WALK-IN customer row (user_id NULL) linked to the car
      // when a pass is sold at the till. That buyer must be able to claim
      // their own plate when they register online. Proof of ownership is
      // the phone number given at the counter: if the request includes a
      // phone that matches the walk-in customer's phone, we adopt that
      // walk-in identity instead of refusing.
      const claimed = (await db.execute(sql`
        SELECT c.id, c.user_id, c.customer_id,
               cu.user_id AS cust_user_id, cu.phone AS cust_phone
          FROM cars c
          LEFT JOIN customers cu ON cu.id = c.customer_id
        WHERE UPPER(REGEXP_REPLACE(c.license_plate, '\\s+', '', 'g')) = ${plateNorm}
          AND (c.user_id IS NOT NULL OR c.customer_id IS NOT NULL)
        LIMIT 1
      `)).rows[0] as {
        id: number; user_id: number | null; customer_id: number | null;
        cust_user_id: number | null; cust_phone: string | null;
      } | undefined;
      if (claimed) {
        const isWalkinHeld =
          claimed.user_id == null &&
          claimed.customer_id != null &&
          claimed.cust_user_id == null;
        if (!isWalkinHeld) {
          return res.status(409).json({ ok: false, reason: 'plate_claimed', plate });
        }
        const phoneNorm = (parsed.data.phone ?? '').replace(/\D+/g, '');
        const heldPhoneNorm = (claimed.cust_phone ?? '').replace(/\D+/g, '');
        if (!phoneNorm) {
          // Tell the UI to prompt for the phone number and retry.
          return res.status(409).json({ ok: false, reason: 'phone_match_required', plate });
        }
        // Brute-force guard: the phone is the proof of ownership, so cap
        // wrong guesses per user+plate (5 per 15 minutes) or an attacker
        // could enumerate phone numbers to take over a member plate.
        const attemptKey = `${userId}:${plateNorm}`;
        const attempt = claimPhoneAttempts.get(attemptKey);
        const nowMs = Date.now();
        if (attempt && nowMs - attempt.firstAt > CLAIM_ATTEMPT_WINDOW_MS) {
          claimPhoneAttempts.delete(attemptKey);
        }
        const current = claimPhoneAttempts.get(attemptKey);
        if (current && current.count >= CLAIM_ATTEMPT_MAX) {
          return res.status(429).json({ ok: false, reason: 'too_many_attempts', plate });
        }
        if (!heldPhoneNorm || phoneNorm !== heldPhoneNorm) {
          if (current) current.count += 1;
          else claimPhoneAttempts.set(attemptKey, { count: 1, firstAt: nowMs });
          console.warn(
            `[customer/cars POST] phone mismatch on walk-in claim: user=${userId} plate=${plate} attempts=${claimPhoneAttempts.get(attemptKey)?.count}`,
          );
          return res.status(409).json({ ok: false, reason: 'phone_mismatch', plate });
        }
        claimPhoneAttempts.delete(attemptKey);
        // Phone matches — adopt the walk-in identity atomically.
        const adopted = await db.transaction(async (tx) => {
          if (!cust) {
            // User has no customer row yet: take over the walk-in row so
            // memberships, loyalty and history all follow automatically.
            // Guarded re-check (user_id still NULL) so two concurrent
            // claims can't both adopt.
            const took = (await tx.execute(sql`
              UPDATE customers SET user_id = ${userId}
              WHERE id = ${claimed.customer_id} AND user_id IS NULL
              RETURNING id
            `)).rows[0];
            if (!took) return null;
            const car = (await tx.execute(sql`
              UPDATE cars SET
                user_id       = ${userId},
                license_plate = ${plate},
                brand     = COALESCE(${parsed.data.brand ?? null}, brand),
                model     = COALESCE(${parsed.data.model ?? null}, model),
                color     = COALESCE(${parsed.data.color ?? null}, color),
                photo_url = COALESCE(${parsed.data.photo_url ?? null}, photo_url)
              WHERE id = ${claimed.id} AND user_id IS NULL
              RETURNING id, license_plate, brand, model, color, photo_url, last_seen_at
            `)).rows[0];
            return car ?? null;
          }
          // User already has their own customer row: re-point this car and
          // its memberships to it (the walk-in shell row keeps any other
          // history it may have).
          await tx.execute(sql`
            UPDATE memberships SET customer_id = ${cust.id}
            WHERE vehicle_id = ${claimed.id} AND customer_id = ${claimed.customer_id}
          `);
          const car = (await tx.execute(sql`
            UPDATE cars SET
              user_id       = ${userId},
              customer_id   = ${cust.id},
              license_plate = ${plate},
              brand     = COALESCE(${parsed.data.brand ?? null}, brand),
              model     = COALESCE(${parsed.data.model ?? null}, model),
              color     = COALESCE(${parsed.data.color ?? null}, color),
              photo_url = COALESCE(${parsed.data.photo_url ?? null}, photo_url)
            WHERE id = ${claimed.id} AND user_id IS NULL
            RETURNING id, license_plate, brand, model, color, photo_url, last_seen_at
          `)).rows[0];
          return car ?? null;
        });
        if (!adopted) {
          return res.status(409).json({ ok: false, reason: 'plate_claimed', plate });
        }
        console.log(
          `[customer/cars POST] walk-in plate ${plate} adopted by user ${userId} via phone match`,
        );
        return res.json({ ok: true, car: adopted });
      }

      // An unclaimed car for this plate may already exist — typically created
      // at the POS as a walk-in (user_id + customer_id both NULL). Because of
      // the cars_plate_normalized_unique constraint, inserting a second row for
      // the same plate would fail. So instead we CLAIM that existing car in a
      // single atomic UPDATE (the WHERE re-checks "still unclaimed" so two
      // concurrent claims can't both win): attach it to this customer and fill
      // in the details they entered, keeping any existing value left blank.
      const claimedCar = (await db.execute(sql`
        UPDATE cars SET
          user_id       = ${userId},
          customer_id   = ${cust?.id ?? null},
          license_plate = ${plate},
          brand     = COALESCE(${parsed.data.brand ?? null}, brand),
          model     = COALESCE(${parsed.data.model ?? null}, model),
          color     = COALESCE(${parsed.data.color ?? null}, color),
          photo_url = COALESCE(${parsed.data.photo_url ?? null}, photo_url)
        WHERE UPPER(REGEXP_REPLACE(license_plate, '\\s+', '', 'g')) = ${plateNorm}
          AND user_id IS NULL AND customer_id IS NULL
        RETURNING id, license_plate, brand, model, color, photo_url, last_seen_at
      `)).rows[0];
      if (claimedCar) {
        return res.json({ ok: true, car: claimedCar });
      }

      const inserted = (await db.execute(sql`
        INSERT INTO cars (user_id, customer_id, license_plate, brand, model, color, photo_url)
        VALUES (${userId}, ${cust?.id ?? null}, ${plate},
                ${parsed.data.brand ?? null}, ${parsed.data.model ?? null},
                ${parsed.data.color ?? null}, ${parsed.data.photo_url ?? null})
        RETURNING id, license_plate, brand, model, color, photo_url, last_seen_at
      `)).rows[0];
      res.json({ ok: true, car: inserted });
    } catch (err) {
      // A residual unique-constraint hit (23505 on cars_plate_normalized_unique)
      // means another request claimed/created this plate in the tiny window
      // between our checks and our write. Resolve it deterministically into a
      // 409 instead of a confusing 500: ours -> duplicate_plate, theirs ->
      // plate_claimed.
      const code = (err as any)?.cause?.code ?? (err as any)?.code;
      if (code === '23505') {
        try {
          const mine = (await db.execute(sql`
            SELECT id FROM cars
            WHERE UPPER(REGEXP_REPLACE(license_plate, '\\s+', '', 'g')) = ${plateNorm}
              AND user_id = ${userId}
            LIMIT 1
          `)).rows[0];
          return res.status(409).json(
            mine
              ? { ok: false, reason: 'duplicate_plate' }
              : { ok: false, reason: 'plate_claimed', plate },
          );
        } catch {
          /* fall through to generic 500 below */
        }
      }
      console.error('[customer/cars POST] failed', err);
      res.status(500).json({ ok: false, reason: 'server_error' });
    }
  });

  // PATCH /api/customer/cars/:id — edit brand/model/color on a vehicle
  // the signed-in customer owns. Plate is intentionally NOT editable
  // (it's the join key into orders).
  app.patch('/api/customer/cars/:id', requireLuciaUser, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, reason: 'bad_id' });
    const parsed = customerCarSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, reason: 'invalid_request' });
    }
    const userId = Number(req.lucia!.user!.id);
    try {
      // photo_url uses key-presence semantics: when the client omits the
      // key we keep the existing photo; when they explicitly send `null`
      // we clear it; when they send a data URL we replace it.
      const photoTouched = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'photo_url');
      const newPhoto = photoTouched ? (parsed.data.photo_url ?? null) : undefined;
      const updated = (await db.execute(sql`
        UPDATE cars SET
          brand     = COALESCE(${parsed.data.brand ?? null}, brand),
          model     = COALESCE(${parsed.data.model ?? null}, model),
          color     = COALESCE(${parsed.data.color ?? null}, color),
          photo_url = CASE WHEN ${photoTouched}::boolean THEN ${newPhoto ?? null} ELSE photo_url END
        WHERE id = ${id}
          AND (user_id = ${userId}
               OR customer_id = (SELECT id FROM customers WHERE user_id = ${userId} LIMIT 1))
        RETURNING id, license_plate, brand, model, color, photo_url, last_seen_at
      `)).rows[0];
      if (!updated) return res.status(404).json({ ok: false, reason: 'not_found' });
      res.json({ ok: true, car: updated });
    } catch (err) {
      console.error('[customer/cars PATCH] failed', err);
      res.status(500).json({ ok: false, reason: 'server_error' });
    }
  });

  // DELETE /api/customer/cars/:id — remove a vehicle from the signed-in
  // customer's garage. We don't hard-delete: past orders may still link
  // to this car via orders.vehicle_id, and any active membership tied
  // to the plate should keep its audit trail. Instead we *unlink* by
  // clearing user_id + customer_id, which makes the car disappear from
  // /api/customer/cars while preserving all historical references.
  // Blocked if there's an active membership tied to this specific car.
  app.delete('/api/customer/cars/:id', requireLuciaUser, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, reason: 'bad_id' });
    const userId = Number(req.lucia!.user!.id);
    try {
      // 1. Assert ownership first — avoids leaking info about cars the
      //    requester doesn't own.
      const owned = (await db.execute(sql`
        SELECT 1 FROM cars
         WHERE id = ${id}
           AND (user_id = ${userId}
                OR customer_id = (SELECT id FROM customers WHERE user_id = ${userId} LIMIT 1))
        LIMIT 1
      `)).rows[0];
      if (!owned) return res.status(404).json({ ok: false, reason: 'not_found' });

      // 2. Block delete only if THIS user has an active membership tied
      //    to this specific car. A stray membership owned by a different
      //    customer (e.g. legacy data on a shared plate) shouldn't block.
      const active = (await db.execute(sql`
        SELECT 1
          FROM memberships m
          JOIN customers c ON c.id = m.customer_id
         WHERE m.vehicle_id = ${id}
           AND m.status = 'active'
           AND c.user_id = ${userId}
        LIMIT 1
      `)).rows[0];
      if (active) {
        return res.status(409).json({ ok: false, reason: 'membership_attached' });
      }

      // 3. Unlink — preserves orders.vehicle_id history.
      await db.execute(sql`
        UPDATE cars
           SET user_id = NULL,
               customer_id = NULL
         WHERE id = ${id}
      `);
      res.json({ ok: true });
    } catch (err) {
      console.error('[customer/cars DELETE] failed', err);
      res.status(500).json({ ok: false, reason: 'server_error' });
    }
  });

  // === Google OAuth (Task 1.5) ============================================
  // Authorization-code flow with PKCE via the `arctic` library. Mints a
  // Lucia session on success — replacing the legacy JWT for Google sign-in.
  // Routes are only registered if Google is fully configured; otherwise we
  // return 503 so the front-end gets a clear "not available" signal.
  const googleCfg = loadGoogleOAuthConfig();
  if (googleCfg) {
    const googleClient = buildGoogleClient(googleCfg);

    // GET /api/auth/google — start the flow.
    // Optional `?return_to=/some/path` lets the caller (e.g. the Pay&Que
    // checkout modal) bring the user back to where they were instead of
    // dumping them on the homepage. We validate strictly against open-
    // redirect attacks before storing it in a short-lived cookie.
    app.get('/api/auth/google', async (req, res) => {
      try {
        const { url, state, codeVerifier } = startGoogleAuth(googleClient);
        const cookieOpts = makeOAuthFlightCookieOptions();
        res.cookie(STATE_COOKIE, state, cookieOpts);
        res.cookie(VERIFIER_COOKIE, codeVerifier, cookieOpts);

        const rawReturnTo = req.query.return_to;
        if (isSafeReturnTo(rawReturnTo)) {
          res.cookie(RETURN_TO_COOKIE, rawReturnTo, cookieOpts);
        }

        await writeGoogleAudit('google.start', 'anonymous', req.ip ?? null);
        res.redirect(url.toString());
      } catch (err) {
        console.error('[google-oauth] start failed:', err);
        res.status(500).json({ ok: false, error: 'google_start_failed' });
      }
    });

    // GET <callbackPath> — handle Google's redirect back to us.
    // Path comes from GOOGLE_REDIRECT_URI so it always matches what's
    // registered in Google Cloud Console.
    app.get(googleCfg.callbackPath, async (req, res) => {
      const ip = req.ip ?? null;
      const code = typeof req.query.code === 'string' ? req.query.code : null;
      const queryState = typeof req.query.state === 'string' ? req.query.state : null;
      const cookieState = req.cookies?.[STATE_COOKIE] ?? null;
      const codeVerifier = req.cookies?.[VERIFIER_COOKIE] ?? null;
      const rawReturnTo = req.cookies?.[RETURN_TO_COOKIE] ?? null;
      const returnTo = isSafeReturnTo(rawReturnTo) ? rawReturnTo : '/';

      // Always clear in-flight cookies before responding, success or not.
      res.clearCookie(STATE_COOKIE, { path: '/' });
      res.clearCookie(VERIFIER_COOKIE, { path: '/' });
      res.clearCookie(RETURN_TO_COOKIE, { path: '/' });

      // 1. Catch user-cancelled or error responses from Google.
      if (typeof req.query.error === 'string') {
        await writeGoogleAudit('google.callback_failed', 'anonymous', ip, {
          reason: 'google_returned_error',
          error: req.query.error,
        });
        return res.redirect(appendOauthStatus(returnTo, 'cancelled'));
      }

      // 2. Validate the handshake.
      if (!code || !queryState || !cookieState || !codeVerifier) {
        await writeGoogleAudit('google.callback_failed', 'anonymous', ip, {
          reason: 'missing_params_or_cookies',
          hasCode: !!code,
          hasQueryState: !!queryState,
          hasCookieState: !!cookieState,
          hasVerifier: !!codeVerifier,
        });
        return res.status(400).json({ ok: false, error: 'invalid_oauth_callback' });
      }
      if (queryState !== cookieState) {
        await writeGoogleAudit('google.callback_failed', 'anonymous', ip, {
          reason: 'state_mismatch',
        });
        return res.status(400).json({ ok: false, error: 'state_mismatch' });
      }

      // 3. Exchange + decode + find-or-create + mint session.
      try {
        const tokens = await googleClient.validateAuthorizationCode(code, codeVerifier);
        const claims = decodeIdTokenClaims(tokens.idToken());
        const outcome = await findOrCreateGoogleUser(claims);

        // Mint Lucia session (cx_session cookie) — the new source of truth.
        const session = await lucia.createSession(String(outcome.userId), {});
        const sessionCookie = lucia.createSessionCookie(session.id);
        res.appendHeader('Set-Cookie', sessionCookie.serialize());

        // ALSO mint the legacy JWT cookie (cuci_auth_token) so the
        // existing `useAuth` hook + every legacy route still recognises
        // the user without any front-end rewiring. This is the bridge
        // that keeps the checkout flow continuous after Google sign-in.
        // We pull username/email straight from the row we just touched.
        const userRow = (await db.execute(sql`
          SELECT id, username, email FROM users WHERE id = ${outcome.userId} LIMIT 1
        `)).rows[0] as { id: number; username: string | null; email: string | null } | undefined;
        if (userRow) {
          const legacyToken = unifiedAuth.generateToken({
            id: userRow.id,
            username: userRow.username ?? `user${userRow.id}`,
            email: userRow.email,
          });
          unifiedAuth.setAuthCookie(res, legacyToken);
        }

        await writeGoogleAudit('google.callback_success', claims.email ?? String(outcome.userId), ip, {
          outcome: outcome.kind,
          userId: outcome.userId,
          googleSub: claims.sub,
          returnTo,
        });

        // Send the user back to where they came from (or `/`) with a
        // `google_oauth=ok` flag the front-end uses to refresh its
        // auth-aware UI without a full reload prompt.
        res.redirect(appendOauthStatus(returnTo, 'ok'));
      } catch (err: any) {
        const reason = err?.message || 'unknown';
        console.error('[google-oauth] callback failed:', err);
        await writeGoogleAudit('google.callback_failed', 'anonymous', ip, { reason });
        res.redirect(appendOauthStatus(returnTo, 'failed'));
      }
    });
  } else {
    // No Google config — surface a clear "not available" so the front-end
    // doesn't render a broken sign-in button.
    app.get('/api/auth/google', (_req, res) => {
      res.status(503).json({ ok: false, error: 'google_oauth_not_configured' });
    });
  }

  // === Staff password auth (Task 1.6) ===
  // Independent of customer auth. Uses its own Lucia instance + cookie
  // (`cx_staff_session`), so a person can be signed in as both a
  // customer and a staff member on the same browser without conflict.

  // POST /api/auth/staff/login — body: { email, password }
  app.post('/api/auth/staff/login', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ ok: false, error: 'email_and_password_required' });
    }

    const outcome = await loginStaff(email, password, req.ip ?? null);
    if (!outcome.ok) {
      const status = outcome.error === 'account_locked' ? 423 : 401;
      return res.status(status).json({
        ok: false,
        error: outcome.error,
        retryAfterSeconds: outcome.retryAfterSeconds,
      });
    }

    const session = await staffLucia.createSession(outcome.staff.id, {});
    const cookie = staffLucia.createSessionCookie(session.id);
    res.appendHeader('Set-Cookie', cookie.serialize());

    res.json({
      ok: true,
      staff: {
        id: outcome.staff.id,
        email: outcome.staff.email,
        name: outcome.staff.name,
        role: outcome.staff.role,
        branchId: outcome.staff.branchId,
      },
    });
  });

  // POST /api/auth/staff/logout — invalidate the staff session.
  app.post('/api/auth/staff/logout', requireStaff, async (req, res) => {
    const sid = req.staff!.session!.id;
    await staffLucia.invalidateSession(sid);
    const cookie = staffLucia.createBlankSessionCookie();
    res.appendHeader('Set-Cookie', cookie.serialize());
    res.json({ ok: true });
  });

  // GET /api/auth/staff/whoami — returns current staff session info or
  // { authenticated: false }. Never 401s, so the frontend can poll it
  // freely on page load.
  app.get('/api/auth/staff/whoami', (req, res) => {
    const user = req.staff?.user;
    if (!user) return res.json({ authenticated: false });
    res.json({
      authenticated: true,
      staff: {
        id: user.id,
        email: (user as any).email,
        name: (user as any).name,
        role: (user as any).role,
        branchId: (user as any).branchId,
      },
    });
  });

  // === POS surface endpoints (Task 2.4) =====================================
  // Three thin endpoints that drive the cashier-facing POS page at /pos.
  // All three sit behind `requireStaff` — the public surface never sees
  // catalog or order data. Pricing math always re-runs on the server from
  // the catalog rows, never trusting client-supplied amounts.
  // ==========================================================================

  // GET /api/pos/catalog
  // Returns the current active package + pricing matrix + active addons.
  // Shape is deliberately denormalised so the POS page can render in one
  // query and not babysit cache invalidations.
  app.get('/api/pos/catalog', requireStaff, async (req, res) => {
    try {
      // Flat per-package pricing in BND cents (2026-05-04_03 dropped
      // the size×branch pricing matrix — Cuci Xpress prices are uniform
      // across vehicle sizes).
      //
      // Branch filtering (added 2026-05-04_08): if `branch_id` is in
      // the query, hide packages that are explicitly assigned to other
      // branches. A package with NO rows in package_branches stays
      // visible everywhere — that's the documented default.
      const rawBranch = req.query.branch_id;
      const branchId = rawBranch != null && rawBranch !== '' ? Number(rawBranch) : null;
      const useBranchFilter = branchId !== null && Number.isFinite(branchId);
      const packagesRows = (await db.execute(
        useBranchFilter
          ? sql`
              SELECT p.id, p.name, p.description, p.duration_minutes, p.price_cents, p.sort_order, p.category_id
                FROM packages p
               WHERE p.is_active = true
                 AND (
                   NOT EXISTS (SELECT 1 FROM package_branches pb WHERE pb.package_id = p.id)
                   OR EXISTS (
                     SELECT 1 FROM package_branches pb
                      WHERE pb.package_id = p.id AND pb.branch_id = ${branchId}
                   )
                 )
               ORDER BY p.sort_order ASC, p.name ASC
            `
          : sql`
              SELECT id, name, description, duration_minutes, price_cents, sort_order, category_id
                FROM packages
               WHERE is_active = true
               ORDER BY sort_order ASC, name ASC
            `,
      )).rows as Array<{
        id: string;
        name: string;
        description: string | null;
        duration_minutes: number | null;
        price_cents: number;
        sort_order: number;
        category_id: string | null;
      }>;

      // Same branch-restriction rule as packages above (added 2026-05-08_02):
      // an add-on with no rows in addon_branches is visible everywhere.
      const addonsRows = (await db.execute(
        useBranchFilter
          ? sql`
              SELECT a.id, a.name, a.price_cents, a.sort_order, a.category_id
                FROM addons_catalog a
               WHERE a.is_active = true
                 AND (
                   NOT EXISTS (SELECT 1 FROM addon_branches ab WHERE ab.addon_id = a.id)
                   OR EXISTS (
                     SELECT 1 FROM addon_branches ab
                      WHERE ab.addon_id = a.id AND ab.branch_id = ${branchId}
                   )
                 )
               ORDER BY a.sort_order ASC, a.name ASC
            `
          : sql`
              SELECT id, name, price_cents, sort_order, category_id
                FROM addons_catalog
               WHERE is_active = true
               ORDER BY sort_order ASC, name ASC
            `,
      )).rows as Array<{
        id: string;
        name: string;
        price_cents: number;
        sort_order: number;
        category_id: string | null;
      }>;

      // POS Control Room: active categories so the grid can group packages.
      const categoryRows = (await db.execute(sql`
        SELECT id, name, sort_order
          FROM categories
         WHERE is_active = true
         ORDER BY sort_order ASC, name ASC
      `)).rows as Array<{ id: string; name: string; sort_order: number }>;

      res.json({
        packages: packagesRows,
        addons: addonsRows,
        categories: categoryRows,
        payment_methods: [
          'cash',
          'bank_transfer',
          'card',
          'qr_code',
          'baiduri_pay',
          'quick_pay',
          'subscription',
          'voucher',
        ] as const,
      });
    } catch (err) {
      console.error('[pos.catalog] failed:', err);
      res.status(500).json({ error: 'Failed to load catalog' });
    }
  });

  // GET /api/pos/payment-methods — active, ordered. Drives the POS dropdown.
  app.get('/api/pos/payment-methods', requireStaff, async (_req, res) => {
    try {
      const rows = (await db.execute(sql`
        SELECT id, label, method, qr_provider, sort_order
          FROM payment_methods
         WHERE is_active = true
         ORDER BY sort_order ASC, label ASC
      `)).rows;
      res.json({ rows });
    } catch (err) {
      console.error('[pos.payment_methods] failed:', err);
      res.status(500).json({ error: 'list_failed' });
    }
  });

  // GET /api/pos/discounts — active cashier-selectable discounts.
  app.get('/api/pos/discounts', requireStaff, async (_req, res) => {
    try {
      const rows = (await db.execute(sql`
        SELECT id, name, kind, value
          FROM discounts
         WHERE is_active = true
         ORDER BY sort_order ASC, name ASC
      `)).rows;
      res.json({ rows });
    } catch (err) {
      console.error('[pos.discounts] failed:', err);
      res.status(500).json({ error: 'list_failed' });
    }
  });

  // Shared promo lookup. Returns the row + a typed reason when unusable.
  // `subtotalCents` lets us pre-compute the would-be discount for display.
  async function lookupPromo(
    executor: { execute: typeof db.execute },
    rawCode: string,
    subtotalCents: number | null,
  ): Promise<
    | { ok: true; row: { id: string; code: string; kind: 'percent' | 'fixed'; value: number; max_uses: number | null; used_count: number }; amountCents: number | null }
    | { ok: false; reason: 'not_found' | 'inactive' | 'not_started' | 'expired' | 'exhausted' }
  > {
    const code = rawCode.toUpperCase().replace(/\s+/g, '');
    const row = (await executor.execute(sql`
      SELECT id, code, kind, value, is_active, starts_at, expires_at, max_uses, used_count
        FROM promo_codes
       WHERE code = ${code}
       LIMIT 1
    `)).rows[0] as
      | {
          id: string; code: string; kind: 'percent' | 'fixed'; value: number;
          is_active: boolean; starts_at: string | null; expires_at: string | null;
          max_uses: number | null; used_count: number;
        }
      | undefined;
    if (!row) return { ok: false, reason: 'not_found' };
    if (!row.is_active) return { ok: false, reason: 'inactive' };
    const now = new Date();
    if (row.starts_at && new Date(row.starts_at) > now) return { ok: false, reason: 'not_started' };
    if (row.expires_at && new Date(row.expires_at) < now) return { ok: false, reason: 'expired' };
    if (row.max_uses != null && row.used_count >= row.max_uses) return { ok: false, reason: 'exhausted' };
    const amountCents =
      subtotalCents == null
        ? null
        : row.kind === 'percent'
          ? Math.round((subtotalCents * row.value) / 100)
          : Math.min(row.value, subtotalCents);
    return {
      ok: true,
      row: { id: row.id, code: row.code, kind: row.kind, value: row.value, max_uses: row.max_uses, used_count: row.used_count },
      amountCents,
    };
  }

  // GET /api/pos/promo/validate?code=XYZ&subtotal_cents=NNN
  // Instant cashier feedback before the order is submitted. The authoritative
  // re-check + usage increment happens inside the order transaction.
  app.get('/api/pos/promo/validate', requireStaff, async (req, res) => {
    const code = String(req.query.code ?? '').trim();
    if (!code) return res.status(400).json({ error: 'missing_code' });
    const rawSub = req.query.subtotal_cents;
    const subtotal = rawSub != null && rawSub !== '' ? Number(rawSub) : null;
    const subtotalCents = subtotal != null && Number.isFinite(subtotal) && subtotal >= 0 ? Math.floor(subtotal) : null;
    try {
      const result = await lookupPromo(db, code, subtotalCents);
      if (!result.ok) return res.json({ valid: false, reason: result.reason });
      res.json({
        valid: true,
        promo: {
          id: result.row.id,
          code: result.row.code,
          kind: result.row.kind,
          value: result.row.value,
          discount_cents: result.amountCents,
        },
      });
    } catch (err) {
      console.error('[pos.promo.validate] failed:', err);
      res.status(500).json({ error: 'validate_failed' });
    }
  });

  // POST /api/pos/orders
  // Body: { package_id, plate, addon_ids[], payment_method,
  //         payment_ref?, branch_id, order_notes?, item_notes? }
  // The server authoritatively recomputes the price from the catalog and
  // generates a per-branch-per-day ticket code.
  const posOrderSchema = z.object({
    // Optional: the streamlined "Free Unlimited wash" path omits it and
    // the server synthesizes a B$0 "Unlimited Xpress" line (see handler).
    package_id: z.string().min(1).optional().nullable(),
    plate: z.string().trim().min(1).max(20),
    addon_ids: z.array(z.string().min(1)).default([]),
    // Per-add-on quantity (e.g. 3 vouchers), keyed by add-on id. Any add-on
    // in addon_ids without an entry here defaults to qty 1. Backward
    // compatible — older clients that omit this still send qty-1 lines.
    addon_quantities: z.record(z.string(), z.number().int().min(1).max(999)).optional(),
    payment_method: z.enum([
      'cash', 'bank_transfer', 'card', 'qr_code',
      'baiduri_pay', 'quick_pay', 'subscription', 'voucher',
    ]),
    payment_ref: z.string().trim().max(120).optional().nullable(),
    // Discriminates the qr_code "wallet" payment methods so reports can tell
    // the different wallets apart (Pocket QR, Baiduri MS, owner-added wallets
    // like Progresif Ding!, etc.). Only meaningful when payment_method='qr_code';
    // ignored otherwise. Accepts any owner-defined provider slug — the set of
    // wallets lives in the payment_methods config table, not a hardcoded list.
    // Note: 'pocket_pay' is reserved for the online Pocket Pay callback
    // idempotency index (idx_orders_pocket_pay_payment_ref); manual POS wallets
    // must never use it, so it is rejected here.
    qr_provider: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9_]+$/)
      .refine((v) => v !== 'pocket_pay', { message: "'pocket_pay' is reserved" })
      .optional()
      .nullable(),
    // Cash tendered by the customer. Optional — when omitted the server
    // treats it as exact payment (paid = total, change = 0). Used to
    // print/show the amount paid and change due on the receipt.
    paid_amount_cents: z.number().int().nonnegative().optional().nullable(),
    branch_id: z.number().int().positive(),
    order_notes: z.string().trim().max(500).optional().nullable(),
    item_notes: z.string().trim().max(500).optional().nullable(),
    // Phase 1 (2026-05-04): vehicle/customer linking. All optional —
    // when omitted, the server upserts a vehicle by plate and leaves
    // the customer link empty.
    vehicle_id: z.number().int().positive().optional().nullable(),
    customer_phone: z.string().trim().min(4).max(40).optional().nullable(),
    customer_name: z.string().trim().min(1).max(120).optional().nullable(),
    // First-time plate: the cashier records the car's brand + model so the
    // new (or still-blank) cars row carries those details forward — when the
    // customer later registers and claims the plate they're retained.
    brand: z.string().trim().max(60).optional().nullable(),
    model: z.string().trim().max(60).optional().nullable(),
    // Phase 2 (2026-05-04): wash-pack redemption. When the cashier
    // explicitly chooses payment_method='subscription', the client
    // sends the membership_id to redeem against. The server still
    // validates ownership + remaining balance inside the txn.
    membership_id: z.string().trim().min(1).max(60).optional().nullable(),
    // POS Control Room (2026-06-05): checkout-time discount + promo.
    // Both are recomputed server-side off the subtotal and rejected on
    // subscription (free) washes. `promo_code` is the raw code; the
    // server normalises + re-validates + increments usage in the txn.
    discount_id: z.string().trim().min(1).max(60).optional().nullable(),
    promo_code: z.string().trim().min(1).max(40).optional().nullable(),
  });

  app.post('/api/pos/orders', requireStaff, requireStaffRole('owner', 'manager', 'lane', 'cashier'), async (req, res) => {
    const parsed = posOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_request',
        details: parsed.error.flatten(),
      });
    }
    const body = parsed.data;
    // Cash payments must record the cash tendered (mirrors the POS "Cash
    // received (required)" gate) so the drawer reconciles and change is
    // computed from a real figure rather than assumed-exact.
    if (body.payment_method === 'cash' && body.paid_amount_cents == null) {
      return res.status(400).json({ error: 'cash_amount_required' });
    }
    // Bank transfer must record a reference (transaction id) so the sale can
    // be reconciled against the bank statement (mirrors the POS "Reference
    // (required)" gate).
    if (
      body.payment_method === 'bank_transfer' &&
      (body.payment_ref == null || body.payment_ref.trim() === '')
    ) {
      return res.status(400).json({ error: 'bank_transfer_reference_required' });
    }
    const staffUser = req.staff!.user as any;
    const staffId = staffUser.id as string;
    const staffRole = staffUser.role as 'owner' | 'manager' | 'lane' | 'cashier';
    const staffBranchId = staffUser.branchId as number | null;

    // Authoritative branch resolution. Lane/cashier are LOCKED to the
    // branch their account is bound to — they cannot submit orders for
    // another branch even if the client tampers with the payload.
    // Owner/manager may pick any branch (they're the ones rotating
    // between sites or covering shifts).
    const VALID_BRANCH_IDS = [1, 2, 3, 4, 5];
    let effectiveBranchId: number;
    if (staffRole === 'owner' || staffRole === 'manager') {
      if (!VALID_BRANCH_IDS.includes(body.branch_id)) {
        return res.status(400).json({ error: 'invalid_branch' });
      }
      effectiveBranchId = body.branch_id;
    } else {
      if (staffBranchId == null) {
        return res.status(400).json({ error: 'staff_no_branch' });
      }
      effectiveBranchId = staffBranchId;
    }

    // Sentinel error type so we can surface validation failures with
    // proper HTTP status codes from inside the transaction body.
    class PosOrderError extends Error {
      constructor(public status: number, public code: string) {
        super(code);
      }
    }

    try {
      // Lazy expiry sweep before opening the txn. Lives outside the
      // transaction on purpose: if the redemption itself fails and the
      // txn rolls back, we still want expired-status flips to persist.
      // Only runs when this order is touching a membership.
      if (body.payment_method === 'subscription') {
        await db.execute(sql`
          UPDATE memberships
             SET status = 'expired'
           WHERE status = 'active'
             AND expires_at IS NOT NULL
             AND expires_at < now()
        `);
      }

      // Everything below — package lookup, customer/vehicle upsert,
      // ticket allocation, order INSERT, and (when applicable) the
      // membership redemption — runs in a single DB transaction so a
      // mid-flow failure can't leak a wash from a customer's pack or
      // produce an order without its redemption row.
      const result = await db.transaction(async (tx) => {
        // 1. Resolve the package + flat price (2026-05-04_03 — no size).
        //    Normally the cashier selects a package from the catalog. The
        //    streamlined "Free Unlimited wash" path omits package_id: we
        //    synthesize a B$0 "Unlimited Xpress" line and require the order
        //    to redeem an active *unlimited* membership (enforced in the
        //    redemption block below).
        const isUnlimitedOneTap = !body.package_id;
        let pkg: { id: string | null; name: string; price_cents: number };
        if (isUnlimitedOneTap) {
          if (body.payment_method !== 'subscription') {
            throw new PosOrderError(400, 'package_required');
          }
          // The membership discount below zeroes the entire subtotal. With no
          // package line, any attached add-ons would ride along for free —
          // reject them so a packageless redemption can't be abused to give
          // away paid extras. Paid add-ons must go through a normal package
          // order (or be sold as a separate line).
          if (body.addon_ids.length > 0) {
            throw new PosOrderError(400, 'addons_not_allowed_on_unlimited');
          }
          pkg = { id: null, name: 'Unlimited Xpress', price_cents: 0 };
        } else {
          const pkgRows = (await tx.execute(sql`
            SELECT id, name, price_cents
              FROM packages
             WHERE id = ${body.package_id}
               AND is_active = true
             LIMIT 1
          `)).rows as Array<{ id: string; name: string; price_cents: number }>;
          if (pkgRows.length === 0) {
            throw new PosOrderError(400, 'package_not_available');
          }
          pkg = pkgRows[0];
        }

        // 2. Look up + snapshot the requested addons, each with its quantity.
        let addonSnapshots: Array<{ id: string; name: string; price_cents: number; quantity: number }> = [];
        if (body.addon_ids.length > 0) {
          // Match each addon id as an individual parameter via an IN-list.
          // (A raw `= ANY(${jsArray})` fails under the neon driver — the JS
          // array isn't serialised to a Postgres array literal, so Postgres
          // rejects it as a "malformed array literal".)
          const addonRows = (await tx.execute(sql`
            SELECT id, name, price_cents
              FROM addons_catalog
             WHERE id IN (${sql.join(body.addon_ids.map((id) => sql`${id}`), sql`, `)})
               AND is_active = true
          `)).rows as Array<{ id: string; name: string; price_cents: number }>;
          if (addonRows.length !== body.addon_ids.length) {
            throw new PosOrderError(400, 'addon_not_available');
          }
          // Stamp the per-line quantity (default 1) onto each snapshot so the
          // subtotal and the receipt itemisation both reflect bulk add-on
          // sales (e.g. 3 vouchers). A subscription/free wash is a single car,
          // so its add-ons stay at qty 1.
          const qtyMap = body.addon_quantities ?? {};
          addonSnapshots = addonRows.map((a) => ({
            ...a,
            quantity:
              body.payment_method === 'subscription'
                ? 1
                : Math.max(1, qtyMap[a.id] ?? 1),
          }));
        }

        // 3. Compute totals server-side. Never trust client amounts.
        // Add-ons can be sold in bulk (qty per line); the package is always a
        // single wash.
        const addonsTotal = addonSnapshots.reduce(
          (s, a) => s + a.price_cents * a.quantity,
          0,
        );
        const subtotal = pkg.price_cents + addonsTotal;

        // 4. Allocate the next ticket code for this branch + day.
        const seqRow = (await tx.execute(sql`
          SELECT COALESCE(
            MAX( NULLIF(regexp_replace(ticket_code, '\\D', '', 'g'), '')::int ),
            0
          ) + 1 AS next_seq
            FROM orders
           WHERE branch_id = ${effectiveBranchId}
             AND ticket_day = (now() AT TIME ZONE 'UTC')::date
        `)).rows as Array<{ next_seq: number }>;
        const seq = seqRow[0]?.next_seq ?? 1;
        const ticketCode = `T-${String(seq).padStart(3, '0')}`;

        // 5. Resolve vehicle + customer (Phase 1).
        let resolvedVehicleId: number | null = null;
        let walkinName: string | null = null;
        const plateUpper = body.plate.toUpperCase();
        const plateNorm = plateUpper.replace(/\s+/g, '');

        // (c) customer upsert (if phone given)
        let posCustomerId: number | null = null;
        if (body.customer_phone && body.customer_name) {
          const cu = (await tx.execute(sql`
            INSERT INTO customers (phone, name)
            VALUES (${body.customer_phone}, ${body.customer_name})
            ON CONFLICT (phone) DO UPDATE
               SET name = EXCLUDED.name
            RETURNING id, name
          `)).rows[0] as any;
          posCustomerId = cu.id;
          walkinName = cu.name;
        } else if (body.customer_name) {
          walkinName = body.customer_name;
        }

        // (a) explicit vehicle_id wins
        if (body.vehicle_id) {
          const v = (await tx.execute(sql`
            SELECT id, customer_id FROM cars WHERE id = ${body.vehicle_id} LIMIT 1
          `)).rows as any[];
          if (v.length === 0) {
            throw new PosOrderError(400, 'vehicle_not_found');
          }
          resolvedVehicleId = v[0].id;
          await tx.execute(sql`
            UPDATE cars SET
              customer_id  = COALESCE(customer_id, ${posCustomerId}),
              last_seen_at = now()
             WHERE id = ${resolvedVehicleId}
          `);
          if (!walkinName && v[0].customer_id) {
            const cn = (await tx.execute(sql`
              SELECT name FROM customers WHERE id = ${v[0].customer_id} LIMIT 1
            `)).rows[0] as any;
            walkinName = cn?.name ?? null;
          }
          // For membership lookup later — rebind posCustomerId from car if not already set.
          if (!posCustomerId && v[0].customer_id) {
            posCustomerId = v[0].customer_id;
          }
        } else {
          // (b) upsert by normalised plate
          const existing = (await tx.execute(sql`
            SELECT id, user_id, customer_id
              FROM cars
             WHERE UPPER(REGEXP_REPLACE(license_plate, '\\s+', '', 'g')) = ${plateNorm}
             ORDER BY (CASE WHEN customer_id = ${posCustomerId ?? -1} THEN 0 ELSE 1 END) ASC,
                      COALESCE(last_seen_at, 'epoch'::timestamptz) DESC,
                      id DESC
             LIMIT 1
          `)).rows as any[];
          // Normalise blank strings to NULL so a "blank-but-non-null" value
          // can't block future enrichment via COALESCE.
          const newBrand = body.brand?.trim() || null;
          const newModel = body.model?.trim() || null;
          if (existing.length > 0) {
            const ex = existing[0];
            // Fill brand/model only when the row is still blank — never
            // overwrite details already on file (a matched car uses its own
            // edit flow). COALESCE keeps existing values when present.
            await tx.execute(sql`
              UPDATE cars SET
                customer_id  = COALESCE(customer_id, ${posCustomerId}),
                brand        = COALESCE(brand, ${newBrand}),
                model        = COALESCE(model, ${newModel}),
                last_seen_at = now()
               WHERE id = ${ex.id}
            `);
            resolvedVehicleId = ex.id;
            if (!posCustomerId && ex.customer_id) posCustomerId = ex.customer_id;
          } else {
            // Brand-new plate ("first timer", no data on file). The cashier
            // must record the car's brand + model so the new cars row carries
            // those details forward to the customer when they later claim the
            // plate. Mirrors the client-side gate; enforced here so the rule
            // can't be bypassed by a direct API call.
            if (!newBrand || !newModel) {
              throw new PosOrderError(400, 'car_details_required');
            }
            const ins = (await tx.execute(sql`
              INSERT INTO cars (license_plate, customer_id, brand, model, last_seen_at)
              VALUES (${plateUpper}, ${posCustomerId ?? null},
                      ${newBrand}, ${newModel}, now())
              RETURNING id
            `)).rows[0] as any;
            resolvedVehicleId = ins.id;
          }
        }

        // 6. Membership redemption (if payment_method='subscription').
        // We lock the membership row FOR UPDATE so concurrent redemptions
        // can't double-spend the last wash. The check enforces:
        //   - membership exists, status='active', remaining_washes > 0
        //   - belongs to the resolved customer
        //   - if pinned to a vehicle, that vehicle matches this order's car
        //   - if expires_at set, hasn't expired
        let redeemMembership: {
          id: string;
          kind: 'pack' | 'unlimited';
          remaining: number;
          total: number;
        } | null = null;
        let discountCents = 0;
        let promoDiscountCents = 0;
        let appliedDiscountId: string | null = null;
        let appliedPromoId: string | null = null;
        let chargedTotal = subtotal;
        if (body.payment_method === 'subscription') {
          if (!body.membership_id) {
            throw new PosOrderError(400, 'membership_id_required');
          }
          if (!posCustomerId) {
            throw new PosOrderError(400, 'membership_needs_customer');
          }
          const mRows = (await tx.execute(sql`
            SELECT id, customer_id, vehicle_id, kind, total_washes, remaining_washes, status, expires_at
              FROM memberships
             WHERE id = ${body.membership_id}
             FOR UPDATE
          `)).rows as Array<{
            id: string; customer_id: number; vehicle_id: number | null;
            kind: 'pack' | 'unlimited';
            total_washes: number; remaining_washes: number;
            status: string; expires_at: string | null;
          }>;
          if (mRows.length === 0) throw new PosOrderError(404, 'membership_not_found');
          const m = mRows[0];
          if (m.customer_id !== posCustomerId) throw new PosOrderError(403, 'membership_wrong_customer');
          if (m.status !== 'active') throw new PosOrderError(409, 'membership_not_active');
          if (m.expires_at && new Date(m.expires_at) < new Date()) {
            throw new PosOrderError(409, 'membership_expired');
          }
          if (m.vehicle_id != null && m.vehicle_id !== resolvedVehicleId) {
            throw new PosOrderError(409, 'membership_wrong_vehicle');
          }
          // The packageless one-tap path is for unlimited plans only —
          // a wash-pack redemption must still go through a real package.
          if (isUnlimitedOneTap && m.kind !== 'unlimited') {
            throw new PosOrderError(400, 'unlimited_required');
          }
          // Kind-specific gating:
          //   * pack      → must have washes left; decrement after redeem.
          //   * unlimited → time-bound only; no count check, no decrement.
          if (m.kind === 'pack' && m.remaining_washes <= 0) {
            throw new PosOrderError(409, 'membership_exhausted');
          }
          redeemMembership = {
            id: m.id, kind: m.kind,
            remaining: m.remaining_washes, total: m.total_washes,
          };
          // Pack covers the full subtotal (incl. addons) — same Phase 2
          // simplification as before; applies to both kinds.
          discountCents = subtotal;
          chargedTotal = 0;
          // A free (membership) wash already zeroes the subtotal — stacking
          // a discount/promo on top is meaningless and could underflow.
          if (body.discount_id || body.promo_code) {
            throw new PosOrderError(400, 'discount_not_allowed_on_subscription');
          }
        } else {
          // 6.1 POS Control Room — checkout discount + promo (normal orders).
          // Both are recomputed here off the server-side subtotal; never trust
          // client amounts. discount is clamped to the subtotal, then promo is
          // clamped to whatever's left, so the total can never go negative.
          if (body.discount_id) {
            const dRows = (await tx.execute(sql`
              SELECT id, kind, value FROM discounts
               WHERE id = ${body.discount_id} AND is_active = true
               LIMIT 1
            `)).rows as Array<{ id: string; kind: 'percent' | 'fixed'; value: number }>;
            if (dRows.length === 0) throw new PosOrderError(400, 'discount_not_available');
            const d = dRows[0];
            const raw = d.kind === 'percent'
              ? Math.round((subtotal * d.value) / 100)
              : d.value;
            discountCents = Math.max(0, Math.min(raw, subtotal));
            appliedDiscountId = d.id;
          }
          if (body.promo_code) {
            // Lock the promo row FOR UPDATE so concurrent checkouts can't
            // blow past max_uses. Re-validate everything inside the lock.
            const pRows = (await tx.execute(sql`
              SELECT id, kind, value, is_active, starts_at, expires_at, max_uses, used_count
                FROM promo_codes
               WHERE code = ${body.promo_code.toUpperCase().replace(/\s+/g, '')}
               FOR UPDATE
            `)).rows as Array<{
              id: string; kind: 'percent' | 'fixed'; value: number;
              is_active: boolean; starts_at: string | null; expires_at: string | null;
              max_uses: number | null; used_count: number;
            }>;
            if (pRows.length === 0) throw new PosOrderError(400, 'promo_not_found');
            const pr = pRows[0];
            const now = new Date();
            if (!pr.is_active) throw new PosOrderError(400, 'promo_inactive');
            if (pr.starts_at && new Date(pr.starts_at) > now) throw new PosOrderError(400, 'promo_not_started');
            if (pr.expires_at && new Date(pr.expires_at) < now) throw new PosOrderError(400, 'promo_expired');
            if (pr.max_uses != null && pr.used_count >= pr.max_uses) throw new PosOrderError(409, 'promo_exhausted');
            const raw = pr.kind === 'percent'
              ? Math.round((subtotal * pr.value) / 100)
              : pr.value;
            const room = subtotal - discountCents;
            promoDiscountCents = Math.max(0, Math.min(raw, room));
            appliedPromoId = pr.id;
            await tx.execute(sql`
              UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ${pr.id}
            `);
          }
          chargedTotal = Math.max(0, subtotal - discountCents - promoDiscountCents);
        }

        // 6.5 Phase 8: tag the order with the cashier's open shift
        // (best-effort — orders without an open shift still go through).
        // Match must be both staff AND branch: a manager who opened a
        // shift at branch A and is now ringing at branch B shouldn't
        // pollute A's drawer reconciliation.
        const shiftRows = (await tx.execute(sql`
          SELECT id FROM cashier_shifts
           WHERE opened_by_staff_id = ${staffId}
             AND branch_id = ${effectiveBranchId}
             AND status = 'open'
           LIMIT 1
        `)).rows as Array<{ id: number }>;
        const shiftIdForOrder: number | null = shiftRows[0]?.id ?? null;

        // 6.6 Cash reconciliation. The cashier may pass the cash tendered
        // (`paid_amount_cents`); when omitted we record an exact payment.
        // Change is always derived server-side and never trusted from the
        // client. Clamped at 0 so an underpayment can't print as negative.
        // Subscription (free) washes take no payment, so leave both null/0
        // — receipts then omit the Paid/Change lines for those orders.
        const paidAmountCents =
          body.payment_method === 'subscription'
            ? null
            : body.paid_amount_cents != null
              ? body.paid_amount_cents
              : chargedTotal;
        const changeCents =
          paidAmountCents == null
            ? 0
            : Math.max(0, paidAmountCents - chargedTotal);

        // 7. Insert order.
        const orderId = `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        await tx.execute(sql`
          INSERT INTO orders (
            id, branch_id, staff_id, plate,
            package_id, package_name, package_price_cents,
            addons, subtotal_cents, total_cents,
            discount_cents, promo_discount_cents, discount_id, promo_code_id,
            payment_method, qr_provider, payment_ref,
            paid_amount_cents, change_cents,
            ticket_code, status,
            order_notes, item_notes,
            vehicle_id, customer_name_walkin,
            shift_id
          ) VALUES (
            ${orderId}, ${effectiveBranchId}, ${staffId}, ${plateUpper},
            ${pkg.id}, ${pkg.name}, ${pkg.price_cents},
            ${JSON.stringify(addonSnapshots)}::jsonb, ${subtotal}, ${chargedTotal},
            ${discountCents}, ${promoDiscountCents}, ${appliedDiscountId}, ${appliedPromoId},
            ${body.payment_method}, ${(body.payment_method === 'qr_code' || body.payment_method === 'bank_transfer') ? (body.qr_provider ?? null) : null}, ${body.payment_method === 'cash' ? null : (body.payment_ref ?? null)},
            ${paidAmountCents}, ${changeCents},
            ${ticketCode}, 'queued',
            ${body.order_notes ?? null}, ${body.item_notes ?? null},
            ${resolvedVehicleId}, ${walkinName},
            ${shiftIdForOrder}
          )
        `);

        // 8. Record redemption. For 'pack' kind we also decrement and
        //    flip status at zero; for 'unlimited' the audit row alone
        //    is the trail (no count, no status change — expiry handles
        //    end-of-life via a future cron or just the next redemption
        //    attempt rejecting on expires_at).
        if (redeemMembership) {
          const redemptionId = `red_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          await tx.execute(sql`
            INSERT INTO membership_redemptions (id, membership_id, order_id, staff_id)
            VALUES (${redemptionId}, ${redeemMembership.id}, ${orderId}, ${staffId})
          `);
          if (redeemMembership.kind === 'pack') {
            const newRemaining = redeemMembership.remaining - 1;
            await tx.execute(sql`
              UPDATE memberships
                 SET remaining_washes = ${newRemaining},
                     status = ${newRemaining === 0 ? 'exhausted' : 'active'}
               WHERE id = ${redeemMembership.id}
            `);
          }
        }

        return {
          orderId, ticketCode, pkg, addonSnapshots, subtotal,
          chargedTotal, discountCents, promoDiscountCents, redeemMembership,
          paidAmountCents, changeCents,
        };
      });

      res.status(201).json({
        ok: true,
        order: {
          id: result.orderId,
          ticket_code: result.ticketCode,
          branch_id: effectiveBranchId,
          plate: body.plate.toUpperCase(),
          package_name: result.pkg.name,
          package_price_cents: result.pkg.price_cents,
          addons: result.addonSnapshots,
          subtotal_cents: result.subtotal,
          total_cents: result.chargedTotal,
          discount_cents: result.discountCents,
          promo_discount_cents: result.promoDiscountCents,
          paid_amount_cents: result.paidAmountCents,
          change_cents: result.changeCents,
          payment_method: body.payment_method,
          qr_provider: body.payment_method === 'qr_code' ? (body.qr_provider ?? null) : null,
          status: 'queued',
          membership: result.redeemMembership
            ? {
                id: result.redeemMembership.id,
                kind: result.redeemMembership.kind,
                remaining_washes:
                  result.redeemMembership.kind === 'pack'
                    ? result.redeemMembership.remaining - 1
                    : result.redeemMembership.remaining,
                total_washes: result.redeemMembership.total,
              }
            : null,
        },
      });
    } catch (err: any) {
      if (err instanceof PosOrderError) {
        return res.status(err.status).json({ error: err.code });
      }
      // Most likely failure mode: a near-simultaneous insert grabbed the
      // same ticket sequence. Surface a 409 so the client can retry.
      if (err?.code === '23505') {
        console.warn('[pos.orders] ticket collision, advise retry');
        return res.status(409).json({ error: 'ticket_collision_retry' });
      }
      console.error('[pos.orders] failed:', err);
      res.status(500).json({ error: 'Failed to create order' });
    }
  });

  // POST /api/pos/orders/:id/refund — Phase 4 full-order refund.
  //
  // Decisions (owner, 2026-05-04):
  //   * Any staff can refund — no manager PIN gate.
  //   * Full order only (no partials).
  //   * Subscription orders DO NOT credit the wash back to the
  //     pack — the redemption stays consumed. Refund just marks
  //     the order line as refunded for reporting.
  //
  // Branch authorisation mirrors POST /api/pos/orders. Runs in a
  // transaction with FOR UPDATE so two cashiers can't double-
  // refund the same row.
  app.post('/api/pos/orders/:id/refund', requireStaff, requireStaffRole('owner', 'manager', 'lane', 'cashier'), async (req, res) => {
    const orderId = String(req.params.id ?? '');
    if (!orderId) return res.status(400).json({ error: 'invalid_id' });

    const schema = z.object({
      reason: z.string().trim().max(500).optional().nullable(),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_request' });
    }
    const reason = parsed.data.reason?.trim() || null;

    const staffUser = req.staff!.user as any;
    const staffId = staffUser.id as string;
    const staffRole = staffUser.role as 'owner' | 'manager' | 'lane' | 'cashier';
    const staffBranchId = staffUser.branchId as number | null;

    try {
      const updated = await db.transaction(async (tx) => {
        const rows = (await tx.execute(sql`
          SELECT id, branch_id, status, total_cents
            FROM orders
           WHERE id = ${orderId}
           FOR UPDATE
        `)).rows as Array<{ id: string; branch_id: number; status: string; total_cents: number }>;
        if (rows.length === 0) {
          throw Object.assign(new Error('not_found'), { httpStatus: 404 });
        }
        const o = rows[0];

        // Lane/cashier can only refund orders at their own branch.
        if (staffRole !== 'owner' && staffRole !== 'manager') {
          if (staffBranchId == null || o.branch_id !== staffBranchId) {
            throw Object.assign(new Error('branch_mismatch'), { httpStatus: 403 });
          }
        }

        if (o.status === 'refunded') {
          throw Object.assign(new Error('already_refunded'), { httpStatus: 409 });
        }

        const upd = (await tx.execute(sql`
          UPDATE orders
             SET status               = 'refunded',
                 refunded_at          = now(),
                 refunded_by_staff_id = ${staffId},
                 refund_reason        = ${reason}
           WHERE id = ${orderId}
       RETURNING id, ticket_code, plate, package_name, total_cents,
                 payment_method, status, created_at, refunded_at, refund_reason
        `)).rows[0];
        return upd;
      });
      res.json({ ok: true, order: updated });
    } catch (err: any) {
      const status = err?.httpStatus ?? 500;
      const code = err?.message ?? 'refund_failed';
      if (status === 500) console.error('[pos.orders.refund] failed:', err);
      res.status(status).json({ error: code });
    }
  });

  // ==========================================================================
  // PATCH /api/pos/orders/:id/status — Phase 12d: Lane control.
  //
  // Lane staff advance an order through the wash lifecycle:
  //   queued  -> washing    (start the wash)
  //   washing -> done       (car drove out)
  //
  // Strict state machine. No skipping (queued -> done), no rewinding
  // (done -> washing), no touching closed states (refunded, voided,
  // pending_payment). Lane/cashier are LOCKED to their own branch;
  // owner/manager can advance any branch's orders.
  //
  // Wrapped in a FOR UPDATE transaction so two phones tapping
  // "Start wash" at the same instant produce one transition + one
  // 409 instead of corrupting the row.
  // ==========================================================================
  app.patch('/api/pos/orders/:id/status', requireStaff, requireStaffRole('owner', 'manager', 'lane', 'cashier'), async (req, res) => {
    const orderId = String(req.params.id);
    const to = String(req.body?.to ?? '');
    // queued: send a car already washing back into the queue (lane-control
    // fix for a mid-wash refund + re-entry). queued <-> washing -> done.
    if (to !== 'washing' && to !== 'done' && to !== 'queued') {
      return res.status(400).json({ error: 'invalid_target_status' });
    }
    const requiredFrom = to === 'washing' ? 'queued' : 'washing';

    const staffUser = req.staff!.user as any;
    const staffRole = staffUser.role as 'owner' | 'manager' | 'lane' | 'cashier';
    const staffBranchId = staffUser.branchId as number | null;

    try {
      const updated = await db.transaction(async (tx) => {
        const rows = (await tx.execute(sql`
          SELECT id, branch_id, status, ticket_code, plate, package_name
            FROM orders
           WHERE id = ${orderId}
           FOR UPDATE
        `)).rows as Array<{ id: string; branch_id: number; status: string; ticket_code: string | null; plate: string; package_name: string }>;

        if (rows.length === 0) {
          throw Object.assign(new Error('not_found'), { httpStatus: 404 });
        }
        const o = rows[0];

        // Branch lock for lane/cashier.
        if (staffRole !== 'owner' && staffRole !== 'manager') {
          if (staffBranchId == null || o.branch_id !== staffBranchId) {
            throw Object.assign(new Error('branch_mismatch'), { httpStatus: 403 });
          }
        }

        // Idempotent: already in the target state — return the row, no-op.
        if (o.status === to) {
          return { ...o, status: o.status, no_op: true };
        }

        // Strict transition gate.
        if (o.status !== requiredFrom) {
          throw Object.assign(
            new Error(`invalid_transition_from_${o.status}`),
            { httpStatus: 409 },
          );
        }

        // When pulling a washing car back into the queue, slot it at the
        // front (it was already being served), ahead of every other queued
        // car at this branch. Otherwise leave queue_position untouched.
        const r = (to === 'queued'
          ? (await tx.execute(sql`
              UPDATE orders
                 SET status = ${to},
                     queue_position = COALESCE((
                       SELECT MIN(queue_position) FROM orders
                        WHERE branch_id = ${o.branch_id} AND status = 'queued'
                     ), 0) - 1
               WHERE id = ${orderId}
                 AND status = ${requiredFrom}
              RETURNING id, branch_id, status, ticket_code, plate, package_name
            `)).rows
          : (await tx.execute(sql`
              UPDATE orders
                 SET status = ${to}
               WHERE id = ${orderId}
                 AND status = ${requiredFrom}
              RETURNING id, branch_id, status, ticket_code, plate, package_name
            `)).rows) as any[];

        if (r.length === 0) {
          // Lost the race. Re-read for a clean error.
          throw Object.assign(new Error('race_lost'), { httpStatus: 409 });
        }
        return { ...r[0], no_op: false };
      });

      res.json({ ok: true, order: updated });
    } catch (err: any) {
      const status = err?.httpStatus ?? 500;
      const code = err?.message ?? 'status_update_failed';
      if (status === 500) console.error('[pos.orders.status] failed:', err);
      res.status(status).json({ error: code });
    }
  });

  // ==========================================================================
  // PATCH /api/pos/branch/status — cashier-controlled branch availability.
  //
  // Body: { status: 'open'|'closed'|'maintenance'|'busy', note?: string,
  //         branch_id?: number }
  // Lane/cashier are LOCKED to their own branch (branch_id is ignored for
  // them). Owner/manager may target any branch via branch_id, defaulting to
  // their own. is_open is kept in sync (open/busy => true, else false).
  // The optional note is a short, customer-facing reason shown on the live
  // queue (empty/omitted clears it).
  // ==========================================================================
  app.patch('/api/pos/branch/status', requireStaff, requireStaffRole('owner', 'manager', 'lane', 'cashier'), async (req, res) => {
    const staffUser = req.staff!.user as any;
    const staffRole = staffUser.role as 'owner' | 'manager' | 'lane' | 'cashier';
    const staffBranchId = staffUser.branchId as number | null;

    const status = String(req.body?.status ?? '');
    if (!(BRANCH_STATUSES as readonly string[]).includes(status)) {
      return res.status(400).json({ error: 'invalid_status' });
    }
    const rawNote = req.body?.note;
    if (rawNote != null && typeof rawNote !== 'string') {
      return res.status(400).json({ error: 'invalid_note' });
    }
    const note = typeof rawNote === 'string' && rawNote.trim().length > 0
      ? rawNote.trim().slice(0, 160)
      : null;

    // Resolve the target branch with the lane/cashier lock.
    const isPrivileged = staffRole === 'owner' || staffRole === 'manager';
    const bodyBranchId = Number(req.body?.branch_id);
    let targetBranchId: number | null;
    if (isPrivileged) {
      targetBranchId = Number.isFinite(bodyBranchId) && bodyBranchId > 0
        ? bodyBranchId
        : staffBranchId;
    } else {
      targetBranchId = staffBranchId;
    }
    if (targetBranchId == null) {
      return res.status(400).json({ error: 'no_branch' });
    }

    const isOpen = isOpenForStatus(status);
    try {
      const rows = (await db.execute(sql`
        UPDATE branches
           SET status = ${status}, status_note = ${note}, is_open = ${isOpen}
         WHERE id = ${targetBranchId}
        RETURNING id, name, is_open, status, status_note
      `)).rows;
      if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true, branch: rows[0] });
    } catch (err) {
      console.error('[pos.branch.status] failed:', err);
      res.status(500).json({ error: 'status_update_failed' });
    }
  });

  // ==========================================================================
  // Loyalty — staff "verify physical receipt & add stamps" (digital-receipt
  // migration backstop). Staff check a customer's paper B$12 receipts and
  // credit the matching number of stamps to a plate, tagged to a branch.
  // Auto-count (real orders by plate) stays the baseline; manual stamps add on
  // top. Open to owner/manager/cashier so cashiers can credit at the POS;
  // every credit records the staff id and branch for the audit trail.
  // ==========================================================================
  const LOYALTY_PLATE_NORM = (s: string) => s.toUpperCase().replace(/\s+/g, "");

  // GET /api/pos/loyalty/lookup?plate=  → current stamp picture for a plate so
  // staff don't double-credit washes that already auto-counted.
  // Staff (owner/manager/cashier): cashiers credit physical receipts at the POS.
  app.get('/api/pos/loyalty/lookup', requireStaff, requireStaffRole('owner', 'manager', 'cashier'), async (req, res) => {
    const raw = String(req.query.plate ?? '').trim();
    if (!raw) return res.status(400).json({ error: 'plate_required' });
    const norm = LOYALTY_PLATE_NORM(raw);
    try {
      const car = (await db.execute(sql`
        SELECT id, license_plate, brand, model FROM cars
         WHERE REGEXP_REPLACE(UPPER(license_plate), '\s+', '', 'g') = ${norm}
         LIMIT 1
      `)).rows[0] as { id: number; license_plate: string; brand: string | null; model: string | null } | undefined;
      const carId = car?.id ?? null;

      // Auto stamps: eligible paid B$12 orders for this plate, not yet consumed.
      // Same attribution as the customer card: vehicle_id FK wins; plate fallback
      // only when vehicle_id IS NULL.
      const autoRow = (await db.execute(sql`
        SELECT COUNT(*)::int AS n FROM orders o
         WHERE o.package_id           = ${LOYALTY_PKG_ID}
           AND o.loyalty_consumed_in IS NULL
           AND o.status               IN ('paid','queued','washing','done')
           AND NOT (o.payment_method  = 'voucher' AND o.qr_provider = 'loyalty')
           AND o.id NOT IN (SELECT order_id FROM membership_redemptions)
           AND o.created_at           >= ${LOYALTY_COLLECTION_START}
           AND (
                 (${carId}::int IS NOT NULL AND o.vehicle_id = ${carId})
                 OR (o.vehicle_id IS NULL
                     AND REGEXP_REPLACE(UPPER(o.plate), '\s+', '', 'g') = ${norm})
               )
      `)).rows[0] as { n: number };

      const manualRow = (await db.execute(sql`
        SELECT COALESCE(SUM(stamps_remaining), 0)::int AS n FROM loyalty_manual_stamps
         WHERE stamps_remaining > 0
           AND (
                 (${carId}::int IS NOT NULL AND vehicle_id = ${carId})
                 OR (vehicle_id IS NULL AND plate_norm = ${norm})
               )
      `)).rows[0] as { n: number };

      const auto = Number(autoRow?.n ?? 0);
      const manual = Number(manualRow?.n ?? 0);
      const total = auto + manual;

      // Full audit trail of manual credits for this plate (newest first) so
      // staff can see each credit's date / branch / receipt / note and remove
      // a mistaken one. `deletable` is decided server-side: a credit can be
      // removed only if none of it has been used toward a redeemed reward
      // (stamps_remaining === stamps_total) and — for branch-locked cashiers —
      // only if it belongs to their own branch. Owners/managers may remove any.
      const staffUser = req.staff!.user as any;
      const staffRole = String(staffUser.role);
      const staffBranchId = (staffUser.branchId ?? null) as number | null;
      const isPrivileged = staffRole === 'owner' || staffRole === 'manager';
      const entryRows = (await db.execute(sql`
        SELECT lms.id, lms.created_at, lms.stamps_total, lms.stamps_remaining,
               lms.note, lms.receipt_no, lms.branch_id,
               b.name AS branch_name, s.name AS staff_name
          FROM loyalty_manual_stamps lms
          LEFT JOIN branches b ON b.id = lms.branch_id
          LEFT JOIN staff s ON s.id = lms.staff_id
         WHERE (${carId}::int IS NOT NULL AND lms.vehicle_id = ${carId})
            OR (lms.vehicle_id IS NULL AND lms.plate_norm = ${norm})
         ORDER BY lms.created_at DESC
      `)).rows as Array<{
        id: string; created_at: string; stamps_total: number; stamps_remaining: number;
        note: string | null; receipt_no: string | null; branch_id: number | null;
        branch_name: string | null; staff_name: string | null;
      }>;
      const manual_entries = entryRows.map((e) => {
        const total = Number(e.stamps_total);
        const remaining = Number(e.stamps_remaining);
        let deletable = true;
        let reason: string | null = null;
        if (remaining < total) { deletable = false; reason = 'used'; }
        else if (!isPrivileged && e.branch_id !== staffBranchId) { deletable = false; reason = 'other_branch'; }
        return {
          id: e.id,
          created_at: e.created_at,
          stamps_total: total,
          stamps_remaining: remaining,
          note: e.note,
          receipt_no: e.receipt_no,
          branch_id: e.branch_id,
          branch_name: e.branch_name,
          staff_name: e.staff_name,
          deletable,
          reason,
        };
      });

      res.json({
        plate: car?.license_plate ?? raw,
        vehicle_id: carId,
        brand: car?.brand ?? null,
        model: car?.model ?? null,
        auto_stamps: auto,
        manual_stamps: manual,
        total_stamps: total,
        required: LOYALTY_REQUIRED_COUNT,
        can_redeem: total >= LOYALTY_REQUIRED_COUNT,
        manual_entries,
      });
    } catch (err) {
      console.error('[pos.loyalty.lookup] failed:', err);
      res.status(500).json({ error: 'lookup_failed' });
    }
  });

  // POST /api/pos/loyalty/stamp  Body: { plate, count, note?, receipt_no?, branch_id }
  // Staff (owner/manager/cashier). Credits `count` manual stamps to a plate,
  // tagged to a branch for audit. Owners/managers have no fixed branch so they
  // pass branch_id explicitly; cashiers/lane are pinned to their own branch
  // server-side and any body branch_id is ignored.
  const manualStampSchema = z.object({
    plate: z.string().trim().min(1).max(20),
    count: z.coerce.number().int().min(1).max(4),
    note: z.string().trim().max(160).optional().nullable(),
    receipt_no: z.string().trim().max(40).optional().nullable(),
  });
  app.post('/api/pos/loyalty/stamp', requireStaff, requireStaffRole('owner', 'manager', 'cashier'), async (req, res) => {
    const parsed = manualStampSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
    const staffUser = req.staff!.user as any;
    const staffId = String(staffUser.id);
    const staffRole = staffUser.role as 'owner' | 'manager' | 'lane' | 'cashier';
    const staffBranchId = staffUser.branchId as number | null;

    // Branch-locked, mirroring PATCH /api/pos/branch/status: lane/cashier are
    // pinned to their own branch; owner/manager may target another branch via
    // body.branch_id. The credit MUST carry a resolved branch for audit.
    const isPrivileged = staffRole === 'owner' || staffRole === 'manager';
    const bodyBranchId = Number(req.body?.branch_id);
    const branchId = isPrivileged && Number.isFinite(bodyBranchId) && bodyBranchId > 0
      ? bodyBranchId
      : staffBranchId;
    if (branchId == null) {
      return res.status(400).json({ error: 'no_branch' });
    }
    const branchExists = (await db.execute(sql`
      SELECT 1 FROM branches WHERE id = ${branchId} LIMIT 1
    `)).rows.length > 0;
    if (!branchExists) {
      return res.status(400).json({ error: 'invalid_branch' });
    }

    const { plate, count } = parsed.data;
    const note = parsed.data.note && parsed.data.note.length > 0 ? parsed.data.note : null;
    const receiptNo = parsed.data.receipt_no && parsed.data.receipt_no.length > 0 ? parsed.data.receipt_no : null;
    const norm = LOYALTY_PLATE_NORM(plate);

    try {
      const car = (await db.execute(sql`
        SELECT id FROM cars
         WHERE REGEXP_REPLACE(UPPER(license_plate), '\s+', '', 'g') = ${norm}
         LIMIT 1
      `)).rows[0] as { id: number } | undefined;
      const vehicleId = car?.id ?? null;

      const id = `lms_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      await db.execute(sql`
        INSERT INTO loyalty_manual_stamps
          (id, vehicle_id, plate, plate_norm, stamps_total, stamps_remaining,
           note, receipt_no, branch_id, staff_id)
        VALUES
          (${id}, ${vehicleId}, ${plate.toUpperCase()}, ${norm}, ${count}, ${count},
           ${note}, ${receiptNo}, ${branchId}, ${staffId})
      `);

      // Recompute the plate's total for the response so the cashier sees the
      // new running count immediately.
      const autoRow = (await db.execute(sql`
        SELECT COUNT(*)::int AS n FROM orders o
         WHERE o.package_id           = ${LOYALTY_PKG_ID}
           AND o.loyalty_consumed_in IS NULL
           AND o.status               IN ('paid','queued','washing','done')
           AND NOT (o.payment_method  = 'voucher' AND o.qr_provider = 'loyalty')
           AND o.id NOT IN (SELECT order_id FROM membership_redemptions)
           AND o.created_at           >= ${LOYALTY_COLLECTION_START}
           AND (
                 (${vehicleId}::int IS NOT NULL AND o.vehicle_id = ${vehicleId})
                 OR (o.vehicle_id IS NULL
                     AND REGEXP_REPLACE(UPPER(o.plate), '\s+', '', 'g') = ${norm})
               )
      `)).rows[0] as { n: number };
      const manualRow = (await db.execute(sql`
        SELECT COALESCE(SUM(stamps_remaining), 0)::int AS n FROM loyalty_manual_stamps
         WHERE stamps_remaining > 0
           AND (
                 (${vehicleId}::int IS NOT NULL AND vehicle_id = ${vehicleId})
                 OR (vehicle_id IS NULL AND plate_norm = ${norm})
               )
      `)).rows[0] as { n: number };

      const auto = Number(autoRow?.n ?? 0);
      const manual = Number(manualRow?.n ?? 0);
      res.status(201).json({
        ok: true,
        added: count,
        auto_stamps: auto,
        manual_stamps: manual,
        total_stamps: auto + manual,
        required: LOYALTY_REQUIRED_COUNT,
        can_redeem: auto + manual >= LOYALTY_REQUIRED_COUNT,
      });
    } catch (err) {
      console.error('[pos.loyalty.stamp] failed:', err);
      res.status(500).json({ error: 'stamp_failed' });
    }
  });

  // DELETE /api/pos/loyalty/stamp/:id — remove a mistaken manual credit.
  // Staff (owner/manager/cashier). Guards:
  //  * Only credits with NOTHING used toward a redeemed reward can be removed
  //    (stamps_remaining === stamps_total). The WHERE re-checks this atomically
  //    so a concurrent redemption can't slip a used credit out from under us.
  //  * Cashiers are branch-locked: they can only remove credits from their own
  //    branch. Owners/managers may remove any branch's credit.
  app.delete('/api/pos/loyalty/stamp/:id', requireStaff, requireStaffRole('owner', 'manager', 'cashier'), async (req, res) => {
    const id = String(req.params.id ?? '').trim();
    if (!id) return res.status(400).json({ error: 'id_required' });
    const staffUser = req.staff!.user as any;
    const staffRole = String(staffUser.role);
    const staffBranchId = (staffUser.branchId ?? null) as number | null;
    const isPrivileged = staffRole === 'owner' || staffRole === 'manager';
    try {
      const row = (await db.execute(sql`
        SELECT id, stamps_total, stamps_remaining, branch_id
          FROM loyalty_manual_stamps WHERE id = ${id} LIMIT 1
      `)).rows[0] as { id: string; stamps_total: number; stamps_remaining: number; branch_id: number | null } | undefined;
      if (!row) return res.status(404).json({ error: 'not_found' });
      if (Number(row.stamps_remaining) !== Number(row.stamps_total)) {
        return res.status(409).json({ error: 'already_used' });
      }
      if (!isPrivileged && row.branch_id !== staffBranchId) {
        return res.status(403).json({ error: 'other_branch' });
      }
      const deleted = (await db.execute(sql`
        DELETE FROM loyalty_manual_stamps
         WHERE id = ${id} AND stamps_remaining = stamps_total
        RETURNING id
      `)).rows[0];
      if (!deleted) return res.status(409).json({ error: 'already_used' });
      res.json({ ok: true });
    } catch (err) {
      console.error('[pos.loyalty.stamp.delete] failed:', err);
      res.status(500).json({ error: 'delete_failed' });
    }
  });

  // POST /api/pos/loyalty/redeem  Body: { plate, branch_id? }
  // Staff (owner/manager/cashier) claim a plate's ready free wash AT THE LANE.
  // Unlike the customer self-redeem (which creates a branchless voucher for the
  // customer to scan later), this consumes 4 stamps AND queues the B$0 free
  // wash immediately at the resolved branch with a T-NNN ticket — the car is
  // right there. Cashiers are branch-pinned; owner/manager pass branch_id.
  // The plate need NOT belong to a registered account (walk-in cars welcome),
  // so the redemption's customer_user_id may be null.
  const posRedeemSchema = z.object({ plate: z.string().trim().min(1).max(20) });
  app.post('/api/pos/loyalty/redeem', requireStaff, requireStaffRole('owner', 'manager', 'cashier'), async (req, res) => {
    const parsed = posRedeemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
    const staffUser = req.staff!.user as any;
    const staffRole = String(staffUser.role);
    const staffBranchId = (staffUser.branchId ?? null) as number | null;
    const isPrivileged = staffRole === 'owner' || staffRole === 'manager';

    const bodyBranchId = Number(req.body?.branch_id);
    const branchId = isPrivileged && Number.isFinite(bodyBranchId) && bodyBranchId > 0
      ? bodyBranchId
      : staffBranchId;
    if (branchId == null) return res.status(400).json({ error: 'no_branch' });

    const { plate } = parsed.data;
    const norm = LOYALTY_PLATE_NORM(plate);

    // Allocate the next T-NNN for a branch + today (UTC) — same algorithm as
    // /api/verify-qr and /api/pos/orders so prepaid + walk-in tickets share one
    // stream.
    const allocateTicket = async (tx: any, brId: number) => {
      const seqRow = (await tx.execute(sql`
        SELECT COALESCE(
          MAX( NULLIF(regexp_replace(ticket_code, '\\D', '', 'g'), '')::int ),
          0
        ) + 1 AS next_seq
          FROM orders
         WHERE branch_id = ${brId}
           AND ticket_day = (now() AT TIME ZONE 'UTC')::date
      `)).rows as Array<{ next_seq: number }>;
      const seq = seqRow[0]?.next_seq ?? 1;
      return `T-${String(seq).padStart(3, '0')}`;
    };

    try {
      const branchRow = (await db.execute(sql`
        SELECT name FROM branches WHERE id = ${branchId} LIMIT 1
      `)).rows[0] as { name: string } | undefined;
      if (!branchRow) return res.status(400).json({ error: 'invalid_branch' });

      const out = await db.transaction(async (tx) => {
        // 1. Resolve + lock the car row (if the plate is known) so concurrent
        //    claims for the same plate serialize. Walk-in plates may have no
        //    car row — then attribution falls back to plate_norm.
        const car = (await tx.execute(sql`
          SELECT id, license_plate, user_id FROM cars
           WHERE REGEXP_REPLACE(UPPER(license_plate), '\s+', '', 'g') = ${norm}
           LIMIT 1
           FOR UPDATE
        `)).rows[0] as { id: number; license_plate: string; user_id: number | null } | undefined;
        const vehicleId = car?.id ?? null;
        const carPlate = car?.license_plate ?? plate.toUpperCase();
        const ownerUserId = car?.user_id ?? null;

        // 2. If a free-wash voucher is already pending for this car/plate (e.g.
        //    the customer redeemed in the app but hasn't scanned yet), just
        //    queue THAT voucher — don't consume more stamps.
        const pending = (await tx.execute(sql`
          SELECT id, payment_ref FROM orders
           WHERE qr_provider = 'loyalty'
             AND status      = 'paid'
             AND ticket_code IS NULL
             AND (
                   (${vehicleId}::int IS NOT NULL AND vehicle_id = ${vehicleId})
                   OR (vehicle_id IS NULL
                       AND REGEXP_REPLACE(UPPER(plate), '\s+', '', 'g') = ${norm})
                 )
           ORDER BY created_at ASC
           LIMIT 1
           FOR UPDATE
        `)).rows[0] as { id: string; payment_ref: string | null } | undefined;

        if (pending) {
          const ticketCode = await allocateTicket(tx, branchId);
          await tx.execute(sql`
            UPDATE orders
               SET branch_id  = ${branchId},
                   ticket_code = ${ticketCode},
                   status      = 'queued',
                   claimed_at  = COALESCE(claimed_at, now()),
                   ticket_day  = (now() AT TIME ZONE 'UTC')::date
             WHERE id = ${pending.id}
          `);
          if (pending.payment_ref) {
            await tx.execute(sql`
              UPDATE loyalty_redemptions SET branch_id = ${branchId}
               WHERE voucher_order_id = ${pending.id}
            `);
          }
          return { http: 200, body: { ok: true, ticket_code: ticketCode, plate: carPlate, package_name: LOYALTY_VOUCHER_NAME, branch_id: branchId, branch_name: branchRow.name, reused_pending: true } };
        }

        // 3. Recount eligible real orders (oldest-first) + manual stamps, all
        //    locked. Same attribution / filters as the customer redeem.
        const eligibleRows = (await tx.execute(sql`
          SELECT id FROM orders
           WHERE (
                   (${vehicleId}::int IS NOT NULL AND vehicle_id = ${vehicleId})
                   OR (vehicle_id IS NULL
                       AND REGEXP_REPLACE(UPPER(plate), '\s+', '', 'g') = ${norm})
                 )
             AND package_id           = ${LOYALTY_PKG_ID}
             AND loyalty_consumed_in IS NULL
             AND status               IN ('paid','queued','washing','done')
             AND NOT (payment_method  = 'voucher' AND qr_provider = 'loyalty')
             AND id NOT IN (SELECT order_id FROM membership_redemptions)
             AND created_at           >= ${LOYALTY_COLLECTION_START}
           ORDER BY created_at ASC
           LIMIT ${LOYALTY_REQUIRED_COUNT}
           FOR UPDATE
        `)).rows as Array<{ id: string }>;

        const manualRows = (await tx.execute(sql`
          SELECT id, stamps_remaining FROM loyalty_manual_stamps
           WHERE stamps_remaining > 0
             AND (
                   (${vehicleId}::int IS NOT NULL AND vehicle_id = ${vehicleId})
                   OR (vehicle_id IS NULL AND plate_norm = ${norm})
                 )
           ORDER BY created_at ASC
           FOR UPDATE
        `)).rows as Array<{ id: string; stamps_remaining: number }>;
        const manualAvailable = manualRows.reduce((s, r) => s + Number(r.stamps_remaining), 0);

        const totalAvailable = eligibleRows.length + manualAvailable;
        if (totalAvailable < LOYALTY_REQUIRED_COUNT) {
          return { http: 400, body: { error: 'not_enough_stamps', have: totalAvailable, need: LOYALTY_REQUIRED_COUNT } };
        }

        // 4. Consume real orders first, then top up from manual credits.
        const ordersToConsume = eligibleRows.slice(0, LOYALTY_REQUIRED_COUNT);
        let needFromManual = LOYALTY_REQUIRED_COUNT - ordersToConsume.length;

        const redemptionId = `loy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const voucherId    = `ord_loy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const ticketCode   = await allocateTicket(tx, branchId);

        // Voucher order — created already queued at the branch with its ticket
        // (staff-at-lane path), unlike the customer flow's branchless voucher.
        await tx.execute(sql`
          INSERT INTO orders (
            id, branch_id, customer_id, vehicle_id, plate,
            package_id, package_name, package_price_cents,
            addons, subtotal_cents, total_cents,
            payment_method, payment_ref, qr_provider,
            ticket_code, status, claimed_at, ticket_day, customer_name_walkin
          ) VALUES (
            ${voucherId}, ${branchId}, ${ownerUserId}, ${vehicleId}, ${carPlate},
            ${LOYALTY_PKG_ID}, ${LOYALTY_VOUCHER_NAME}, 0,
            '[]'::jsonb, 0, 0,
            'voucher', ${redemptionId}, 'loyalty',
            ${ticketCode}, 'queued', now(), (now() AT TIME ZONE 'UTC')::date, NULL
          )
        `);

        await tx.execute(sql`
          INSERT INTO loyalty_redemptions
            (id, customer_user_id, voucher_order_id, package_id, branch_id)
          VALUES
            (${redemptionId}, ${ownerUserId}, ${voucherId}, ${LOYALTY_PKG_ID}, ${branchId})
        `);

        for (const row of ordersToConsume) {
          await tx.execute(sql`
            UPDATE orders SET loyalty_consumed_in = ${redemptionId}
             WHERE id = ${row.id} AND loyalty_consumed_in IS NULL
          `);
        }
        for (const row of manualRows) {
          if (needFromManual <= 0) break;
          const take = Math.min(needFromManual, Number(row.stamps_remaining));
          await tx.execute(sql`
            UPDATE loyalty_manual_stamps
               SET stamps_remaining = stamps_remaining - ${take}
             WHERE id = ${row.id}
          `);
          needFromManual -= take;
        }

        return { http: 201, body: { ok: true, ticket_code: ticketCode, plate: carPlate, package_name: LOYALTY_VOUCHER_NAME, branch_id: branchId, branch_name: branchRow.name, reused_pending: false } };
      });

      return res.status(out.http).json(out.body);
    } catch (err) {
      console.error('[pos.loyalty.redeem] failed:', err);
      return res.status(500).json({ error: 'redeem_failed' });
    }
  });

  // ==========================================================================
  // PATCH /api/pos/queue/reorder — Lane control manual ordering.
  //
  // Body: { branch_id, order_ids: [...] } — the FULL desired order of the
  // branch's currently-queued cars, front-first. Writes queue_position =
  // index so the "Up next" list (and public snapshot) follow it. Lane/cashier
  // are LOCKED to their own branch; owner/manager can reorder any branch.
  // ==========================================================================
  app.patch('/api/pos/queue/reorder', requireStaff, requireStaffRole('owner', 'manager', 'lane', 'cashier'), async (req, res) => {
    const branchId = Number(req.body?.branch_id);
    const orderIds = Array.isArray(req.body?.order_ids)
      ? req.body.order_ids.map((x: unknown) => String(x))
      : null;
    if (!Number.isFinite(branchId) || branchId <= 0 || !orderIds || orderIds.length === 0) {
      return res.status(400).json({ error: 'branch_id and order_ids required' });
    }

    const staffUser = req.staff!.user as any;
    const staffRole = staffUser.role as 'owner' | 'manager' | 'lane' | 'cashier';
    const staffBranchId = staffUser.branchId as number | null;
    if (staffRole !== 'owner' && staffRole !== 'manager') {
      if (staffBranchId == null || branchId !== staffBranchId) {
        return res.status(403).json({ error: 'branch_mismatch' });
      }
    }

    try {
      await db.transaction(async (tx) => {
        const rows = (await tx.execute(sql`
          SELECT id FROM orders
           WHERE branch_id = ${branchId} AND status = 'queued'
           FOR UPDATE
        `)).rows as Array<{ id: string }>;
        const current = new Set(rows.map((r) => r.id));
        const incoming = new Set(orderIds);

        // Strict: order_ids must be an EXACT permutation of what's queued
        // right now (no duplicates, no extras, none missing). A stale list
        // (another device added/moved a car since the page loaded) is
        // rejected so the client refetches instead of committing a mixed
        // ordering where some cars keep old positions.
        const isPermutation =
          orderIds.length === current.size &&
          incoming.size === orderIds.length &&
          orderIds.every((id: string) => current.has(id));
        if (!isPermutation) {
          throw Object.assign(new Error('queue_changed'), { httpStatus: 409 });
        }

        for (let i = 0; i < orderIds.length; i += 1) {
          await tx.execute(sql`
            UPDATE orders SET queue_position = ${i}
             WHERE id = ${orderIds[i]} AND branch_id = ${branchId} AND status = 'queued'
          `);
        }
      });
      res.json({ ok: true });
    } catch (err: any) {
      const status = err?.httpStatus ?? 500;
      if (status === 500) console.error('[pos.queue.reorder] failed:', err);
      res.status(status).json({ error: err?.message ?? 'reorder_failed' });
    }
  });

  // GET /api/pos/orders/today?branch_id=N
  // Today's orders for a branch, newest first. Used by the right-rail of
  // the POS page so the cashier sees what's been booked.
  app.get('/api/pos/orders/today', requireStaff, async (req, res) => {
    const branchId = Number(req.query.branch_id);
    if (!Number.isFinite(branchId) || branchId <= 0) {
      return res.status(400).json({ error: 'branch_id required' });
    }
    // Branch lock: lane/cashier may only read their own branch's orders;
    // owner/manager/investor can read any branch. Mirrors the status/reorder routes.
    const staffUser = req.staff!.user as any;
    const staffRole = staffUser.role as 'owner' | 'manager' | 'lane' | 'cashier' | 'investor';
    const staffBranchId = staffUser.branchId as number | null;
    if (staffRole !== 'owner' && staffRole !== 'manager' && staffRole !== 'investor') {
      if (staffBranchId == null || branchId !== staffBranchId) {
        return res.status(403).json({ error: 'branch_mismatch' });
      }
    }
    try {
      const rows = (await db.execute(sql`
        SELECT id, ticket_code, plate, package_name,
               package_price_cents, addons, subtotal_cents,
               paid_amount_cents, change_cents, branch_id,
               total_cents, payment_method, qr_provider, status, created_at,
               refunded_at, refund_reason, queue_position
          FROM orders
         WHERE branch_id = ${branchId}
           AND date(${bizDay()} AT TIME ZONE 'Asia/Brunei') = (now() AT TIME ZONE 'Asia/Brunei')::date
           ${realOrders()}
         ORDER BY ${bizDay()} DESC
      `)).rows;
      res.json({ orders: rows });
    } catch (err) {
      console.error('[pos.orders.today] failed:', err);
      res.status(500).json({ error: 'Failed to load today\'s orders' });
    }
  });

  // ==========================================================================
  // POS — Cashier shifts (Phase 8, 2026-05-04_09)
  //
  // Each cashier opens a shift with a declared cash float, takes orders,
  // and closes the shift with a counted-cash declaration. Variance =
  // counted - expected, where expected = float + cash_sales - cash_refunds.
  //
  // - One open shift per staff (DB-enforced via partial unique index).
  // - Orders auto-tag to the open shift in POST /api/pos/orders.
  // - Owner/manager can review all shifts under /admin -> Shifts tab.
  // ==========================================================================

  // Aggregate the totals for a branch's shared cash drawer on a single
  // day. Each branch runs ONE shared drawer per day: every cashier rings
  // into it, and the cash is banked after the day's shift — so the report
  // must show ALL of the branch's sales for that day regardless of which
  // staff (or which shift) rang them up. Returns sales, refunds, expected
  // cash, and a per-payment-method breakdown. Reused by the running view
  // (today), the close screen (today), and the admin detail (the shift's
  // own day). `day` is a 'YYYY-MM-DD' Brunei (UTC+8) calendar-day string.
  // Pass `null` for the live "today" view so the day is derived in DB time —
  // this avoids any app-vs-DB clock drift around the day boundary.
  // --- MDR (merchant transaction fee) helpers --------------------------
  // Rate map keyed by `${payment_method}|${qr_provider ?? ''}` -> basis points.
  // Missing keys (cash, bank transfer, unconfigured wallets) = 0% fee.
  type MdrRunner = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
  async function loadMdrRateMap(runner: MdrRunner): Promise<Map<string, number>> {
    const rows = (await runner.execute(sql`
      SELECT payment_method, qr_provider, mdr_bps FROM payment_fee_rates
    `)).rows as Array<{ payment_method: string; qr_provider: string | null; mdr_bps: number }>;
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(`${r.payment_method}|${r.qr_provider ?? ''}`, Number(r.mdr_bps) || 0);
    }
    return map;
  }
  const mdrRateFor = (
    map: Map<string, number>,
    paymentMethod: string,
    qrProvider: string | null,
  ) => map.get(`${paymentMethod}|${qrProvider ?? ''}`) ?? 0;
  // Fee policy (owner-chosen): MDR is charged on GROSS — the provider keeps its
  // cut even when the sale is later refunded. So gross = sales + refunds (both
  // are the original charged amounts). Round once per (method, provider) group.
  const mdrFeeForGroup = (bps: number, salesCents: number, refundCents: number) =>
    Math.round(((salesCents + refundCents) * bps) / 10000);

  async function computeShiftTotals(
    runner: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
    branchId: number,
    day: string | null,
    openingFloatCents: number,
  ) {
    // Business day = Brunei (UTC+8, no DST) calendar day. Orders are bucketed
    // to the day they were created in Brunei wall-clock time, NOT the UTC date.
    // UTC midnight is 08:00 Brunei, so a shift opening at ~07:45 used to resolve
    // "today" to the previous UTC date and fold the prior day's sales/refunds
    // into the live report. Derived in DB time to avoid app-vs-DB clock drift.
    const dayFilter = day === null
      ? sql`date(${bizDay()} AT TIME ZONE 'Asia/Brunei') = (now() AT TIME ZONE 'Asia/Brunei')::date`
      : sql`date(${bizDay()} AT TIME ZONE 'Asia/Brunei') = ${day}::date`;
    // Group by (payment_method, qr_provider) — MDR rates differ per wallet
    // (Progresif Ding vs Pocket QR vs Pocket Web are all 'qr_code').
    const rawRows = (await runner.execute(sql`
      SELECT payment_method, qr_provider,
             COALESCE(SUM(total_cents), 0)::int                                                AS sales_cents,
             COUNT(*)::int                                                                     AS sales_count,
             COALESCE(SUM(CASE WHEN status =  'refunded' THEN total_cents ELSE 0 END), 0)::int AS refund_cents,
             COALESCE(SUM(CASE WHEN status =  'refunded' THEN 1 ELSE 0 END), 0)::int          AS refund_count
        FROM orders
       WHERE branch_id = ${branchId}
         AND ${dayFilter} ${realOrders()}
       GROUP BY payment_method, qr_provider
       ORDER BY payment_method, qr_provider
    `)).rows as Array<{
      payment_method: string; qr_provider: string | null;
      sales_cents: number; sales_count: number;
      refund_cents: number; refund_count: number;
    }>;
    const rateMap = await loadMdrRateMap(runner);
    let salesCents = 0, salesCount = 0, refundCents = 0, refundCount = 0;
    let cashSales = 0, cashRefunds = 0, mdrFeeCents = 0;
    const breakdown = rawRows.map((r) => {
      const bps = mdrRateFor(rateMap, r.payment_method, r.qr_provider);
      // sales_cents is now gross (includes refunded orders), so the fee base
      // is already the full charged amount — pass 0 refund to avoid adding it twice.
      const fee = mdrFeeForGroup(bps, r.sales_cents, 0);
      salesCents += r.sales_cents;
      salesCount += r.sales_count;
      refundCents += r.refund_cents;
      refundCount += r.refund_count;
      mdrFeeCents += fee;
      if (r.payment_method === 'cash') {
        cashSales += r.sales_cents;
        cashRefunds += r.refund_cents;
      }
      return { ...r, mdr_bps: bps, mdr_fee_cents: fee };
    });
    return {
      breakdown,
      sales_cents: salesCents,
      sales_count: salesCount,
      refund_cents: refundCents,
      refund_count: refundCount,
      net_sales_cents: salesCents - refundCents,
      mdr_fee_cents: mdrFeeCents,
      net_after_fees_cents: salesCents - refundCents - mdrFeeCents,
      cash_sales_cents: cashSales,
      cash_refund_cents: cashRefunds,
      expected_cash_cents: openingFloatCents + cashSales - cashRefunds,
    };
  }

  // POST /api/pos/shifts/open
  // Cashier opens a drawer with a starting cash float. Server enforces
  // "one open shift per staff" via the partial unique index — concurrent
  // opens fail with 23505 and we surface a friendly 409.
  app.post('/api/pos/shifts/open', requireStaff, requireStaffRole('owner', 'manager', 'lane', 'cashier'), async (req, res) => {
    const schema = z.object({
      branch_id: z.number().int().positive(),
      opening_float_cents: z.number().int().min(0).max(10_000_00),
      opening_note: z.string().trim().max(500).optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const body = parsed.data;
    const staffUser = req.staff!.user as any;
    const staffId = staffUser.id as string;
    const staffRole = staffUser.role as 'owner' | 'manager' | 'lane' | 'cashier';
    const staffBranchId = staffUser.branchId as number | null;

    // Lane/cashier locked to their own branch (mirrors POST /api/pos/orders).
    let effectiveBranchId: number;
    if (staffRole === 'owner' || staffRole === 'manager') {
      if (![1,2,3,4,5].includes(body.branch_id)) {
        return res.status(400).json({ error: 'invalid_branch' });
      }
      effectiveBranchId = body.branch_id;
    } else {
      if (staffBranchId == null) return res.status(400).json({ error: 'staff_no_branch' });
      effectiveBranchId = staffBranchId;
    }

    try {
      const ins = (await db.execute(sql`
        INSERT INTO cashier_shifts (
          branch_id, opened_by_staff_id, opening_float_cents, opening_note
        ) VALUES (
          ${effectiveBranchId}, ${staffId}, ${body.opening_float_cents},
          ${body.opening_note?.trim() || null}
        )
        RETURNING id, branch_id, opened_by_staff_id, opening_float_cents,
                  opening_note, status, opened_at
      `)).rows[0] as any;
      // Auto-sync branch availability: opening a shift flips the branch to Open
      // (and clears any stale closed/maintenance note). Best-effort — never fail
      // the shift open over this. Staff can still change status manually anytime
      // via PATCH /api/pos/branch/status.
      try {
        await db.execute(sql`
          UPDATE branches
             SET status = 'open', is_open = true, status_note = NULL
           WHERE id = ${effectiveBranchId}
        `);
      } catch (statusErr) {
        console.warn('[pos.shifts.open] branch auto-open failed:', statusErr);
      }
      res.status(201).json({ ok: true, shift: ins });
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: 'shift_already_open' });
      }
      console.error('[pos.shifts.open] failed:', err);
      res.status(500).json({ error: 'open_failed' });
    }
  });

  // GET /api/pos/shifts/current
  // Returns the staff's currently open shift (if any) plus running
  // totals so the cashier can see expected cash live.
  app.get('/api/pos/shifts/current', requireStaff, async (req, res) => {
    const staffUser = req.staff!.user as any;
    const staffId = staffUser.id as string;
    const staffRole = staffUser.role as 'owner' | 'manager' | 'lane' | 'cashier';
    // Owner/manager oversee any branch they pick: resolve the SELECTED branch's
    // currently-open shift (whoever opened it) instead of their own. This lets
    // them read the live shift + Daily Report without opening a personal shift.
    // Cashier/lane stay scoped to their own open shift.
    const branchQ = req.query.branch_id ? Number(req.query.branch_id) : null;
    const byBranch =
      (staffRole === 'owner' || staffRole === 'manager') &&
      branchQ !== null && [1, 2, 3, 4, 5].includes(branchQ);
    try {
      const rows = (await db.execute(sql`
        SELECT id, branch_id, opened_by_staff_id, opening_float_cents,
               opening_note, status, opened_at
          FROM cashier_shifts
         WHERE status = 'open'
           AND ${byBranch
             ? sql`branch_id = ${branchQ}`
             : sql`opened_by_staff_id = ${staffId}`}
         ORDER BY opened_at ASC
         LIMIT 1
      `)).rows as Array<{
        id: number; branch_id: number; opened_by_staff_id: string;
        opening_float_cents: number; opening_note: string | null;
        status: string; opened_at: string;
      }>;
      if (rows.length === 0) {
        return res.json({ shift: null });
      }
      const shift = rows[0];
      // Shared drawer: show ALL of this branch's sales for TODAY, regardless
      // of which staff/shift rang them up. `null` = DB-derived today (UTC).
      const totals = await computeShiftTotals(db, shift.branch_id, null, shift.opening_float_cents);
      res.json({ shift, totals });
    } catch (err) {
      console.error('[pos.shifts.current] failed:', err);
      res.status(500).json({ error: 'current_failed' });
    }
  });

  // POST /api/pos/shifts/close
  // Closes the staff's open shift. Computes expected_cash from orders
  // tagged with this shift (cash sales - cash refunds + opening float),
  // computes variance = counted - expected, persists everything for
  // audit, returns the close summary.
  app.post('/api/pos/shifts/close', requireStaff, requireStaffRole('owner', 'manager', 'lane', 'cashier'), async (req, res) => {
    const schema = z.object({
      counted_cents: z.number().int().min(0).max(100_000_00),
      closing_note: z.string().trim().max(500).optional().nullable(),
      branch_id: z.number().int().positive().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const body = parsed.data;
    const staffUser = req.staff!.user as any;
    const staffId = staffUser.id as string;
    const staffRole = staffUser.role as 'owner' | 'manager' | 'lane' | 'cashier';
    // Owner/manager can close the SELECTED branch's open shift (whoever opened
    // it) — i.e. do the end-of-day cash count on a cashier's behalf. The closer
    // is still recorded as the owner for audit. Cashier/lane close their own.
    const byBranch =
      (staffRole === 'owner' || staffRole === 'manager') &&
      body.branch_id != null && [1, 2, 3, 4, 5].includes(body.branch_id);

    try {
      const result = await db.transaction(async (tx) => {
        const rows = (await tx.execute(sql`
          SELECT id, branch_id, opening_float_cents
            FROM cashier_shifts
           WHERE status = 'open'
             AND ${byBranch
               ? sql`branch_id = ${body.branch_id}`
               : sql`opened_by_staff_id = ${staffId}`}
           ORDER BY opened_at ASC
           LIMIT 1
           FOR UPDATE
        `)).rows as Array<{ id: number; branch_id: number; opening_float_cents: number }>;
        if (rows.length === 0) {
          throw Object.assign(new Error('no_open_shift'), { httpStatus: 404 });
        }
        const shift = rows[0];
        // Shared drawer: reconcile against ALL of this branch's cash for TODAY.
        // `null` = DB-derived today (UTC), matching the live current view.
        const totals = await computeShiftTotals(tx, shift.branch_id, null, shift.opening_float_cents);
        const expected = totals.expected_cash_cents;
        const variance = body.counted_cents - expected;

        const upd = (await tx.execute(sql`
          UPDATE cashier_shifts
             SET status                 = 'closed',
                 closed_at              = now(),
                 closed_by_staff_id     = ${staffId},
                 closing_counted_cents  = ${body.counted_cents},
                 closing_expected_cents = ${expected},
                 closing_variance_cents = ${variance},
                 closing_note           = ${body.closing_note?.trim() || null}
           WHERE id = ${shift.id}
       RETURNING id, branch_id, opened_by_staff_id, closed_by_staff_id,
                 opening_float_cents, opening_note,
                 closing_counted_cents, closing_expected_cents,
                 closing_variance_cents, closing_note,
                 status, opened_at, closed_at
        `)).rows[0];
        return { shift: upd, totals };
      });
      // Auto-sync branch availability: closing a shift flips the branch to
      // Closed — but ONLY when no other shift is still open at that branch
      // (two cashiers can each hold an open shift; the branch stays open until
      // the last one closes). Done after the close commits and best-effort, so
      // the cash reconciliation is never rolled back over a status hiccup. Staff
      // can still set status manually anytime via PATCH /api/pos/branch/status.
      try {
        await db.execute(sql`
          UPDATE branches
             SET status = 'closed', is_open = false, status_note = NULL
           WHERE id = ${(result.shift as any).branch_id}
             AND NOT EXISTS (
               SELECT 1 FROM cashier_shifts
                WHERE branch_id = ${(result.shift as any).branch_id}
                  AND status = 'open'
             )
        `);
      } catch (statusErr) {
        console.warn('[pos.shifts.close] branch auto-close failed:', statusErr);
      }
      res.json({ ok: true, ...result });
    } catch (err: any) {
      const status = err?.httpStatus ?? 500;
      const code = err?.message ?? 'close_failed';
      if (status === 500) console.error('[pos.shifts.close] failed:', err);
      res.status(status).json({ error: code });
    }
  });

  // GET /api/admin/shifts?branch_id=&staff_id=&from=&to=&status=
  // Owner/manager view of all shifts. Filters are optional.
  app.get('/api/admin/shifts', requireStaff, requireStaffRole('owner', 'manager'), async (req, res) => {
    const branchId = req.query.branch_id ? Number(req.query.branch_id) : null;
    const staffIdFilter = req.query.staff_id ? String(req.query.staff_id) : null;
    const status = req.query.status ? String(req.query.status) : null;
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    try {
      const rows = (await db.execute(sql`
        SELECT cs.id, cs.branch_id, b.name AS branch_name,
               cs.opened_by_staff_id, s_open.name AS opened_by_name,
               cs.closed_by_staff_id, s_close.name AS closed_by_name,
               cs.opening_float_cents, cs.opening_note,
               cs.closing_counted_cents, cs.closing_expected_cents,
               cs.closing_variance_cents, cs.closing_note,
               cs.status, cs.opened_at, cs.closed_at
          FROM cashier_shifts cs
          JOIN branches b           ON b.id = cs.branch_id
          JOIN staff   s_open       ON s_open.id = cs.opened_by_staff_id
          LEFT JOIN staff s_close   ON s_close.id = cs.closed_by_staff_id
         WHERE (${branchId}::int IS NULL OR cs.branch_id = ${branchId}::int)
           AND (${staffIdFilter}::text IS NULL OR cs.opened_by_staff_id = ${staffIdFilter}::text)
           AND (${status}::text IS NULL OR cs.status = ${status}::text)
           AND (${from}::date IS NULL OR cs.opened_at >= (${from}::date))
           AND (${to}::date   IS NULL OR cs.opened_at <  ((${to}::date) + INTERVAL '1 day'))
         ORDER BY cs.opened_at DESC
         LIMIT 200
      `)).rows;
      res.json({ shifts: rows });
    } catch (err) {
      console.error('[admin.shifts] failed:', err);
      res.status(500).json({ error: 'list_failed' });
    }
  });

  // GET /api/admin/shifts/:id — detail view including totals breakdown.
  app.get('/api/admin/shifts/:id', requireStaff, requireStaffRole('owner', 'manager'), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'invalid_id' });
    }
    try {
      const rows = (await db.execute(sql`
        SELECT cs.id, cs.branch_id, b.name AS branch_name,
               cs.opened_by_staff_id, s_open.name AS opened_by_name,
               cs.closed_by_staff_id, s_close.name AS closed_by_name,
               cs.opening_float_cents, cs.opening_note,
               cs.closing_counted_cents, cs.closing_expected_cents,
               cs.closing_variance_cents, cs.closing_note,
               cs.status, cs.opened_at, cs.closed_at
          FROM cashier_shifts cs
          JOIN branches b           ON b.id = cs.branch_id
          JOIN staff   s_open       ON s_open.id = cs.opened_by_staff_id
          LEFT JOIN staff s_close   ON s_close.id = cs.closed_by_staff_id
         WHERE cs.id = ${id}
         LIMIT 1
      `)).rows as any[];
      if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
      const shift = rows[0];
      // Shared drawer: show this branch's whole-day totals for the Brunei
      // (UTC+8, no DST) calendar day this shift was opened. Matches the live
      // report's Brunei-day bucketing in computeShiftTotals.
      const shiftDay = new Date(new Date(shift.opened_at).getTime() + 8 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
      const totals = await computeShiftTotals(db, shift.branch_id, shiftDay, shift.opening_float_cents);
      res.json({ shift, totals });
    } catch (err) {
      console.error('[admin.shifts.detail] failed:', err);
      res.status(500).json({ error: 'detail_failed' });
    }
  });

  // ==========================================================================
  // POS — Customer + vehicle lookup (Phase 1, 2026-05-04)
  // All endpoints here are staff-gated. Plates are normalised (uppercase,
  // whitespace stripped) for lookup; the original input is preserved on
  // insert so receipts match what staff typed.
  // ==========================================================================

  const normalizePlate = (s: string) => s.toUpperCase().replace(/\s+/g, "");

  // GET /api/pos/customers/lookup?phone=...
  // Look up a POS walk-in customer by phone, return their vehicles + spend.
  app.get('/api/pos/customers/lookup', requireStaff, async (req, res) => {
    const phone = String(req.query.phone ?? '').trim();
    if (phone.length < 4) {
      return res.status(400).json({ error: 'phone_required' });
    }
    try {
      const customerRows = (await db.execute(sql`
        SELECT id, phone, name, user_id, notes, created_at
          FROM customers WHERE phone = ${phone} LIMIT 1
      `)).rows as any[];
      if (customerRows.length === 0) {
        return res.status(404).json({ error: 'not_found' });
      }
      const customer = customerRows[0];
      const vehicles = (await db.execute(sql`
        SELECT id, license_plate, brand, model, color, "type", last_seen_at
          FROM cars WHERE customer_id = ${customer.id}
         ORDER BY COALESCE(last_seen_at, 'epoch'::timestamptz) DESC, id DESC
      `)).rows;
      const stats = (await db.execute(sql`
        SELECT COUNT(*)::int AS visits,
               COALESCE(SUM(total_cents), 0)::int AS spent_cents
          FROM orders
         WHERE vehicle_id IN (
           SELECT id FROM cars WHERE customer_id = ${customer.id}
         )
      `)).rows[0] as any;
      res.json({
        customer,
        vehicles,
        total_visits: stats.visits,
        total_spent_cents: stats.spent_cents,
      });
    } catch (err) {
      console.error('[pos.customers.lookup] failed:', err);
      res.status(500).json({ error: 'lookup_failed' });
    }
  });

  // POST /api/pos/customers — upsert a POS walk-in customer by phone.
  app.post('/api/pos/customers', requireStaff, requireStaffRole('owner', 'manager', 'lane', 'cashier'), async (req, res) => {
    const schema = z.object({
      phone: z.string().trim().min(4).max(40),
      name: z.string().trim().min(1).max(120),
      notes: z.string().trim().max(500).optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const { phone, name, notes } = parsed.data;
    try {
      const rows = (await db.execute(sql`
        INSERT INTO customers (phone, name, notes)
        VALUES (${phone}, ${name}, ${notes ?? null})
        ON CONFLICT (phone) DO UPDATE
           SET name  = EXCLUDED.name,
               notes = COALESCE(EXCLUDED.notes, customers.notes)
        RETURNING id, phone, name, user_id, notes, created_at
      `)).rows;
      res.status(201).json({ customer: rows[0] });
    } catch (err) {
      console.error('[pos.customers.create] failed:', err);
      res.status(500).json({ error: 'create_failed' });
    }
  });

  // GET /api/pos/vehicles/search?q=... — plate autocomplete (case-insensitive,
  // ignores whitespace). Up to 10 most-recently-seen matches.
  app.get('/api/pos/vehicles/search', requireStaff, async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 1) return res.json({ vehicles: [] });
    const norm = normalizePlate(q);
    try {
      const rows = (await db.execute(sql`
        SELECT c.id, c.license_plate, c.brand, c.model, c.color, c."type",
               c.last_seen_at,
               cu.id AS customer_id, cu.phone AS customer_phone, cu.name AS customer_name
          FROM cars c
          LEFT JOIN customers cu ON cu.id = c.customer_id
         WHERE UPPER(REGEXP_REPLACE(c.license_plate, '\s+', '', 'g')) LIKE ${norm + '%'}
         ORDER BY
           (UPPER(REGEXP_REPLACE(c.license_plate, '\s+', '', 'g')) = ${norm}) DESC,
           COALESCE(c.last_seen_at, 'epoch'::timestamptz) DESC,
           c.id DESC
         LIMIT 20
      `)).rows.map((r: any) => ({
        id: r.id,
        license_plate: r.license_plate,
        brand: r.brand,
        model: r.model,
        color: r.color,
        type: r.type,
        last_seen_at: r.last_seen_at,
        customer: r.customer_id
          ? { id: r.customer_id, phone: r.customer_phone, name: r.customer_name }
          : null,
      }));
      res.json({ vehicles: rows });
    } catch (err) {
      console.error('[pos.vehicles.search] failed:', err);
      res.status(500).json({ error: 'search_failed' });
    }
  });

  // POST /api/pos/lpr/recognize — Phase 3 license plate recognition.
  //
  // Staff snaps a photo at the gate (or uploads one) and we forward it
  // to Google Gemini Vision, asking for a Brunei plate string + a 0-1
  // confidence. We then look up `cars` for an exact match on the
  // normalised plate so the POS can auto-pick the vehicle and customer.
  //
  // Every attempt is logged to `lpr_attempts` (with the raw image bytes)
  // for 30 days so the owner can audit false positives. A lazy DELETE
  // sweep handles retention — no cron needed, mirrors the membership
  // expiry pattern from Phase 2.1.
  //
  // Fails soft: any Gemini error returns 503 `lpr_unavailable` and the
  // cashier can still type the plate by hand. Never throws into the
  // order flow.
  //
  // Body: { image_base64, image_mime, branch_id }
  app.post('/api/pos/lpr/recognize', requireStaff, requireStaffRole('owner', 'manager', 'lane', 'cashier'), async (req, res) => {
    const VALID_BRANCH_IDS = [1, 2, 3, 4, 5];
    const schema = z.object({
      // ~15MB cap on the base64 string itself = ~11MB raw bytes; the
      // post-decode check below tightens this to 8MB raw.
      image_base64: z.string().min(100).max(15_000_000),
      image_mime: z.string().regex(/^image\/(jpeg|jpg|png|webp|heic|heif)$/i),
      branch_id: z.number().int().positive(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_request', detail: parsed.error.flatten() });
    }
    const body = parsed.data;
    const staffUser = req.staff!.user as any;
    const staffId = staffUser.id as string;
    const staffRole = staffUser.role as 'owner' | 'manager' | 'lane' | 'cashier';
    const staffBranchId = staffUser.branchId as number | null;

    // Same branch authorisation rules as POST /api/pos/orders.
    let effectiveBranchId: number;
    if (staffRole === 'owner' || staffRole === 'manager') {
      if (!VALID_BRANCH_IDS.includes(body.branch_id)) {
        return res.status(400).json({ error: 'invalid_branch_id' });
      }
      effectiveBranchId = body.branch_id;
    } else {
      if (staffBranchId == null) {
        return res.status(403).json({ error: 'staff_no_branch' });
      }
      if (body.branch_id !== staffBranchId) {
        return res.status(403).json({ error: 'branch_mismatch' });
      }
      effectiveBranchId = staffBranchId;
    }

    // Strip any data URL prefix the client may have left on, then decode.
    const b64 = body.image_base64.replace(/^data:[^,]+,/, '');
    let imageBuf: Buffer;
    try {
      imageBuf = Buffer.from(b64, 'base64');
    } catch {
      return res.status(400).json({ error: 'invalid_base64' });
    }
    if (imageBuf.length === 0 || imageBuf.length > 8 * 1024 * 1024) {
      return res.status(400).json({ error: 'image_size_out_of_range' });
    }

    // Lazy 30-day retention sweep. Cheap (indexed on created_at). Runs
    // outside any transaction so a partial failure here can't leave
    // orphan rows; we just log and continue.
    try {
      await db.execute(sql`
        DELETE FROM lpr_attempts
         WHERE created_at < now() - interval '30 days'
      `);
    } catch (err) {
      console.error('[pos.lpr.recognize] retention sweep failed:', err);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'lpr_unavailable', detail: 'gemini_not_configured' });
    }

    let recognizedPlate: string | null = null;
    let confidence: number | null = null;
    let rawResponse: string | null = null;
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data: b64, mimeType: body.image_mime } },
              {
                text: [
                  'You are a Brunei license plate reader.',
                  'Extract the plate visible in the photo as plain UPPERCASE letters and digits, no spaces or dashes.',
                  'Brunei plates look like "BB1234", "DAA1234", "KB1234", "LCC1234", etc.',
                  'If you cannot see a plate clearly, set "plate" to null.',
                  'Reply ONLY with JSON in this exact shape: {"plate": "BB1234", "confidence": 0.92}.',
                  'confidence is your 0-1 certainty.',
                ].join(' '),
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0,
        },
      });
      rawResponse = (result.text ?? '').trim();
      try {
        const parsedJson = JSON.parse(rawResponse);
        if (typeof parsedJson.plate === 'string' && parsedJson.plate.trim().length > 0) {
          recognizedPlate = normalizePlate(parsedJson.plate);
        }
        if (typeof parsedJson.confidence === 'number') {
          confidence = Math.max(0, Math.min(1, parsedJson.confidence));
        }
      } catch {
        // Gemini returned something that wasn't JSON — try to salvage
        // a plate-shaped substring before giving up.
        const m = rawResponse.match(/[A-Z]{1,4}\s*\d{1,5}/i);
        if (m) recognizedPlate = normalizePlate(m[0]);
      }
    } catch (err: any) {
      console.error('[pos.lpr.recognize] gemini failed:', err?.message ?? err);
      return res.status(503).json({ error: 'lpr_unavailable', detail: 'gemini_call_failed' });
    }

    // Look up an exact match in `cars`. Prefix matching here is a bad
    // idea — auto-selecting the wrong vehicle is worse than no match.
    let matchedVehicle: any = null;
    if (recognizedPlate) {
      try {
        const rows = (await db.execute(sql`
          SELECT c.id, c.license_plate, c.brand, c.model, c.color, c."type",
                 c.last_seen_at,
                 cu.id AS customer_id, cu.phone AS customer_phone, cu.name AS customer_name
            FROM cars c
            LEFT JOIN customers cu ON cu.id = c.customer_id
           WHERE UPPER(REGEXP_REPLACE(c.license_plate, '\s+', '', 'g')) = ${recognizedPlate}
           LIMIT 1
        `)).rows as any[];
        if (rows.length > 0) {
          const r = rows[0];
          matchedVehicle = {
            id: r.id,
            license_plate: r.license_plate,
            brand: r.brand,
            model: r.model,
            color: r.color,
            type: r.type,
            last_seen_at: r.last_seen_at,
            customer: r.customer_id
              ? { id: r.customer_id, phone: r.customer_phone, name: r.customer_name }
              : null,
          };
        }
      } catch (err) {
        console.error('[pos.lpr.recognize] match lookup failed:', err);
      }
    }

    // Audit insert. Non-fatal — never let logging break the response
    // staff are waiting on. Worst case we lose one audit row.
    try {
      const attemptId = `lpr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      await db.execute(sql`
        INSERT INTO lpr_attempts (
          id, staff_id, branch_id, recognized_plate, confidence,
          matched_vehicle_id, raw_response, image_bytes, image_mime, image_size_bytes
        ) VALUES (
          ${attemptId}, ${staffId}, ${effectiveBranchId}, ${recognizedPlate}, ${confidence},
          ${matchedVehicle?.id ?? null}, ${rawResponse}, ${imageBuf}, ${body.image_mime}, ${imageBuf.length}
        )
      `);
    } catch (err) {
      console.error('[pos.lpr.recognize] audit insert failed:', err);
    }

    return res.json({
      recognized_plate: recognizedPlate,
      confidence,
      vehicle: matchedVehicle,
    });
  });

  // GET /api/pos/vehicles/:id/history — visit stats + last 10 orders.
  app.get('/api/pos/vehicles/:id/history', requireStaff, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'invalid_id' });
    }
    try {
      const vehicleRows = (await db.execute(sql`
        SELECT c.id, c.license_plate, c.brand, c.model, c.color, c."type", c.last_seen_at,
               c.vip_tier, c.vip_rank,
               COALESCE(cu.id, cuu.id)       AS customer_id,
               COALESCE(cu.phone, cuu.phone) AS customer_phone,
               COALESCE(cu.name, cuu.name)   AS customer_name
          FROM cars c
          LEFT JOIN customers cu ON cu.id = c.customer_id
          -- Cars added from the customer dashboard only set cars.user_id,
          -- so fall back to that account's customer profile.
          LEFT JOIN customers cuu ON cuu.user_id = c.user_id
         WHERE c.id = ${id} LIMIT 1
      `)).rows as any[];
      if (vehicleRows.length === 0) return res.status(404).json({ error: 'not_found' });
      const v = vehicleRows[0];
      const recent = (await db.execute(sql`
        SELECT id, ticket_code, branch_id, package_name, total_cents,
               payment_method, status, created_at
          FROM orders
         WHERE vehicle_id = ${id}
         ORDER BY created_at DESC LIMIT 10
      `)).rows;
      const stats = (await db.execute(sql`
        SELECT COUNT(*)::int AS visits,
               COALESCE(SUM(total_cents), 0)::int AS spent_cents
          FROM orders WHERE vehicle_id = ${id}
      `)).rows[0] as any;
      const fav = (await db.execute(sql`
        SELECT branch_id, COUNT(*)::int AS n
          FROM orders WHERE vehicle_id = ${id}
         GROUP BY branch_id ORDER BY n DESC LIMIT 1
      `)).rows[0] as any;
      res.json({
        vehicle: {
          id: v.id, license_plate: v.license_plate, brand: v.brand, model: v.model,
          color: v.color, type: v.type, last_seen_at: v.last_seen_at,
          vip_tier: v.vip_tier ?? null,
          vip_rank: v.vip_rank ?? null,
        },
        customer: v.customer_id
          ? { id: v.customer_id, phone: v.customer_phone, name: v.customer_name }
          : null,
        total_visits: stats.visits,
        total_spent_cents: stats.spent_cents,
        favourite_branch_id: fav?.branch_id ?? null,
        recent_orders: recent,
      });
    } catch (err) {
      console.error('[pos.vehicles.history] failed:', err);
      res.status(500).json({ error: 'history_failed' });
    }
  });

  // ==========================================================================
  // POS — Memberships (Phase 2, 2026-05-04)
  // Wash-pack lifecycle: sell, look up active for a customer/vehicle, list.
  // Redemption itself happens inside POST /api/pos/orders when the cashier
  // chooses payment_method='subscription' (see that route for the txn).
  // ==========================================================================

  // Lazy sweep: any membership whose expires_at is in the past gets
  // flipped from 'active' → 'expired' the next time someone touches
  // the table. Idempotent, runs on a cheap partial filter, keeps
  // `status` accurate for reporting without needing a cron job.
  // Called at the top of every membership-reading endpoint and before
  // the subscription redemption transaction.
  const sweepExpiredMemberships = async () => {
    await db.execute(sql`
      UPDATE memberships
         SET status = 'expired'
       WHERE status = 'active'
         AND expires_at IS NOT NULL
         AND expires_at < now()
    `);
  };

  // GET /api/pos/memberships/active?customer_id=N[&vehicle_id=N]
  // Returns the customer's current active wash-pack(s). If vehicle_id is
  // supplied, also includes vehicle-pinned packs that match. Used by the
  // POS surface to show the "Wash pack: 7/10" badge after a customer is
  // identified by phone/plate.
  app.get('/api/pos/memberships/active', requireStaff, async (req, res) => {
    const customerId = Number(req.query.customer_id);
    const vehicleId = req.query.vehicle_id ? Number(req.query.vehicle_id) : null;
    if (!Number.isFinite(customerId) || customerId <= 0) {
      return res.status(400).json({ error: 'customer_id required' });
    }
    try {
      // Lazy expiry sweep — flip any active rows whose expires_at has
      // passed to status='expired' so reporting/UI stays clean. Cheap:
      // the partial WHERE is highly selective and idempotent.
      await db.execute(sql`
        UPDATE memberships
           SET status = 'expired'
         WHERE status = 'active'
           AND expires_at IS NOT NULL
           AND expires_at < now()
      `);

      // 'pack' kind requires remaining_washes > 0; 'unlimited' kind
      // bypasses the count gate (it always has remaining=0 by design)
      // and is gated by expires_at instead. Either way the row must be
      // status='active' and not expired.
      const rows = (await db.execute(sql`
        SELECT id, customer_id, vehicle_id, kind, total_washes, remaining_washes,
               price_cents, status, expires_at, created_at
          FROM memberships
         WHERE customer_id = ${customerId}
           AND status = 'active'
           AND (kind = 'unlimited' OR remaining_washes > 0)
           AND (expires_at IS NULL OR expires_at > now())
           AND (
             vehicle_id IS NULL
             ${vehicleId ? sql`OR vehicle_id = ${vehicleId}` : sql``}
           )
         ORDER BY (vehicle_id IS NULL) ASC, created_at ASC
      `)).rows;
      res.json({ memberships: rows });
    } catch (err) {
      console.error('[pos.memberships.active] failed:', err);
      res.status(500).json({ error: 'memberships_lookup_failed' });
    }
  });

  // POST /api/pos/memberships — sell a wash-pack to a customer.
  // Body: { customer_id, vehicle_id?, total_washes, price_cents, expires_at?, branch_id }
  const sellMembershipSchema = z.object({
    customer_id: z.number().int().positive(),
    vehicle_id: z.number().int().positive().optional().nullable(),
    // 'pack' = N prepaid washes; total_washes required.
    // 'unlimited' = time-bound; expires_at required.
    kind: z.enum(['pack', 'unlimited']).default('pack'),
    total_washes: z.number().int().nonnegative().max(1000).optional(),
    price_cents: z.number().int().nonnegative().max(1_000_000),
    expires_at: z.string().datetime().optional().nullable(),
    branch_id: z.number().int().positive(),
  }).refine(
    d => d.kind !== 'pack' || (d.total_washes != null && d.total_washes > 0),
    { message: 'pack_requires_total_washes', path: ['total_washes'] },
  ).refine(
    d => d.kind !== 'unlimited' || !!d.expires_at,
    { message: 'unlimited_requires_expires_at', path: ['expires_at'] },
  );
  app.post('/api/pos/memberships', requireStaff, requireStaffRole('owner', 'manager', 'lane', 'cashier'), async (req, res) => {
    const parsed = sellMembershipSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const body = parsed.data;
    const staffUser = req.staff!.user as any;
    const staffId = staffUser.id as string;
    const staffRole = staffUser.role as 'owner' | 'manager' | 'lane' | 'cashier';
    const staffBranchId = staffUser.branchId as number | null;

    // Same branch enforcement as the order route.
    const VALID_BRANCH_IDS = [1, 2, 3, 4, 5];
    let effectiveBranchId: number;
    if (staffRole === 'owner' || staffRole === 'manager') {
      if (!VALID_BRANCH_IDS.includes(body.branch_id)) {
        return res.status(400).json({ error: 'invalid_branch' });
      }
      effectiveBranchId = body.branch_id;
    } else {
      if (staffBranchId == null) return res.status(400).json({ error: 'staff_no_branch' });
      effectiveBranchId = staffBranchId;
    }

    try {
      // Validate customer + (optional) vehicle exist.
      const cust = (await db.execute(sql`
        SELECT id FROM customers WHERE id = ${body.customer_id} LIMIT 1
      `)).rows[0] as any;
      if (!cust) return res.status(404).json({ error: 'customer_not_found' });
      if (body.vehicle_id) {
        const veh = (await db.execute(sql`
          SELECT id, customer_id FROM cars WHERE id = ${body.vehicle_id} LIMIT 1
        `)).rows[0] as any;
        if (!veh) return res.status(404).json({ error: 'vehicle_not_found' });
        if (veh.customer_id != null && veh.customer_id !== body.customer_id) {
          return res.status(409).json({ error: 'vehicle_belongs_to_other_customer' });
        }
      }

      // Unlimited rows store total/remaining as 0 — those columns are
      // unused for kind='unlimited' (the CHECK constraint allows it).
      const totalWashes = body.kind === 'pack' ? body.total_washes! : 0;
      const membershipId = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const row = (await db.execute(sql`
        INSERT INTO memberships (
          id, customer_id, vehicle_id, kind, total_washes, remaining_washes,
          price_cents, status, expires_at, sold_by_staff_id, sold_at_branch_id
        ) VALUES (
          ${membershipId}, ${body.customer_id}, ${body.vehicle_id ?? null},
          ${body.kind}, ${totalWashes}, ${totalWashes},
          ${body.price_cents}, 'active', ${body.expires_at ?? null},
          ${staffId}, ${effectiveBranchId}
        )
        RETURNING id, customer_id, vehicle_id, kind, total_washes, remaining_washes,
                  price_cents, status, expires_at, created_at
      `)).rows[0];
      res.status(201).json({ ok: true, membership: row });
    } catch (err) {
      console.error('[pos.memberships.create] failed:', err);
      res.status(500).json({ error: 'membership_create_failed' });
    }
  });

  // POST /api/pos/subscriptions/sell — sell (or renew) a counter-paid
  // Unlimited pass for a plate. Unlike the CyberSource web flow, this is a
  // one-month prepaid pass paid at the till (cash/card/wallet QR):
  //   1. Upserts the car by plate (creating an unclaimed row if new).
  //   2. Upserts a walk-in customer by phone (unique) unless the car is
  //      already linked to a customer — then THAT customer holds the pass.
  //   3. Creates an ACTIVE kind='unlimited' membership bound to the vehicle
  //      (expires +1 month), or EXTENDS an existing active one by +1 month
  //      (renewal) — never stacks duplicates.
  //   4. Rings a normal paid POS order for the pass price so the sale hits
  //      the drawer/cash tally, shift, and all sales reports.
  // Price is server-authoritative from the shared plan catalog (B$39/mo) —
  // the client never sends an amount. When the customer later registers on
  // the website, the plate-claim flow (POST /api/customer/cars) attaches
  // this membership to their account via a phone match, and the dashboard
  // "Show wash QR" works immediately.
  const sellPosSubscriptionSchema = z.object({
    plate: z.string().trim().min(1).max(20),
    brand: z.string().trim().max(60).optional().nullable(),
    model: z.string().trim().max(60).optional().nullable(),
    customer_name: z.string().trim().max(120).optional().nullable(),
    customer_phone: z.string().trim().max(30).optional().nullable(),
    payment_method: z.enum(['cash', 'card', 'bank_transfer', 'baiduri_pay', 'quick_pay', 'qr_code']),
    qr_provider: z.string().trim().max(40).optional().nullable(),
    payment_ref: z.string().trim().max(120).optional().nullable(),
    paid_amount_cents: z.number().int().nonnegative().max(1_000_000).optional().nullable(),
    branch_id: z.number().int().positive(),
    // Guard against phone typos silently assigning the pass to an existing
    // customer: the first attempt 409s with the existing customer's name
    // and the cashier must explicitly confirm before we reuse that row.
    confirm_existing_customer: z.boolean().optional(),
  });
  app.post('/api/pos/subscriptions/sell', requireStaff, requireStaffRole('owner', 'manager', 'lane', 'cashier'), async (req, res) => {
    const parsed = sellPosSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const body = parsed.data;
    const plan = getSubscriptionPlan('unlimited')!;
    const priceCents = plan.priceCents;

    // Mirror the POS order payment gates.
    if (body.payment_method === 'cash') {
      if (body.paid_amount_cents == null) return res.status(400).json({ error: 'cash_amount_required' });
      if (body.paid_amount_cents < priceCents) return res.status(400).json({ error: 'cash_amount_too_low' });
    }
    if (body.payment_method === 'bank_transfer' && !(body.payment_ref ?? '').trim()) {
      return res.status(400).json({ error: 'bank_transfer_reference_required' });
    }
    if (body.payment_method === 'qr_code' && !(body.qr_provider ?? '').trim()) {
      return res.status(400).json({ error: 'qr_provider_required' });
    }

    const staffUser = req.staff!.user as any;
    const staffId = staffUser.id as string;
    const staffRole = staffUser.role as 'owner' | 'manager' | 'lane' | 'cashier';
    const staffBranchId = staffUser.branchId as number | null;
    const VALID_BRANCH_IDS = [1, 2, 3, 4, 5];
    let effectiveBranchId: number;
    if (staffRole === 'owner' || staffRole === 'manager') {
      if (!VALID_BRANCH_IDS.includes(body.branch_id)) {
        return res.status(400).json({ error: 'invalid_branch' });
      }
      effectiveBranchId = body.branch_id;
    } else {
      if (staffBranchId == null) return res.status(400).json({ error: 'staff_no_branch' });
      effectiveBranchId = staffBranchId;
    }

    const plateUpper = body.plate.toUpperCase().replace(/\s+/g, ' ').trim();
    const plateNorm = plateUpper.replace(/\s+/g, '');
    const phoneNorm = (body.customer_phone ?? '').replace(/\D+/g, '');

    try {
      const out = await db.transaction(async (tx) => {
        // 1. Car: find by normalized plate, else create an unclaimed row.
        let car = (await tx.execute(sql`
          SELECT id, customer_id, user_id FROM cars
          WHERE UPPER(REGEXP_REPLACE(license_plate, '\\s+', '', 'g')) = ${plateNorm}
          LIMIT 1
          FOR UPDATE
        `)).rows[0] as { id: number; customer_id: number | null; user_id: number | null } | undefined;
        if (!car) {
          car = (await tx.execute(sql`
            INSERT INTO cars (license_plate, brand, model)
            VALUES (${plateUpper}, ${body.brand ?? null}, ${body.model ?? null})
            RETURNING id, customer_id, user_id
          `)).rows[0] as any;
        }

        // 2. Resolve the membership holder.
        let customerId: number;
        // Cars added from the customer dashboard only set cars.user_id, so
        // fall back to that account's customer profile before treating the
        // buyer as a brand-new walk-in (avoids duplicate customer rows).
        let ownerCustomerId = car!.customer_id;
        if (ownerCustomerId == null && car!.user_id != null) {
          const byUser = (await tx.execute(sql`
            SELECT id FROM customers WHERE user_id = ${car!.user_id} LIMIT 1
          `)).rows[0] as { id: number } | undefined;
          if (byUser) {
            ownerCustomerId = byUser.id;
            // Backfill the link so future lookups are direct.
            await tx.execute(sql`
              UPDATE cars SET customer_id = ${ownerCustomerId}
              WHERE id = ${car!.id} AND customer_id IS NULL
            `);
          }
        }
        if (ownerCustomerId != null) {
          // Car already belongs to a customer — the pass is theirs.
          customerId = ownerCustomerId;
        } else {
          // Need a customer row: upsert by phone (unique).
          if (!phoneNorm || !(body.customer_name ?? '').trim()) {
            throw Object.assign(new Error('customer_details_required'), { httpStatus: 400 });
          }
          // Typo guard: if this phone already belongs to a customer, the
          // cashier must explicitly confirm before the pass is attached to
          // that existing account — otherwise a mistyped digit silently
          // gives someone else's account a paid membership.
          const existingCust = (await tx.execute(sql`
            SELECT id, name, user_id FROM customers WHERE phone = ${phoneNorm} LIMIT 1
          `)).rows[0] as { id: number; name: string | null; user_id: number | null } | undefined;
          if (existingCust && !body.confirm_existing_customer) {
            throw Object.assign(new Error('phone_belongs_to_existing_customer'), {
              httpStatus: 409,
              extra: { existing_customer_name: existingCust.name },
            });
          }
          const cust = existingCust ?? (await tx.execute(sql`
            INSERT INTO customers (phone, name)
            VALUES (${phoneNorm}, ${body.customer_name!.trim()})
            ON CONFLICT (phone) DO UPDATE SET updated_at = now()
            RETURNING id, user_id
          `)).rows[0] as { id: number; user_id: number | null };
          customerId = cust.id;
          // Link the car to the buyer. If that phone belongs to a customer
          // who already registered online, link the user too so the pass
          // shows on their dashboard instantly.
          await tx.execute(sql`
            UPDATE cars SET
              customer_id = ${customerId},
              user_id     = COALESCE(user_id, ${cust.user_id}),
              brand       = COALESCE(${body.brand ?? null}, brand),
              model       = COALESCE(${body.model ?? null}, model)
            WHERE id = ${car!.id}
          `);
        }

        // 3. Membership: extend an existing active unlimited pass on this
        //    vehicle, otherwise create a fresh one-month pass.
        const existing = (await tx.execute(sql`
          SELECT id, expires_at FROM memberships
          WHERE vehicle_id = ${car!.id}
            AND kind = 'unlimited'
            AND status = 'active'
            AND (expires_at IS NULL OR expires_at > now())
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE
        `)).rows[0] as { id: string; expires_at: string | null } | undefined;

        let membership: any;
        let renewed = false;
        if (existing) {
          renewed = true;
          membership = (await tx.execute(sql`
            UPDATE memberships
               SET expires_at = GREATEST(COALESCE(expires_at, now()), now()) + interval '1 month'
             WHERE id = ${existing.id}
             RETURNING id, customer_id, vehicle_id, kind, status, expires_at, price_cents
          `)).rows[0];
        } else {
          const membershipId = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          membership = (await tx.execute(sql`
            INSERT INTO memberships (
              id, customer_id, vehicle_id, kind, total_washes, remaining_washes,
              price_cents, status, expires_at, sold_by_staff_id, sold_at_branch_id, source
            ) VALUES (
              ${membershipId}, ${customerId}, ${car!.id}, 'unlimited', 0, 0,
              ${priceCents}, 'active', now() + interval '1 month',
              ${staffId}, ${effectiveBranchId}, 'pos'
            )
            RETURNING id, customer_id, vehicle_id, kind, status, expires_at, price_cents
          `)).rows[0];
        }

        // 4. Ring the sale as a normal paid order (hits drawer + reports).
        const shiftRows = (await tx.execute(sql`
          SELECT id FROM cashier_shifts
           WHERE opened_by_staff_id = ${staffId}
             AND branch_id = ${effectiveBranchId}
             AND status = 'open'
           LIMIT 1
        `)).rows as Array<{ id: number }>;
        const shiftIdForOrder: number | null = shiftRows[0]?.id ?? null;
        const paidAmountCents = body.paid_amount_cents ?? priceCents;
        const changeCents = Math.max(0, paidAmountCents - priceCents);
        const orderId = `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const packageName = renewed
          ? `${plan.name} — Monthly Pass (renewal)`
          : `${plan.name} — Monthly Pass`;
        await tx.execute(sql`
          INSERT INTO orders (
            id, branch_id, staff_id, plate,
            package_id, package_name, package_price_cents,
            addons, subtotal_cents, total_cents,
            payment_method, qr_provider, payment_ref,
            paid_amount_cents, change_cents,
            ticket_code, status,
            vehicle_id, customer_id,
            shift_id, order_type
          ) VALUES (
            ${orderId}, ${effectiveBranchId}, ${staffId}, ${plateUpper},
            NULL, ${packageName}, ${priceCents},
            '[]'::jsonb, ${priceCents}, ${priceCents},
            ${body.payment_method}, ${(body.payment_method === 'qr_code' || body.payment_method === 'bank_transfer') ? (body.qr_provider ?? null) : null}, ${body.payment_method === 'cash' ? null : (body.payment_ref ?? null)},
            ${paidAmountCents}, ${changeCents},
            NULL, 'done',
            ${car!.id}, ${customerId},
            ${shiftIdForOrder}, 'counter_subscription'
          )
        `);

        console.log(
          `[pos.subscriptions.sell] staff=${staffUser.email ?? staffId} branch=${effectiveBranchId} ` +
          `plate=${plateUpper} car=${car!.id} customer=${customerId} membership=${membership.id} ` +
          `${renewed ? 'RENEWED' : 'NEW'} until=${membership.expires_at} order=${orderId} ` +
          `method=${body.payment_method} amount=B$${(priceCents / 100).toFixed(2)}`,
        );
        return { membership, order_id: orderId, renewed, change_cents: changeCents };
      });
      res.status(201).json({ ok: true, ...out });
    } catch (err: any) {
      const status = err?.httpStatus;
      if (status) return res.status(status).json({ error: err.message, ...(err.extra ?? {}) });
      console.error('[pos.subscriptions.sell] failed:', err);
      res.status(500).json({ error: 'subscription_sale_failed' });
    }
  });

  // GET /api/pos/memberships?customer_id=N — full history for a customer.
  app.get('/api/pos/memberships', requireStaff, async (req, res) => {
    const customerId = Number(req.query.customer_id);
    if (!Number.isFinite(customerId) || customerId <= 0) {
      return res.status(400).json({ error: 'customer_id required' });
    }
    try {
      // Same lazy expiry sweep as /active so the history list shows
      // correct status without depending on /active being called first.
      await db.execute(sql`
        UPDATE memberships
           SET status = 'expired'
         WHERE status = 'active'
           AND expires_at IS NOT NULL
           AND expires_at < now()
      `);
      const rows = (await db.execute(sql`
        SELECT id, vehicle_id, kind, total_washes, remaining_washes, price_cents,
               status, expires_at, created_at
          FROM memberships
         WHERE customer_id = ${customerId}
         ORDER BY created_at DESC
      `)).rows;
      res.json({ memberships: rows });
    } catch (err) {
      console.error('[pos.memberships.list] failed:', err);
      res.status(500).json({ error: 'memberships_list_failed' });
    }
  });

  // PATCH /api/pos/vehicles/:id — correct a car's brand/model (and
  // optionally colour/type) from the POS when the cashier spots wrong
  // details on a plate lookup.
  //
  // "Update all datasets" is satisfied by writing this ONE row: brand and
  // model live only on `cars`. Orders store the plate as text; the customer
  // dashboard's vehicle tab, the admin customer profile, the POS plate
  // suggestions and the vehicle-history card all JOIN to `cars` and read
  // brand/model from it. So a single UPDATE here is reflected everywhere
  // the car appears.
  app.patch('/api/pos/vehicles/:id', requireStaff, requireStaffRole('owner', 'manager', 'lane', 'cashier'), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_id' });
    const schema = z.object({
      brand: z.string().trim().max(80).optional().nullable(),
      model: z.string().trim().max(80).optional().nullable(),
      color: z.string().trim().max(40).optional().nullable(),
      type: z.string().trim().max(40).optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    // Key-presence semantics: only overwrite the fields the client actually
    // sent, so editing just the brand never wipes the model. An explicit
    // empty string clears the field (-> NULL).
    const body = (req.body ?? {}) as Record<string, unknown>;
    const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
    const blank = (v: string | null | undefined) => {
      const s = (v ?? '').toString().trim();
      return s === '' ? null : s;
    };
    const brandTouched = has('brand');
    const modelTouched = has('model');
    const colorTouched = has('color');
    const typeTouched = has('type');
    if (!brandTouched && !modelTouched && !colorTouched && !typeTouched) {
      return res.status(400).json({ error: 'no_fields' });
    }
    try {
      const updated = (await db.execute(sql`
        UPDATE cars SET
          brand  = CASE WHEN ${brandTouched}::boolean THEN ${blank(parsed.data.brand)} ELSE brand END,
          model  = CASE WHEN ${modelTouched}::boolean THEN ${blank(parsed.data.model)} ELSE model END,
          color  = CASE WHEN ${colorTouched}::boolean THEN ${blank(parsed.data.color)} ELSE color END,
          "type" = CASE WHEN ${typeTouched}::boolean  THEN ${blank(parsed.data.type)}  ELSE "type" END
        WHERE id = ${id}
        RETURNING id, license_plate, brand, model, color, "type",
                  customer_id, user_id, last_seen_at
      `)).rows[0];
      if (!updated) return res.status(404).json({ error: 'not_found' });
      res.json({ vehicle: updated });
    } catch (err) {
      console.error('[pos.vehicles.patch] failed:', err);
      res.status(500).json({ error: 'update_failed' });
    }
  });

  // POST /api/pos/vehicles — upsert by normalised plate.
  // Trunk-owned cars (cars.user_id IS NOT NULL) are NEVER re-bound to a
  // different user from the POS surface; we only ever attach a POS
  // customer_id when it's currently null. This protects trunk semantics.
  app.post('/api/pos/vehicles', requireStaff, requireStaffRole('owner', 'manager', 'lane', 'cashier'), async (req, res) => {
    const schema = z.object({
      license_plate: z.string().trim().min(1).max(20),
      brand: z.string().trim().max(80).optional().nullable(),
      model: z.string().trim().max(80).optional().nullable(),
      color: z.string().trim().max(40).optional().nullable(),
      type: z.string().trim().max(40).optional().nullable(),
      customer_id: z.number().int().positive().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const { license_plate, brand, model, color, type, customer_id } = parsed.data;
    const norm = normalizePlate(license_plate);
    try {
      // Pick the best existing match — prefer the same customer's car,
      // else most-recently-seen, else newest id.
      const existingRows = (await db.execute(sql`
        SELECT id, user_id, customer_id
          FROM cars
         WHERE UPPER(REGEXP_REPLACE(license_plate, '\\s+', '', 'g')) = ${norm}
         ORDER BY (CASE WHEN customer_id = ${customer_id ?? -1} THEN 0 ELSE 1 END) ASC,
                  COALESCE(last_seen_at, 'epoch'::timestamptz) DESC,
                  id DESC
         LIMIT 1
      `)).rows as any[];
      if (existingRows.length > 0) {
        const ex = existingRows[0];
        // Only set customer_id if currently null. Never override.
        const newCustomerId = ex.customer_id ?? customer_id ?? null;
        await db.execute(sql`
          UPDATE cars SET
            brand        = COALESCE(${brand ?? null}, brand),
            model        = COALESCE(${model ?? null}, model),
            color        = COALESCE(${color ?? null}, color),
            "type"       = COALESCE(${type ?? null}, "type"),
            customer_id  = ${newCustomerId},
            last_seen_at = now()
           WHERE id = ${ex.id}
        `);
        const out = (await db.execute(sql`
          SELECT id, license_plate, brand, model, color, "type",
                 customer_id, user_id, last_seen_at
            FROM cars WHERE id = ${ex.id}
        `)).rows[0];
        return res.json({ vehicle: out });
      }
      // No match — insert new (orphan if no customer_id).
      const out = (await db.execute(sql`
        INSERT INTO cars (license_plate, brand, model, color, "type",
                          customer_id, last_seen_at)
        VALUES (${license_plate}, ${brand ?? null}, ${model ?? null},
                ${color ?? null}, ${type ?? null},
                ${customer_id ?? null}, now())
        RETURNING id, license_plate, brand, model, color, "type",
                  customer_id, user_id, last_seen_at
      `)).rows[0];
      res.status(201).json({ vehicle: out });
    } catch (err) {
      console.error('[pos.vehicles.upsert] failed:', err);
      res.status(500).json({ error: 'upsert_failed' });
    }
  });

  // === KedaiPOS Integration Endpoints ===

  // KedaiPOS webhook endpoint
  app.post('/api/kedaipos-webhook', handleKedaiPOSWebhook);
  
  // Get order status for KedaiPOS.
  // Locked to staff (Task 2.3): currently mock data, but the real
  // implementation will return live order state — never anonymous-readable.
  // If KedaiPOS itself ever needs to poll this, swap the guard for an
  // API-key header check, not anonymous access.
  app.get('/api/kedaipos/order/:transaction_id/status', requireStaff, getOrderStatus);

  // Update queue status from KedaiPOS.
  // Locked to staff (Task 2.3): a queue status change is a destructive
  // operation that must be tied to a known operator.
  app.patch('/api/kedaipos/queue/:transaction_id', requireStaff, requireStaffRole('owner', 'manager', 'lane', 'cashier'), updateQueueStatus);

  // Manual POS integration endpoint for staff to add customers to queue.
  // Locked to staff (Task 2.3): mutates KedaiPOS state on behalf of the
  // shop, only operators may call it.
  app.post('/api/add-to-queue', requireStaff, requireStaffRole('owner', 'manager', 'lane', 'cashier'), async (req, res) => {
    try {
      const { transaction_id, status = 'IN_PROGRESS' } = req.body;
      
      if (!transaction_id) {
        return res.status(400).json({
          success: false,
          message: 'Transaction ID is required'
        });
      }
      
      // Update status in KedaiPOS
      const success = await kedaiPOSIntegration.updateOrderStatus(transaction_id, status);
      
      if (success) {
        console.log(`Order ${transaction_id} added to queue with status ${status}`);
        res.json({
          success: true,
          message: `Order added to queue`,
          transaction_id,
          status,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to update KedaiPOS status'
        });
      }
    } catch (error) {
      console.error('Add to queue error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // POS Dashboard endpoint - get all pending orders.
  // Locked to staff (Task 2.3): pending-order data is operational and
  // must never be exposed to anonymous traffic.
  app.get('/api/pos/pending-orders', requireStaff, async (req, res) => {
    try {
      // In a real implementation, you'd query your database for pending orders
      // For now, return mock data structure that KedaiPOS would expect
      res.json({
        pending_orders: [
          {
            transaction_id: 'CX_20250822_001',
            car_plate: 'BB1234',
            phone: '673 7654321',
            service: 'Full Package',
            amount: 12,
            branch: 'Tungku Link',
            created_at: new Date().toISOString(),
            status: 'PAID',
            queue_status: 'WAITING'
          }
        ],
        total_count: 1,
        last_updated: new Date().toISOString()
      });
    } catch (error) {
      console.error('POS pending orders error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch pending orders'
      });
    }
  });

  // NOTE: Duplicate auth routes (register/login/me/logout writing to the
  // 'auth_token' cookie) were removed 2026-05-02. They were dead code —
  // Express keeps the first registration of any path, so the active set
  // at lines ~1034-1185 (using unifiedAuth + 'cuci_auth_token') always
  // won. They also each contained a hardcoded JWT_SECRET fallback.
  // See docs/AUTH_AUDIT.md (sections 1, 2, and "Findings beyond scope").

  // Customer service history endpoint - real database query.
  // Hybrid guard (Task 2.3): a request is allowed if it's either
  //   (a) authenticated as staff (any role), or
  //   (b) authenticated as the customer who owns that license plate.
  // Without this guard, anyone could enumerate plates and pull another
  // person's wash history, which is a privacy leak.
  app.get('/api/customer/history/:carPlate?', requireStaffOrPlateOwner, async (req, res) => {
    try {
      const carPlate = req.params.carPlate || req.query.carPlate as string;
      
      if (!carPlate) {
        return res.status(400).json({ error: 'Car plate number required' });
      }

      const history = await storage.getServiceHistoryByPlate(carPlate.toUpperCase());
      
      res.json({
        records: history.map(record => ({
          id: record.id,
          service_name: record.serviceType,
          car_plate: record.carPlate,
          branch: record.branch,
          amount: record.amount / 100, // Convert cents to dollars
          service_date: record.createdAt,
          payment_status: record.status,
          transaction_id: record.transactionId,
          check_in_time: record.checkInTime,
          completed_time: record.completedTime
        }))
      });
    } catch (error) {
      console.error('Customer history error:', error);
      res.status(500).json({ error: 'Failed to fetch service history' });
    }
  });

  // Service History API endpoints for cross-app integration.
  // Locked to staff (Task 2.3): writing a service-history row is a
  // privileged operation. The KedaiPOS webhook path is separate and uses
  // its own HMAC signature check (`/api/kedaipos-webhook`).
  app.post('/api/service-history', requireStaff, requireStaffRole('owner', 'manager', 'lane', 'cashier'), async (req, res) => {
    try {
      const { carPlate, phone, serviceType, branch, amount, status, transactionId, paymentReference } = req.body;
      
      if (!carPlate || !serviceType || !branch || amount === undefined) {
        return res.status(400).json({ error: 'Missing required fields: carPlate, serviceType, branch, amount' });
      }

      const record = await storage.createServiceHistory({
        carPlate: carPlate.toUpperCase(),
        phone,
        serviceType,
        branch,
        amount: Math.round(amount * 100), // Store in cents
        status: status || 'pending',
        transactionId,
        paymentReference
      });

      res.json({ success: true, record });
    } catch (error) {
      console.error('Create service history error:', error);
      res.status(500).json({ error: 'Failed to create service history record' });
    }
  });

  // Locked to staff (Task 2.3): branch-wide history is internal data.
  app.get('/api/service-history/branch/:branch', requireStaff, async (req, res) => {
    try {
      const { branch } = req.params;
      const history = await storage.getServiceHistoryByBranch(branch);
      res.json({ records: history });
    } catch (error) {
      console.error('Get branch history error:', error);
      res.status(500).json({ error: 'Failed to fetch branch history' });
    }
  });

  // Locked to staff (Task 2.3): pending-services list drives the lane queue.
  app.get('/api/service-history/pending', requireStaff, async (req, res) => {
    try {
      const branch = req.query.branch as string | undefined;
      const pending = await storage.getPendingServices(branch);
      res.json({ records: pending });
    } catch (error) {
      console.error('Get pending services error:', error);
      res.status(500).json({ error: 'Failed to fetch pending services' });
    }
  });

  // Locked to staff (Task 2.3): only operators flip status / mark complete.
  app.patch('/api/service-history/:id', requireStaff, requireStaffRole('owner', 'manager', 'lane', 'cashier'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      
      const record = await storage.updateServiceHistory(id, updates);
      res.json({ success: true, record });
    } catch (error) {
      console.error('Update service history error:', error);
      res.status(500).json({ error: 'Failed to update service history' });
    }
  });

  registerSubscriptionRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
