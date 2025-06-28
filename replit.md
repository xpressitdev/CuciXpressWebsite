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

## User Preferences

Preferred communication style: Simple, everyday language.
Landing page style: Professional but not overly pushy for investments - subtle business inquiry approach preferred.