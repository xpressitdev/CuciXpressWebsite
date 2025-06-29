import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";

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
      const data = collaborationInterestSchema.parse(req.body);
      
      // Log the submission (in production, this would save to database)
      console.log("New collaboration interest submission:", {
        ...data,
        timestamp: new Date().toISOString(),
      });
      
      // In a real application, you would:
      // 1. Save to database
      // 2. Send email notifications
      // 3. Add to CRM system
      
      res.json({ 
        success: true, 
        message: "Thank you for your collaboration interest! We will contact you soon." 
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
        const searchQuery = getBranchSearchQuery(placeId);
        if (searchQuery) {
          const foundPlaceId = await searchGooglePlaceId(searchQuery, apiKey);
          if (foundPlaceId) {
            // Use the found Place ID to get reviews
            const reviewsResponse = await fetch(
              `https://maps.googleapis.com/maps/api/place/details/json?place_id=${foundPlaceId}&fields=reviews,rating,user_ratings_total&key=${apiKey}`
            );
            if (reviewsResponse.ok) {
              const reviewsData = await reviewsResponse.json();
              if (reviewsData.status === "OK") {
                // Process and return authentic reviews for this branch
                const processedReviews = processGoogleReviews(reviewsData);
                return res.json(processedReviews);
              }
            }
          }
        }
        // If search fails, return empty reviews with message
        return res.json({ 
          reviews: [], 
          averageRating: 0, 
          totalReviews: 0,
          message: "Authentic reviews loading for this location..."
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

  // Serve diagnostic page for API testing
  app.get("/diagnostic", (req, res) => {
    res.sendFile(process.cwd() + "/diagnostic.html");
  });

  const httpServer = createServer(app);
  return httpServer;
}
