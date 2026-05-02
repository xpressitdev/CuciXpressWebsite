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
import { requireLuciaUser } from "./auth/middleware";
import { sendOtp, verifyOtp, OTP_CONSTANTS } from "./auth/otp";
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

  // Admin endpoint to get collaboration submissions
  app.get("/api/admin/collaborations", async (req, res) => {
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
  app.patch("/api/admin/collaborations/:id/read", async (req, res) => {
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
  app.get("/api/admin/subscriptions", async (req, res) => {
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

  // QR Code Verification API for staff scanning
  app.post('/api/verify-qr', async (req, res) => {
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

  // === KedaiPOS Integration Endpoints ===

  // KedaiPOS webhook endpoint
  app.post('/api/kedaipos-webhook', handleKedaiPOSWebhook);
  
  // Get order status for KedaiPOS
  app.get('/api/kedaipos/order/:transaction_id/status', getOrderStatus);
  
  // Update queue status from KedaiPOS
  app.patch('/api/kedaipos/queue/:transaction_id', updateQueueStatus);
  
  // Manual POS integration endpoint for staff to add customers to queue
  app.post('/api/add-to-queue', async (req, res) => {
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

  // POS Dashboard endpoint - get all pending orders
  app.get('/api/pos/pending-orders', async (req, res) => {
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

  // Customer service history endpoint - real database query
  app.get('/api/customer/history/:carPlate?', async (req, res) => {
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

  // Service History API endpoints for cross-app integration
  app.post('/api/service-history', async (req, res) => {
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

  app.get('/api/service-history/branch/:branch', async (req, res) => {
    try {
      const { branch } = req.params;
      const history = await storage.getServiceHistoryByBranch(branch);
      res.json({ records: history });
    } catch (error) {
      console.error('Get branch history error:', error);
      res.status(500).json({ error: 'Failed to fetch branch history' });
    }
  });

  app.get('/api/service-history/pending', async (req, res) => {
    try {
      const branch = req.query.branch as string | undefined;
      const pending = await storage.getPendingServices(branch);
      res.json({ records: pending });
    } catch (error) {
      console.error('Get pending services error:', error);
      res.status(500).json({ error: 'Failed to fetch pending services' });
    }
  });

  app.patch('/api/service-history/:id', async (req, res) => {
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
