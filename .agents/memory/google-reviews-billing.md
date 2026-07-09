---
name: Google reviews badge — real data needs Places billing
description: Why the landing-page rating badge can silently show fake 4.8/150 and the cost guardrails around the Places API
---

The landing-page Google rating badge and testimonials pull live data from the
Google Places API. On ANY failure (most commonly REQUEST_DENIED because the
Google Cloud project has no billing linked) the API falls back to an invented
"4.8 stars / 150 reviews" — it looks real but isn't.

**Why:** Google Places requires billing enabled on the exact project that owns
the API key (a card on file, even within the free tier). The user has multiple
Google Cloud projects; linking billing to the wrong one still yields
REQUEST_DENIED. Fixed 2026-07-09; real figures then were 4.7 / 45 across 5
branches.

**How to apply:** If the badge shows 4.8/150 again, test the key directly
(node fetch to place/details with GOOGLE_PLACES_API_KEY + GOOGLE_BUSINESS_PLACE_ID)
and read the `message` field of /api/average-rating — it says whether data is
authentic or estimated. Keep the cost guardrails intact: responses are cached
in-memory (12h success / 10min failure) and /api/reviews only accepts the
default place or the 4 known branch slugs — never let arbitrary placeId query
values reach Google (paid quota + cache-spam abuse). Owner also set a USD 10
budget alert on the billing account.
