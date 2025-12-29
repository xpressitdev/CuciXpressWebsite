# Cuci Xpress - Car Wash Business Landing Page

## Overview
Cuci Xpress is a full-stack web application for a successful car wash business. It serves as a customer-facing website showcasing services, business achievements (114K+ cars cleaned, $1M+ revenue, 6 branches), and as an investor portal for business expansion opportunities. The application integrates with a live queue system (CuciXpressLiveQue) for unified customer and service tracking via shared PostgreSQL database, and features a comprehensive Pocket Pay payment gateway with QR code receipts.

## User Preferences
Preferred communication style: Simple, everyday language.
Landing page style: Professional but not overly pushy for investments - subtle business inquiry approach preferred.

## System Architecture

### UI/UX Decisions
- **Frontend**: React 18 with TypeScript, Tailwind CSS for styling, shadcn/ui for components, Framer Motion for animations.
- **Design**: Fixed header, smooth scrolling navigation, animated counters for business metrics, customer review carousel, masonry image gallery, and a subtle investment/collaboration form.
- **Branding**: Utilizes a vibrant purple and orange color scheme, with specific accents for pricing tiers. Authentic Cuci Xpress photos and logos are used throughout.
- **Responsiveness**: Designed to be mobile-friendly and accessible.

### Technical Implementations
- **Frontend**: React 18, TypeScript, Wouter for routing, TanStack Query for server state management, Vite for building.
- **Backend**: Node.js with Express.js, TypeScript, RESTful API endpoints.
- **Database**: PostgreSQL with Drizzle ORM for type-safe operations and schema management. Neon Database is used as the serverless PostgreSQL provider.
- **Cross-App Integration**: Shares a database with the `CuciXpressLiveQue` app for unified customer records and service tracking, including real-time queue status synchronization.
- **Data Flow**: Frontend uses TanStack Query to make API calls to the Express backend. The backend validates requests using Zod schemas, processes business logic, and interacts with the PostgreSQL database via Drizzle ORM, returning JSON responses.

### Feature Specifications
- **Customer Facing**: Hero section with CTAs, animated business stats, dynamic testimonials with Google Reviews integration, interactive branch locations with Google Maps, image gallery, service pricing, and a "Queue Now" feature.
- **Investment/Collaboration Portal**: Form for capturing business inquiries with database storage and admin dashboard integration.
- **Subscription Management**: Dedicated page for subscription plans with email signup for lead capture.
- **Payment System**: Integrated Pocket Pay gateway with QR code receipt system for transaction verification and POS integration.
- **Admin Tools**: `/admin` route for managing collaboration submissions.
- **Service Status Flow**: `pending`, `in_queue`, `in_progress`, `completed`, `cancelled` states for car wash services.

## External Dependencies

- **UI/Styling**: Radix UI, Tailwind CSS, Framer Motion, Lucide React (icons).
- **Database**: PostgreSQL, Drizzle ORM, Zod (runtime validation), @neondatabase/serverless (serverless PostgreSQL driver).
- **Development/Build**: TypeScript, Vite, ESBuild, PostCSS.
- **APIs/Services**: Google Reviews API, Google Maps API, Pocket Pay (payment gateway), ImprovMX (email forwarding for collaboration form).