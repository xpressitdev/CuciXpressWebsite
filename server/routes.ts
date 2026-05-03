import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { db } from "./db";
import { collaborationSubmissions, insertCollaborationSubmissionSchema, subscriptionSignups, insertSubscriptionSignupSchema } from "@shared/schema";
import { sendCollaborationEmail, sendPaymentConfirmation, sendSubscriptionNotification } from "./email";
import { processPocketPayPayment, handlePaymentCallback, queryTransactionStatus } from "./payment";
import { kedaiPOSIntegration } from "./kedaipos-integration";
import { handleKedaiPOSWebhook, getOrderStatus, updateQueueStatus } from "./kedaipos-webhooks";
import { unifiedAuth } from "./unified-auth";
import { lucia } from "./auth/lucia";
import { staffLucia } from "./auth/staffLucia";
import { requireLuciaUser, requireStaff, requireStaffRole, requireStaffOrPlateOwner } from "./auth/middleware";
import { sendOtp, verifyOtp, OTP_CONSTANTS } from "./auth/otp";
import { loginStaff } from "./auth/staff";
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

const investorInterestSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  investmentLevel: z.string().optional(),
  message: z.string().optional(),
});

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
  // Investor interest form submission
  app.post("/api/investor-interest", async (req, res) => {
    try {
      const data = investorInterestSchema.parse(req.body);
      
      // Log the submission (in production, this would save to database)
      console.log("New investor interest submission:", {
        ...data,
        timestamp: new Date().toISOString(),
      });
      
      // In a real application, you would:
      // 1. Save to database
      // 2. Send email notifications
      // 3. Add to CRM system
      
      res.json({ 
        success: true, 
        message: "Thank you for your interest! We will contact you soon." 
      });
    } catch (error) {
      console.error("Error processing investor interest:", error);
      
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

  // Subscription signup endpoint
  app.post("/api/subscription-signup", async (req, res) => {
    try {
      const data = insertSubscriptionSignupSchema.parse(req.body);
      
      // Check if email already exists
      const existingSignup = await db
        .select()
        .from(subscriptionSignups)
        .where(eq(subscriptionSignups.email, data.email))
        .limit(1);
      
      if (existingSignup.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: "This email is already registered for updates." 
        });
      }
      
      // Save to database
      const [signup] = await db.insert(subscriptionSignups).values(data).returning();
      
      // Send email notification
      const emailSent = await sendSubscriptionNotification({
        email: data.email,
        submittedAt: new Date().toISOString(),
      });
      
      console.log("New subscription signup saved:", {
        id: signup.id,
        email: data.email,
        emailSent,
        timestamp: signup.createdAt,
      });
      
      res.json({ 
        success: true, 
        message: "Thank you! We'll notify you when our subscription service launches." 
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

  // ============================================================
  // ADMIN — Phase 5a Owner Dashboard + Order Report (2026-05-04)
  // Owner/manager only. Read-only aggregations over orders +
  // customers + staff. All time math runs in Asia/Brunei (UTC+8).
  // ============================================================

  // GET /api/admin/dashboard?branch_id=N|all&date=YYYY-MM-DD
  // Returns 12 KPI tiles + 24-hour sales/refund breakdown.
  app.get('/api/admin/dashboard', requireStaff, requireStaffRole('owner', 'manager', 'cashier'), async (req, res) => {
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
           WHERE ticket_day = ${targetDate}::date
             ${branchFilter}
        ),
        paid AS (SELECT * FROM day_orders WHERE status <> 'refunded'),
        ref  AS (SELECT * FROM day_orders WHERE status =  'refunded')
        SELECT
          (SELECT COUNT(*)::int FROM day_orders)                                              AS today_transactions,
          (SELECT COALESCE(SUM(total_cents),0)::bigint FROM paid)                             AS today_sales_cents,
          (SELECT COUNT(*)::int FROM ref)                                                     AS today_refund_count,
          (SELECT COALESCE(SUM(total_cents),0)::bigint FROM ref)                              AS today_refund_total_cents,
          (SELECT COALESCE(SUM(1 + COALESCE(jsonb_array_length(addons),0)),0)::int FROM paid) AS today_items_sold,
          (SELECT COUNT(DISTINCT staff_id)::int   FROM day_orders WHERE staff_id IS NOT NULL)   AS today_active_staff,
          (SELECT COUNT(DISTINCT vehicle_id)::int FROM day_orders WHERE vehicle_id IS NOT NULL) AS today_active_customers,
          (SELECT COUNT(*)::int FROM staff WHERE is_active = true)                            AS total_staff,
          (SELECT COUNT(*)::int FROM customers)                                               AS total_customers
      `)).rows[0] as any;

      const hourly = (await db.execute(sql`
        SELECT EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Asia/Brunei'))::int AS hour,
               COALESCE(SUM(CASE WHEN status <> 'refunded' THEN total_cents ELSE 0 END), 0)::bigint AS sales_cents,
               COALESCE(SUM(CASE WHEN status =  'refunded' THEN total_cents ELSE 0 END), 0)::bigint AS refund_cents
          FROM orders
         WHERE ticket_day = ${targetDate}::date
           ${branchFilter}
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
          today_net_sales_cents: sales,
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
  app.get('/api/admin/reports/orders', requireStaff, requireStaffRole('owner', 'manager', 'cashier'), async (req, res) => {
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
          COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END),0)::bigint      AS sales_cents,
          COUNT(*) FILTER (WHERE o.status = 'refunded')::int                                           AS refund_count,
          COALESCE(SUM(CASE WHEN o.status =  'refunded' THEN o.total_cents ELSE 0 END),0)::bigint      AS refund_total_cents,
          COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN 1 + COALESCE(jsonb_array_length(o.addons),0) ELSE 0 END),0)::int AS items_sold
          FROM orders o
         WHERE o.ticket_day BETWEEN ${from}::date AND ${to}::date
           ${branchFilter} ${pmFilter} ${staffFilter} ${searchFilter}
      `)).rows[0] as any;

      const countRow = (await db.execute(sql`
        SELECT COUNT(*)::int AS n
          FROM orders o
         WHERE o.ticket_day BETWEEN ${from}::date AND ${to}::date
           ${branchFilter} ${pmFilter} ${staffFilter} ${searchFilter}
      `)).rows[0] as { n: number };

      const rows = (await db.execute(sql`
        SELECT o.id, o.ticket_code, o.plate, o.ticket_day, o.created_at,
               o.payment_method, o.package_name, o.total_cents, o.paid_amount_cents,
               o.change_cents, o.status, o.refunded_at, o.refund_reason,
               o.customer_name_walkin, o.original_receipt_no, o.kedaipos_pos_name,
               o.branch_id, b.name AS branch_name,
               o.staff_id, s.name AS staff_name
          FROM orders o
          LEFT JOIN branches b ON b.id = o.branch_id
          LEFT JOIN staff    s ON s.id = o.staff_id
         WHERE o.ticket_day BETWEEN ${from}::date AND ${to}::date
           ${branchFilter} ${pmFilter} ${staffFilter} ${searchFilter}
         ORDER BY o.created_at DESC
         LIMIT ${perPage} OFFSET ${offset}
      `)).rows;

      const branches = (await db.execute(
        sql`SELECT id, name FROM branches ORDER BY name`,
      )).rows;
      const staffList = (await db.execute(sql`
        SELECT id, name, role, branch_id FROM staff
         WHERE is_active = true ORDER BY name
      `)).rows;

      const txCount = Number(totals.transactions ?? 0);
      const refCount = Number(totals.refund_count ?? 0);
      const sales = Number(totals.sales_cents ?? 0);
      const refundTotal = Number(totals.refund_total_cents ?? 0);
      const paidCount = Math.max(1, txCount - refCount);

      res.json({
        filter: { branch_id: branchId, from, to, payment_method: paymentMethod, staff_id: staffParam, search },
        branches,
        staff: staffList,
        totals: {
          transactions: txCount,
          sales_cents: sales,
          refund_count: refCount,
          refund_total_cents: refundTotal,
          net_sales_cents: sales,
          items_sold: Number(totals.items_sold ?? 0),
          avg_sales_cents: txCount - refCount > 0 ? Math.round(sales / paidCount) : 0,
          avg_refund_cents: refCount > 0 ? Math.round(refundTotal / refCount) : 0,
        },
        page,
        per_page: perPage,
        total_count: countRow.n,
        rows,
      });
    } catch (err) {
      console.error('[admin.reports.orders] failed:', err);
      res.status(500).json({ error: 'report_failed' });
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
  app.get('/api/admin/reports/orders/export', requireStaff, requireStaffRole('owner', 'manager', 'cashier'), async (req, res) => {
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
         WHERE o.ticket_day BETWEEN ${from}::date AND ${to}::date
           ${branchFilter} ${pmFilter} ${staffFilter} ${searchFilter}
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
         WHERE o.ticket_day BETWEEN ${from}::date AND ${to}::date
           ${branchFilter} ${pmFilter} ${staffFilter} ${searchFilter}
         ORDER BY o.created_at ASC
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
            if (qrProvider === 'pocket_pay')          return 'Pocket Payment QR';
            if (qrProvider === 'pocket_pay_invoice')  return 'Pocket Payment Invoice';
            if (qrProvider === 'dst_easy' || qrProvider === 'quickpay') return 'Quickpay';
            if (qrProvider === 'baiduri_ms')          return 'Baiduri MS Payment Request';
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

      const xlsxMod = await import('xlsx');
      const XLSX = (xlsxMod as any).default ?? xlsxMod;

      const HEADERS = [
        'Source.Name', 'ID', 'Receipt Date', 'Receipt Time', 'Store Name',
        'POS Name', 'Employee Name', 'Is Refund', 'Original Receipt No',
        'Order Number', 'Customer Name', 'Payment Type', 'Subtotal',
        'Discount Total', 'Promocode Discount Total', 'Service Charge Total',
        'Tax Total', 'Order Total', 'Paid Amount', 'Change', 'Order Notes',
        'Item Notes', 'Extracted_Brand', 'Extracted_Model', 'License_Plate',
      ];

      const aoa: any[][] = [HEADERS];
      for (const r of rows) {
        const { dateSerial, timeFrac } = excelDateParts(new Date(r.created_at));
        aoa.push([
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
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      // Format columns C (Receipt Date) and D (Receipt Time) as date/time
      // so Power BI / Excel render them correctly.
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let R = 1; R <= range.e.r; R++) {
        const dateCell = ws[XLSX.utils.encode_cell({ r: R, c: 2 })];
        const timeCell = ws[XLSX.utils.encode_cell({ r: R, c: 3 })];
        if (dateCell) { dateCell.t = 'n'; dateCell.z = 'yyyy-mm-dd'; }
        if (timeCell) { timeCell.t = 'n'; timeCell.z = 'hh:mm:ss'; }
      }
      ws['!cols'] = HEADERS.map((h) => ({ wch: Math.min(28, Math.max(10, h.length + 2)) }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'cuci xpress');
      const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

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
  app.get('/api/admin/reports/payment-methods', requireStaff, requireStaffRole('owner', 'manager', 'cashier'), async (req, res) => {
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
          COALESCE(SUM(CASE WHEN o.status <> 'refunded' THEN o.total_cents ELSE 0 END),0)::bigint  AS sales_cents,
          COALESCE(SUM(CASE WHEN o.status =  'refunded' THEN o.total_cents ELSE 0 END),0)::bigint  AS refund_cents
          FROM orders o
         WHERE o.ticket_day BETWEEN ${from}::date AND ${to}::date
           ${branchFilter}
         GROUP BY 1, 2
         ORDER BY sales_cents DESC
      `)).rows as Array<any>;

      const totalSales = rows.reduce((a, r) => a + Number(r.sales_cents ?? 0), 0);
      const totalTx    = rows.reduce((a, r) => a + Number(r.transactions ?? 0), 0);

      const branches = (await db.execute(
        sql`SELECT id, name FROM branches ORDER BY name`,
      )).rows;

      res.json({
        filter: { branch_id: branchId, from, to },
        branches,
        totals: { transactions: totalTx, sales_cents: totalSales },
        rows: rows.map((r) => {
          const sales = Number(r.sales_cents ?? 0);
          return {
            payment_method: r.payment_method,
            qr_provider: r.qr_provider,
            transactions: Number(r.transactions ?? 0),
            paid_count: Number(r.paid_count ?? 0),
            refund_count: Number(r.refund_count ?? 0),
            sales_cents: sales,
            refund_cents: Number(r.refund_cents ?? 0),
            share_pct: totalSales > 0 ? Math.round((sales / totalSales) * 1000) / 10 : 0,
          };
        }),
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
  app.get('/api/admin/reports/best-selling', requireStaff, requireStaffRole('owner', 'manager', 'cashier'), async (req, res) => {
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
             AND ticket_day BETWEEN ${from}::date AND ${to}::date
             ${branchFilter}
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
           AND ticket_day BETWEEN ${from}::date AND ${to}::date
           ${branchFilter}
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
  app.get('/api/admin/catalog/packages', requireStaff, requireStaffRole('owner'), async (_req, res) => {
    try {
      const rows = (await db.execute(sql`
        SELECT id, name, description, duration_minutes, price_cents, is_active, sort_order, created_at
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
      res.json({
        rows: rows.map((r: any) => ({ ...r, order_count: usage.get(r.id) ?? 0 })),
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
  });

  // POST /api/admin/catalog/packages
  app.post('/api/admin/catalog/packages', requireStaff, requireStaffRole('owner'), async (req, res) => {
    const parsed = packageBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const { name, description, duration_minutes, price_cents, is_active, sort_order } = parsed.data;
    const id = `pkg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const inserted = (await db.execute(sql`
        INSERT INTO packages (id, name, description, duration_minutes, price_cents, is_active, sort_order)
        VALUES (
          ${id}, ${name}, ${description ?? null}, ${duration_minutes ?? null},
          ${price_cents}, ${is_active ?? true}, ${sort_order ?? 0}
        )
        RETURNING id, name, description, duration_minutes, price_cents, is_active, sort_order, created_at
      `)).rows[0];
      res.json({ row: inserted });
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
               sort_order       = COALESCE(${p.sort_order       ?? null}, sort_order)
         WHERE id = ${id}
         RETURNING id, name, description, duration_minutes, price_cents, is_active, sort_order, created_at
      `)).rows[0];
      if (!updated) return res.status(404).json({ error: 'not_found' });
      res.json({ row: updated });
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
  });

  // GET /api/admin/catalog/addons
  app.get('/api/admin/catalog/addons', requireStaff, requireStaffRole('owner'), async (_req, res) => {
    try {
      const rows = (await db.execute(sql`
        SELECT id, name, price_cents, is_active, sort_order
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
      res.json({
        rows: rows.map((r: any) => ({ ...r, order_count: usage.get(r.id) ?? 0 })),
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
    const { name, price_cents, is_active, sort_order } = parsed.data;
    const id = `addon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const inserted = (await db.execute(sql`
        INSERT INTO addons_catalog (id, name, price_cents, is_active, sort_order)
        VALUES (${id}, ${name}, ${price_cents}, ${is_active ?? true}, ${sort_order ?? 0})
        RETURNING id, name, price_cents, is_active, sort_order
      `)).rows[0];
      res.json({ row: inserted });
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
               sort_order  = COALESCE(${p.sort_order  ?? null}, sort_order)
         WHERE id = ${id}
         RETURNING id, name, price_cents, is_active, sort_order
      `)).rows[0];
      if (!updated) return res.status(404).json({ error: 'not_found' });
      res.json({ row: updated });
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

      // For branches without configured Place IDs, search for them dynamically
      if (placeId !== defaultPlaceId && !placeId.startsWith('ChIJ')) {
        // Get search query for the branch
        const branchQueries: { [key: string]: string } = {
          "salar-branch": "Cuci Xpress Salar Link Brunei",
          "bengkurong-branch": "Cuci Xpress Bengkurong Link Brunei", 
          "tutong-branch": "Cuci Xpress Tutong Link Brunei"
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

                    return res.json({
                      reviews: positiveReviews,
                      averageRating: reviewsData.result.rating || 0,
                      totalReviews: reviewsData.result.user_ratings_total || 0
                    });
                  }
                }
              }
            }
          } catch (error) {
            console.error(`Error fetching reviews for ${placeId}:`, error);
          }
        }
        
        // If search or review fetch fails, return empty with loading message
        return res.json({ 
          reviews: [], 
          averageRating: 0, 
          totalReviews: 0,
          message: "Loading authentic Google reviews for this location..."
        });
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

      res.json({
        reviews: positiveReviews.slice(0, 6), // Show latest 6 positive reviews
        averageRating: data.result.rating,
        totalReviews: data.result.user_ratings_total
      });

    } catch (error) {
      console.error("Error fetching Google reviews:", error);
      res.status(500).json({ 
        error: "Failed to fetch reviews",
        details: error instanceof Error ? error.message : "Unknown error"
      });
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

      const branches = [
        { name: "Tungku Link", placeId: defaultPlaceId },
        { name: "Salar", placeId: "salar-branch" },
        { name: "Bengkurong", placeId: "bengkurong-branch" },
        { name: "Tutong", placeId: "tutong-branch" }
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
              "tutong-branch": "Cuci Xpress Tutong Link Brunei"
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
        return res.json({
          averageRating: parseFloat((averageRating).toFixed(1)),
          totalReviews: totalReviewCount,
          validBranches,
          message: "Authentic Google ratings across all branches"
        });
      } else {
        return res.json({
          averageRating: 4.8,
          totalReviews: 150,
          message: "Unable to fetch authentic ratings - using estimated data"
        });
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
  app.post("/api/process-payment", async (req, res) => {
    try {
      const paymentData = req.body;
      
      // Validate required fields
      const requiredFields = ['serviceName', 'amount', 'carPlate', 'phone', 'selectedBranch'];
      const missingFields = requiredFields.filter(field => !paymentData[field]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`
        });
      }

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
          branch: paymentData.selectedBranch
        });

        // Create order in KedaiPOS system (async - don't wait)
        kedaiPOSIntegration.createOrder({
          transaction_id: result.transaction_id,
          car_plate: paymentData.carPlate,
          phone: paymentData.phone,
          service: paymentData.serviceName,
          amount: paymentData.amount,
          branch: paymentData.selectedBranch
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
            branch: paymentData.selectedBranch,
            car_plate: paymentData.carPlate,
            phone: paymentData.phone,
            success_indicator: result.success_indicator
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
  app.post('/api/verify-qr', requireStaff, async (req, res) => {
    const { qr_data } = req.body;
    
    try {
      // Parse QR code data
      let paymentData;
      try {
        paymentData = JSON.parse(qr_data);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: 'Invalid QR code format'
        });
      }

      // Validate QR code structure
      if (paymentData.type !== 'CUCI_XPRESS_PAYMENT' || !paymentData.transaction_id) {
        return res.status(400).json({
          success: false,
          message: 'Invalid Cuci Xpress payment QR code'
        });
      }

      // Verify payment status (in production, check against payment database)
      if (paymentData.status !== 'PAID') {
        return res.status(400).json({
          success: false,
          message: 'Payment not confirmed'
        });
      }

      // Return verification success with order details for POS system
      res.json({
        success: true,
        message: 'Payment verified successfully',
        order: {
          transaction_id: paymentData.transaction_id,
          service: paymentData.service,
          amount: paymentData.amount,
          branch: paymentData.branch,
          car_plate: paymentData.car_plate,
          phone: paymentData.phone,
          payment_timestamp: paymentData.timestamp,
          verified_at: new Date().toISOString()
        },
        pos_instructions: {
          action: 'ADD_TO_QUEUE',
          service_code: paymentData.service === 'Full Package' ? 'FP' : 'BW',
          prepaid: true
        }
      });
    } catch (error) {
      console.error('QR verification API error:', error);
      res.status(500).json({
        success: false,
        message: 'Verification system error'
      });
    }
  });

  // /payment-success is handled by the React SPA (wouter route)
  // Pocket Pay redirects here with successIndicator, Message, OrderId query params
  // No server-side redirect needed — Express falls through to the SPA catch-all

  // Payment callback endpoint for Pocket Pay
  app.post("/api/payment-callback", async (req, res) => {
    try {
      const callbackData = req.body;
      
      console.log('Payment callback received:', callbackData);
      
      const result = handlePaymentCallback(callbackData);
      
      if (result.success) {
        res.json({ status: 'OK', message: 'Callback processed' });
      } else {
        res.status(400).json({ status: 'ERROR', message: result.message || 'Callback processing failed' });
      }
      
    } catch (error) {
      console.error('Payment callback error:', error);
      res.status(500).json({ status: 'ERROR', message: 'Internal server error' });
    }
  });

  // Payment status query endpoint
  app.post("/api/payment-status", async (req, res) => {
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

  // === Unified Authentication Endpoints ===
  
  // Login endpoint (works for both domains)
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, email, password, remember_me } = req.body;
      const loginIdentifier = username || email;
      
      if (!loginIdentifier || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email and password are required'
        });
      }

      const result = await unifiedAuth.login(loginIdentifier, password);
      
      if (result.success && result.token) {
        // Set cross-domain cookies
        unifiedAuth.setAuthCookie(res, result.token);
        
        // Note: last_login tracking handled by queue app

        res.json({
          success: true,
          message: 'Login successful',
          user: result.user,
          token: result.token
        });
      } else {
        res.status(401).json({
          success: false,
          error: result.error || 'Login failed'
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Register endpoint
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { username, password, email, app_preference } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username and password are required'
        });
      }

      const result = await unifiedAuth.register({
        username,
        password,
        email,
        app_preference
      });
      
      if (result.success && result.token) {
        // Set cross-domain cookies
        unifiedAuth.setAuthCookie(res, result.token);

        res.json({
          success: true,
          message: 'Registration successful',
          user: result.user,
          token: result.token
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Registration failed'
        });
      }
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // Logout endpoint
  app.post('/api/auth/logout', (req, res) => {
    unifiedAuth.clearAuthCookies(res);
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });

  // Get current user endpoint with car details from queue app database
  app.get('/api/auth/me', unifiedAuth.requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.user.id);
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

  // Check token validity across domains
  app.post('/api/auth/verify-token', async (req, res) => {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'Token required'
        });
      }

      const user = await unifiedAuth.getUserFromToken(token);
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired token'
        });
      }

      res.json({
        success: true,
        user: { ...user, password: undefined },
        valid: true
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        error: 'Token verification failed'
      });
    }
  });

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
  app.get('/api/pos/catalog', requireStaff, async (_req, res) => {
    try {
      // Flat per-package pricing in BND cents (2026-05-04_03 dropped
      // the size×branch pricing matrix — Cuci Xpress prices are uniform
      // across vehicle sizes).
      const packagesRows = (await db.execute(sql`
        SELECT id, name, description, duration_minutes, price_cents, sort_order
          FROM packages
         WHERE is_active = true
         ORDER BY sort_order ASC, name ASC
      `)).rows as Array<{
        id: string;
        name: string;
        description: string | null;
        duration_minutes: number | null;
        price_cents: number;
        sort_order: number;
      }>;

      const addonsRows = (await db.execute(sql`
        SELECT id, name, price_cents, sort_order
          FROM addons_catalog
         WHERE is_active = true
         ORDER BY sort_order ASC, name ASC
      `)).rows as Array<{
        id: string;
        name: string;
        price_cents: number;
        sort_order: number;
      }>;

      res.json({
        packages: packagesRows,
        addons: addonsRows,
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

  // POST /api/pos/orders
  // Body: { package_id, plate, addon_ids[], payment_method,
  //         payment_ref?, branch_id, order_notes?, item_notes? }
  // The server authoritatively recomputes the price from the catalog and
  // generates a per-branch-per-day ticket code.
  const posOrderSchema = z.object({
    package_id: z.string().min(1),
    plate: z.string().trim().min(1).max(20),
    addon_ids: z.array(z.string().min(1)).default([]),
    payment_method: z.enum([
      'cash', 'bank_transfer', 'card', 'qr_code',
      'baiduri_pay', 'quick_pay', 'subscription', 'voucher',
    ]),
    payment_ref: z.string().trim().max(120).optional().nullable(),
    branch_id: z.number().int().positive(),
    order_notes: z.string().trim().max(500).optional().nullable(),
    item_notes: z.string().trim().max(500).optional().nullable(),
    // Phase 1 (2026-05-04): vehicle/customer linking. All optional —
    // when omitted, the server upserts a vehicle by plate and leaves
    // the customer link empty.
    vehicle_id: z.number().int().positive().optional().nullable(),
    customer_phone: z.string().trim().min(4).max(40).optional().nullable(),
    customer_name: z.string().trim().min(1).max(120).optional().nullable(),
    // Phase 2 (2026-05-04): wash-pack redemption. When the cashier
    // explicitly chooses payment_method='subscription', the client
    // sends the membership_id to redeem against. The server still
    // validates ownership + remaining balance inside the txn.
    membership_id: z.string().trim().min(1).max(60).optional().nullable(),
  });

  app.post('/api/pos/orders', requireStaff, async (req, res) => {
    const parsed = posOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_request',
        details: parsed.error.flatten(),
      });
    }
    const body = parsed.data;
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
        // 1. Look up the package + flat price (2026-05-04_03 — no size).
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
        const pkg = pkgRows[0];

        // 2. Look up + snapshot the requested addons.
        let addonSnapshots: Array<{ id: string; name: string; price_cents: number }> = [];
        if (body.addon_ids.length > 0) {
          const addonRows = (await tx.execute(sql`
            SELECT id, name, price_cents
              FROM addons_catalog
             WHERE id = ANY(${body.addon_ids})
               AND is_active = true
          `)).rows as Array<{ id: string; name: string; price_cents: number }>;
          if (addonRows.length !== body.addon_ids.length) {
            throw new PosOrderError(400, 'addon_not_available');
          }
          addonSnapshots = addonRows;
        }

        // 3. Compute totals server-side. Never trust client amounts.
        const addonsTotal = addonSnapshots.reduce((s, a) => s + a.price_cents, 0);
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
             WHERE UPPER(REGEXP_REPLACE(license_plate, '\s+', '', 'g')) = ${plateNorm}
             ORDER BY (CASE WHEN customer_id = ${posCustomerId ?? -1} THEN 0 ELSE 1 END) ASC,
                      COALESCE(last_seen_at, 'epoch'::timestamptz) DESC,
                      id DESC
             LIMIT 1
          `)).rows as any[];
          if (existing.length > 0) {
            const ex = existing[0];
            await tx.execute(sql`
              UPDATE cars SET
                customer_id  = COALESCE(customer_id, ${posCustomerId}),
                last_seen_at = now()
               WHERE id = ${ex.id}
            `);
            resolvedVehicleId = ex.id;
            if (!posCustomerId && ex.customer_id) posCustomerId = ex.customer_id;
          } else {
            const ins = (await tx.execute(sql`
              INSERT INTO cars (license_plate, customer_id, last_seen_at)
              VALUES (${plateUpper}, ${posCustomerId ?? null}, now())
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
        }

        // 7. Insert order.
        const orderId = `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        await tx.execute(sql`
          INSERT INTO orders (
            id, branch_id, staff_id, plate,
            package_id, package_name, package_price_cents,
            addons, subtotal_cents, total_cents, discount_cents,
            payment_method, payment_ref,
            ticket_code, status,
            order_notes, item_notes,
            vehicle_id, customer_name_walkin
          ) VALUES (
            ${orderId}, ${effectiveBranchId}, ${staffId}, ${plateUpper},
            ${pkg.id}, ${pkg.name}, ${pkg.price_cents},
            ${JSON.stringify(addonSnapshots)}::jsonb, ${subtotal}, ${chargedTotal}, ${discountCents},
            ${body.payment_method}, ${body.payment_ref ?? null},
            ${ticketCode}, 'paid',
            ${body.order_notes ?? null}, ${body.item_notes ?? null},
            ${resolvedVehicleId}, ${walkinName}
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
          chargedTotal, discountCents, redeemMembership,
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
          payment_method: body.payment_method,
          status: 'paid',
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
  app.post('/api/pos/orders/:id/refund', requireStaff, async (req, res) => {
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

  // GET /api/pos/orders/today?branch_id=N
  // Today's orders for a branch, newest first. Used by the right-rail of
  // the POS page so the cashier sees what's been booked.
  app.get('/api/pos/orders/today', requireStaff, async (req, res) => {
    const branchId = Number(req.query.branch_id);
    if (!Number.isFinite(branchId) || branchId <= 0) {
      return res.status(400).json({ error: 'branch_id required' });
    }
    try {
      const rows = (await db.execute(sql`
        SELECT id, ticket_code, plate, package_name,
               total_cents, payment_method, status, created_at,
               refunded_at, refund_reason
          FROM orders
         WHERE branch_id = ${branchId}
           AND ticket_day = (now() AT TIME ZONE 'UTC')::date
         ORDER BY created_at DESC
         LIMIT 50
      `)).rows;
      res.json({ orders: rows });
    } catch (err) {
      console.error('[pos.orders.today] failed:', err);
      res.status(500).json({ error: 'Failed to load today\'s orders' });
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
  app.post('/api/pos/customers', requireStaff, async (req, res) => {
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
         ORDER BY COALESCE(c.last_seen_at, 'epoch'::timestamptz) DESC, c.id DESC
         LIMIT 10
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
  app.post('/api/pos/lpr/recognize', requireStaff, async (req, res) => {
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
               cu.id AS customer_id, cu.phone AS customer_phone, cu.name AS customer_name
          FROM cars c
          LEFT JOIN customers cu ON cu.id = c.customer_id
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
  app.post('/api/pos/memberships', requireStaff, async (req, res) => {
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

  // POST /api/pos/vehicles — upsert by normalised plate.
  // Trunk-owned cars (cars.user_id IS NOT NULL) are NEVER re-bound to a
  // different user from the POS surface; we only ever attach a POS
  // customer_id when it's currently null. This protects trunk semantics.
  app.post('/api/pos/vehicles', requireStaff, async (req, res) => {
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
         WHERE UPPER(REGEXP_REPLACE(license_plate, '\s+', '', 'g')) = ${norm}
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
  app.patch('/api/kedaipos/queue/:transaction_id', requireStaff, updateQueueStatus);

  // Manual POS integration endpoint for staff to add customers to queue.
  // Locked to staff (Task 2.3): mutates KedaiPOS state on behalf of the
  // shop, only operators may call it.
  app.post('/api/add-to-queue', requireStaff, async (req, res) => {
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
  app.post('/api/service-history', requireStaff, async (req, res) => {
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
  app.patch('/api/service-history/:id', requireStaff, async (req, res) => {
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

  const httpServer = createServer(app);
  return httpServer;
}
