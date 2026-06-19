// Server-authoritative subscription plan catalog.
// Prices here are the ONLY source of truth for what a subscriber is charged —
// the client never sends an amount. Mirrors the marketing copy in
// client/src/pages/subscriptions.tsx (Unlimited B$39/mo, Family B$99/mo).
// "Corporate" is intentionally absent: it stays contact-sales (no self-serve).

export type SubscriptionPlanId = "unlimited" | "family";

export interface SubscriptionPlanDef {
  id: SubscriptionPlanId;
  name: string;
  priceCents: number;
  currency: "BND";
  /** Max vehicles this plan allows. Family covers a household of up to 3. */
  maxVehicles: number;
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, SubscriptionPlanDef> = {
  unlimited: {
    id: "unlimited",
    name: "Unlimited Xpress",
    priceCents: 3900,
    currency: "BND",
    maxVehicles: 1,
  },
  family: {
    id: "family",
    name: "Multi-Car Family",
    priceCents: 9900,
    currency: "BND",
    maxVehicles: 3,
  },
};

export function getSubscriptionPlan(
  id: string,
): SubscriptionPlanDef | undefined {
  return (SUBSCRIPTION_PLANS as Record<string, SubscriptionPlanDef>)[id];
}
