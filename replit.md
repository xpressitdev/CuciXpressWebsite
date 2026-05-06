# Cuci Xpress - Car Wash Business Landing Page

Cuci Xpress is a full-stack web application providing a customer-facing landing page, an investor portal, and a comprehensive Point-of-Sale (POS) system for a car wash business, integrating with a live queue and payment gateway.

## Run & Operate

```bash
# Install dependencies
npm install

# Run the development server
npm run dev

# Build for production
npm run build

# Run typecheck
npm run typecheck

# Generate Drizzle ORM migrations
npm run generate-migrations

# Push DB schema changes (DrizzleKit)
npm run db:push
```

**Required Environment Variables:**
- `DATABASE_URL`: PostgreSQL connection string (e.g., Neon DB).
- `JWT_SECRET`: 32+ character secret for legacy JWTs.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`: For Google OAuth.
- `GEMINI_API_KEY`: API key for Google Gemini (LPR).
- `REPL_ID`: Replit deployment ID for trusted proxies.
- `REPL_IMAGE_URL`: Replit image URL for asset paths.

## Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Framer Motion, Wouter, TanStack Query.
- **Backend**: Node.js, Express.js, TypeScript, RESTful API.
- **Database**: PostgreSQL (Neon DB), Drizzle ORM, Zod.
- **Auth**: Lucia v3 (customer/staff), Google OAuth (via Arctic), OTP module.
- **Build Tool**: Vite.

## Where things live

- `/client`: Frontend source code.
- `/server`: Backend source code.
- `/shared`: Shared types and schemas (Zod, Drizzle).
- `/public`: Static assets.
- `/migrations`: Drizzle DB migrations.
- `shared/schema.ts`: Database schema definition (source of truth).
- `server/routes.ts`: Backend API routes.
- `client/src/index.css`: Global Tailwind and custom CSS.

## Architecture decisions

- **Unified Database**: Shares a PostgreSQL database with the CuciXpressLiveQue app for centralized customer and service data, making this app a consumer of the master DB.
- **Hybrid Authentication**: Designed for a phased migration from legacy JWT to Lucia v3, with Google OAuth and OTP login integrated, allowing both systems to coexist.
- **Transactional POS Operations**: Critical POS actions (order creation, membership redemption, refunds) are wrapped in database transactions to ensure data consistency and atomicity.
- **Flexible Car & Customer Management**: Introduced separate `customers` and `cars` tables to support both registered users and walk-in customers/vehicles, with POS workflows designed for efficient lookups and upserts.
- **Brutalist UI Refresh**: Adopted a distinct neo-brutalist design language for key user-facing components and administrative interfaces, applying consistent styling across different pages.

## Product

- **Customer-facing Landing Page**: Showcases services, business achievements, customer testimonials, and branch locations.
- **Investor Portal**: Provides a form for business inquiries and collaboration opportunities.
- **Service Queue Integration**: Displays live car wash queue status and estimated wait times.
- **POS System**: Manages car wash orders, packages, add-ons, customer/vehicle details, memberships, and refunds.
- **Admin Dashboard**: Offers reporting for sales, refunds, payment methods, best-selling items, and trends; includes tools for managing collaborations, shifts, staff, customers, and branches.
- **Customer Dashboard**: Allows logged-in customers to view their orders, memberships, and saved vehicles.
- **License Plate Recognition (LPR)**: Integrates with Google Gemini to automatically recognize license plates for faster POS checkout.
- **Cashier Shift Management**: Enables cashiers to open, manage, and close shifts with cash reconciliation.

## User preferences

Preferred communication style: Simple, everyday language.
Landing page style: Professional but not overly pushy for investments - subtle business inquiry approach preferred.

## Gotchas

- **Auth System Transition**: Be mindful of the coexistence of legacy JWT and Lucia v3 authentication. Changes to auth flows must consider both systems.
- **OTP Delivery**: OTP codes are currently dev-mocked (printed to console/file). Real-world delivery requires integration with a service like WhatsApp Business API.
- **LPR Dependency**: The License Plate Recognition feature relies on Google Gemini. Ensure `GEMINI_API_KEY` is correctly configured, as its absence or errors will soft-fail to manual entry.
- **Database Unique Constraints**: `cars_plate_normalized_unique` ensures no two cars share a normalized plate. Operations involving vehicle plate updates must respect this.
- **Branch-Scoped Packages**: Packages can be restricted to specific branches. When adding or editing packages, verify their branch assignments.

## Pointers

- **Drizzle ORM Documentation**: _Populate as you build_
- **Tailwind CSS Documentation**: _Populate as you build_
- **Lucia Auth Documentation**: _Populate as you build_
- **Google Gemini API Documentation**: _Populate as you build_
- **PostgreSQL Documentation**: _Populate as you build_
```