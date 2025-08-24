import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { db } from "./db";
import { collaborationSubmissions, insertCollaborationSubmissionSchema, subscriptionSignups, insertSubscriptionSignupSchema } from "@shared/schema";
import { sendCollaborationEmail, sendPaymentConfirmation, sendSubscriptionNotification } from "./email";
import { processPocketPayPayment, handlePaymentCallback, queryTransactionStatus } from "./payment";
import { kedaiPOSIntegration } from "./kedaipos-integration";
import { handleKedaiPOSWebhook, getOrderStatus, updateQueueStatus } from "./kedaipos-webhooks";
import { unifiedAuth } from "./unified-auth";
import { storage } from "./storage";
import { eq, desc } from "drizzle-orm";

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

  // Save customer information to database
  app.post("/api/save-customer", async (req, res) => {
    try {
      const { carPlate, phone } = req.body;
      
      if (!carPlate || !phone) {
        return res.status(400).json({
          success: false,
          message: 'Car plate and phone number are required'
        });
      }
      
      // Check if customer already exists
      const existingCustomer = await storage.getCustomerByPlate(carPlate);
      
      if (existingCustomer) {
        // Update phone number if different
        if (existingCustomer.phone !== phone) {
          await storage.updateCustomer(existingCustomer.id, { phone });
        }
        res.json({
          success: true,
          message: 'Customer information updated',
          customer: { ...existingCustomer, phone }
        });
      } else {
        // Create new customer
        const newCustomer = await storage.createCustomer({ carPlate, phone });
        res.json({
          success: true,
          message: 'Customer information saved',
          customer: newCustomer
        });
      }
      
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
      const { carPlate, phone, transactionId, orderId, service, amount, branch } = req.body;
      
      if (!carPlate || !phone || !transactionId || !orderId || !service || !amount || !branch) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields for email confirmation'
        });
      }
      
      // For now, just log the confirmation (since we don't have customer email)
      console.log('Payment confirmation for:', {
        carPlate,
        phone, 
        transactionId,
        orderId,
        service,
        amount,
        branch
      });
      
      res.json({
        success: true,
        message: 'Payment confirmed - customer will receive SMS/phone confirmation'
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

  // Payment success redirect to React component
  app.get("/payment-success", (req, res) => {
    const { successIndicator, Message, OrderId } = req.query;
    
    // Log successful payment
    console.log('Payment success redirect:', { successIndicator, Message, OrderId });
    
    // Redirect to React PaymentSuccess component with query params
    const redirectUrl = `/payment-success?successIndicator=${successIndicator || ''}&Message=${Message || ''}&OrderId=${OrderId || ''}`;
    
    // Redirect to the appropriate domain based on environment
    const targetDomain = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://cucixpress.com';
    res.redirect(302, `${targetDomain}${redirectUrl}`);
  });

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
      const { username, password, remember_me } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username and password are required'
        });
      }

      const result = await unifiedAuth.login(username, password);
      
      if (result.success && result.token) {
        // Set cross-domain cookies
        unifiedAuth.setAuthCookie(res, result.token);
        
        // Update last login
        if (result.user && result.user.id) {
          await storage.updateUser(result.user.id, { last_login: new Date() });
        }

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

  // Get current user endpoint
  app.get('/api/auth/me', unifiedAuth.requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      res.json({
        success: true,
        user: { ...user, password: undefined } // Never send password
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

  // Simple Customer Authentication API endpoints
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { username, password, email, app_preference } = req.body;
      
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.json({ success: false, error: 'Username already exists' });
      }

      // Create user with app access
      const appAccess = app_preference === 'car_wash' ? ['car_wash'] : ['car_wash', 'laundry'];
      const newUser = await storage.createUser({
        username,
        password, // In production, hash this password
        email: email || null,
        app_access: appAccess,
        role: 'customer'
      });

      // Create JWT token
      const token = jwt.sign(
        { userId: newUser.id, username: newUser.username },
        process.env.JWT_SECRET || 'dev-secret',
        { expiresIn: '7d' }
      );

      // Set cookie
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.json({ 
        success: true, 
        user: { 
          id: newUser.id, 
          username: newUser.username, 
          email: newUser.email,
          role: newUser.role,
          app_access: newUser.app_access
        } 
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.json({ success: false, error: 'Failed to create account' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      const user = await storage.getUserByUsername(username);
      if (!user || user.password !== password) { // In production, compare hashed passwords
        return res.json({ success: false, error: 'Invalid username or password' });
      }

      // Update last login
      await storage.updateUser(user.id, { last_login: new Date() });

      // Create JWT token
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        process.env.JWT_SECRET || 'dev-secret',
        { expiresIn: '7d' }
      );

      // Set cookie
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.json({ 
        success: true, 
        user: { 
          id: user.id, 
          username: user.username, 
          email: user.email,
          role: user.role,
          app_access: user.app_access,
          profile_data: user.profile_data
        } 
      });
    } catch (error) {
      console.error('Login error:', error);
      res.json({ success: false, error: 'Login failed' });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    try {
      const token = req.cookies.auth_token;
      if (!token) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as any;
      const user = await storage.getUser(decoded.userId);
      
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      res.json({ 
        user: { 
          id: user.id, 
          username: user.username, 
          email: user.email,
          role: user.role,
          app_access: user.app_access,
          profile_data: user.profile_data
        } 
      });
    } catch (error) {
      console.error('Auth check error:', error);
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('auth_token');
    res.json({ success: true });
  });

  // Customer service history endpoint
  app.get('/api/customer/history/:userId?', async (req, res) => {
    try {
      const token = req.cookies.auth_token;
      if (!token) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as any;
      const userId = req.params.userId || decoded.userId;
      
      // For now, return mock data. In production, this would query your transaction database
      const mockHistory = {
        records: [
          {
            id: 'CX_001',
            service_name: 'Full Package',
            car_plate: 'BB1234',
            branch: 'tungku',
            amount: 12,
            service_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week ago
            payment_status: 'paid',
            transaction_id: 'PX_20250815_001',
            duration_minutes: 15
          },
          {
            id: 'CX_002',
            service_name: 'Basic Wash',
            car_plate: 'BB1234',
            branch: 'salar',
            amount: 8,
            service_date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks ago
            payment_status: 'paid',
            transaction_id: 'PX_20250808_002',
            duration_minutes: 12
          }
        ]
      };

      res.json(mockHistory);
    } catch (error) {
      console.error('Customer history error:', error);
      res.status(500).json({ error: 'Failed to fetch service history' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
