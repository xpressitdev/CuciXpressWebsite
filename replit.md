# Cuci Xpress - Car Wash Business Landing Page

## Overview

Cuci Xpress is a full-stack web application built for a car wash business that has successfully cleaned over 100,000 cars and generated $1M+ revenue across 4 branches. The application serves as both a customer-facing website showcasing the business achievements and an investor portal for business expansion opportunities.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **Styling**: Tailwind CSS with custom design system
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Animations**: Framer Motion for smooth animations and transitions
- **State Management**: TanStack Query for server state management
- **Build Tool**: Vite for fast development and optimized production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful API endpoints
- **Development Server**: Vite middleware integration for hot module replacement
- **Request Handling**: Express middleware for JSON parsing, logging, and error handling

### Data Storage Solutions
- **Database**: PostgreSQL (configured via Drizzle)
- **ORM**: Drizzle ORM for type-safe database operations
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Development Storage**: In-memory storage implementation for development
- **Database Provider**: Neon Database (serverless PostgreSQL)

## Key Components

### Frontend Components
1. **Navigation**: Fixed header with smooth scrolling navigation
2. **Hero Section**: Main landing area with call-to-action buttons
3. **Stats Dashboard**: Animated counters displaying business metrics (100K+ cars, $1M+ revenue, 4 branches)
4. **Testimonials**: Customer review carousel with star ratings
5. **Locations**: Interactive branch location display
6. **Gallery**: Masonry-style image gallery showcasing services
7. **Investment Portal**: Form-based investor interest capture system

### Backend Services
1. **Investor Interest API**: Handles form submissions with validation
2. **Static File Serving**: Serves built frontend assets in production
3. **Development Middleware**: Hot reload and error overlay for development
4. **Request Logging**: Comprehensive API request/response logging

### Database Schema
- **Users Table**: Basic user authentication structure (id, username, password)
- **Extensible Design**: Schema designed for future expansion with additional business entities

## Data Flow

1. **Client Request**: Frontend makes API calls using TanStack Query
2. **Request Processing**: Express server receives and validates requests
3. **Data Validation**: Zod schemas ensure type safety and data integrity
4. **Business Logic**: Server processes requests and handles business operations
5. **Response**: JSON responses sent back to client with appropriate status codes
6. **State Updates**: TanStack Query manages client-side cache and UI updates

## External Dependencies

### UI and Styling
- **Radix UI**: Accessible, unstyled UI primitives
- **Tailwind CSS**: Utility-first CSS framework
- **Framer Motion**: Production-ready motion library
- **Lucide React**: Icon library

### Development Tools
- **TypeScript**: Type safety across the entire stack
- **Vite**: Fast build tool with HMR support
- **ESBuild**: Fast JavaScript bundler for production builds
- **PostCSS**: CSS processing with Autoprefixer

### Database and Validation
- **Drizzle ORM**: Type-safe PostgreSQL ORM
- **Zod**: Runtime type validation
- **@neondatabase/serverless**: Serverless PostgreSQL driver

## Deployment Strategy

### Production Build Process
1. **Frontend Build**: Vite builds optimized React application to `dist/public`
2. **Backend Build**: ESBuild bundles server code to `dist/index.js`
3. **Static Assets**: Frontend assets served by Express in production
4. **Database**: Drizzle migrations ensure schema consistency

### Environment Configuration
- **Development**: `npm run dev` - Vite dev server with HMR
- **Production**: `npm run build && npm run start` - Optimized build with static serving
- **Database**: Environment-based DATABASE_URL configuration

### Deployment Platform
- **Replit**: Configured for autoscale deployment
- **Port Configuration**: Express server on port 5000, mapped to external port 80
- **Process Management**: Node.js process with proper error handling

## Changelog
- June 28, 2025. Initial setup - Created complete landing page with purple/orange branding
- June 28, 2025. Updated footer to use subtle "Get in Touch" button instead of direct investment ask
- June 28, 2025. Fixed animation warnings in stats counter component
- June 28, 2025. Added subscription pricing page with animated pricing cards
- June 28, 2025. Updated navigation to include pricing page with proper routing
- June 28, 2025. Enhanced hero section with subscription link button
- June 28, 2025. Fixed all navigation buttons to work across pages and scroll to top when returning home
- June 28, 2025. Updated footer buttons to use proper navigation with page routing support
- June 28, 2025. Added automatic scroll-to-top behavior when navigating between pages
- June 28, 2025. Integrated pricing section into home page for smooth scrolling navigation
- June 28, 2025. Updated all pricing links and buttons to scroll to pricing section on home page
- June 28, 2025. Fixed vibrant purple and orange colors in pricing component with proper styling
- June 28, 2025. Restored "Car Wash Subscriptions" header and added green color for Elite Detail plan
- June 28, 2025. Changed investment section to collaboration form supporting local businesses
- June 28, 2025. Updated navigation to highlight Live-Queue button linking to cuci-xpress.com
- June 28, 2025. Fixed hero section spacing by adding proper top padding from navigation bar
- June 28, 2025. Applied selective bold design style - kept clean design for Stats, Testimonials, Locations, and Gallery sections while maintaining bold styling for Hero, Pricing, and Collaboration components
- June 28, 2025. Integrated Google Reviews API for authentic customer testimonials with comprehensive error handling, diagnostic tools, and fallback content for API configuration issues
- June 28, 2025. Implemented review filtering to display only 4-5 star reviews, excluding resolved customer service cases for representative experience showcase
- June 28, 2025. Updated all 4 shop locations with authentic Google Maps data: Tungku Link, Salar Link, Bengkurong Link, and Tutong Link with real addresses and operating hours
- June 29, 2025. Combined testimonials and locations sections into one interactive component with dynamic Google Reviews for all branches
- June 29, 2025. Fixed branch naming: removed "Link" suffix from Salar, Bengkurong, and Tutong branches (kept only for Tungku Link)
- June 29, 2025. Expanded testimonials display to show 3-4 authentic Google Reviews in 2-column grid layout for better user experience
- June 29, 2025. Updated Stats section to display exact numbers: "100,592 Cars Cleaned and counting" and "4 Action Branches (2 coming soon)"
- June 29, 2025. Integrated real-time average rating calculation (4.7/5) from authentic Google Reviews across all branches
- June 29, 2025. Fixed navigation: "Reviews" and "Locations" buttons now scroll to the combined locations section
- June 29, 2025. Replaced gallery stock images with 6 authentic Cuci Xpress business photos showcasing real facilities, equipment, branding, and services
- June 29, 2025. Updated active branches stat to show "4 Active Branches" with "(2 more coming soon)" subtitle below
- June 29, 2025. Added "pay with ding!" image as main gallery feature showcasing customer service and digital payment options
- June 29, 2025. Updated subscription pricing to authentic rates: Basic Wash BND100/mo, Premium Clean BND120/mo, Elite Detail BND150/mo
- June 29, 2025. Deployed website and helped troubleshoot domain connection - identified TXT record conflict preventing proper domain routing to Replit deployment
- June 29, 2025. Successfully resolved DNS configuration issues by moving domain from Squarespace to GoDaddy and fixing TXT record conflicts - website now live at cucixpress.com
- July 1, 2025. Added custom Cuci Xpress logo as favicon for better brand recognition in browser tabs and bookmarks
- July 1, 2025. Updated all branch addresses with authentic Google Maps locations and fixed Get Directions functionality to use business names for accurate navigation
- July 12, 2025. Updated all branch opening hours to accurate Google Maps times: Daily 8:00 AM - 7:00 PM for all 4 locations
- July 12, 2025. Implemented Option 2 feedback: Added separate Service Pricing section for current car wash services (BND 8-18) and updated Subscription section with "Coming Soon" message and email signup to capture leads
- July 12, 2025. Implemented collaboration form database storage and admin dashboard: Created PostgreSQL schema for submissions, email notifications via ImprovMX forwarding to cucixpress.bn@gmail.com, and professional admin interface at /admin route for viewing and managing submissions
- July 12, 2025. Moved subscription section to dedicated /subscriptions page: Created comprehensive subscription page with email signup functionality, planned package previews, and benefits overview. Updated navigation to include "Subscriptions" link and simplified home page by replacing subscription section with redirect button
- July 12, 2025. Updated subscription packages per business recommendations: Implemented realistic exterior-wash-only subscription tiers - Unlimited Xpress Wash (BND60/month), Multi-Car Family Plan (BND150/month), and Corporate Plan (custom pricing). Fixed navigation routing to properly direct to /subscriptions page and restored colorful pricing theme with purple, orange, and green accents

## User Preferences

Preferred communication style: Simple, everyday language.
Landing page style: Professional but not overly pushy for investments - subtle business inquiry approach preferred.