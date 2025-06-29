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
