import {
  Trophy,
  Award,
  Sparkles,
  Crown,
  MapPin,
  Gift,
  Flame,
  Sunrise,
  Medal,
  type LucideIcon,
} from "lucide-react";
import { OrderRow, MembershipRow } from "./types";

export const TONES = {
  bronze:   "from-amber-700 via-orange-600 to-yellow-700",
  silver:   "from-slate-400 via-gray-400 to-slate-500",
  gold:     "from-amber-400 via-yellow-500 to-orange-500",
  platinum: "from-purple-500 via-violet-500 to-pink-500",
  diamond:  "from-cyan-400 via-sky-500 to-blue-600",
} as const;

export type ToneKey = keyof typeof TONES;

export interface Achievement {
  id: string;
  label: string;
  desc: string;          // short tagline (used on row card)
  longDesc: string;      // full explanation (used on dedicated page)
  howTo: string;         // one-line tip telling the user how to unlock
  icon: LucideIcon;
  unlocked: boolean;
  unlockedAt?: string;   // ISO date when condition was first met (best-effort)
  progress?: { current: number; target: number };
  tone: ToneKey;
  rewardLabel: string;   // what the badge "represents", flavour copy
}

// Single source of truth: takes the raw orders + memberships, produces a
// stable, ordered list of achievement records the row card and the
// dedicated page both render. Keeping the math here means tweaking the
// thresholds in one spot updates every surface that shows badges.
export function computeAchievements(
  orders: OrderRow[],
  memberships: MembershipRow[],
): Achievement[] {
  // --- raw signals ---
  const sortedByDate = [...orders].sort(
    (a, b) => +new Date(a.created_at) - +new Date(b.created_at),
  );
  const total = orders.length;

  // distinct branches visited (max 5 in Brunei)
  const branches = new Set(
    orders.map((o) => o.branch_name).filter((x): x is string => !!x),
  );

  // freebie redemption (loyalty / voucher)
  const freebieOrder = sortedByDate.find(
    (o) => o.payment_method === "voucher" || o.total_cents === 0,
  );

  // package family tally
  const pkgTally = new Map<string, number>();
  for (const o of orders) {
    const fam = /premium/i.test(o.package_name)
      ? "premium"
      : /full/i.test(o.package_name)
        ? "full"
        : /basic/i.test(o.package_name)
          ? "basic"
          : "other";
    pkgTally.set(fam, (pkgTally.get(fam) ?? 0) + 1);
  }
  const premiumCount = pkgTally.get("premium") ?? 0;

  // early bird washes (before 08:00 local)
  const earlyOrders = sortedByDate.filter(
    (o) => new Date(o.created_at).getHours() < 8,
  );

  // distinct calendar months washed in
  const months = new Set(
    orders.map((o) => {
      const d = new Date(o.created_at);
      return `${d.getFullYear()}-${d.getMonth()}`;
    }),
  );

  // helper: ISO date when the Nth wash happened (best-effort unlock date)
  const dateOfNth = (n: number) =>
    sortedByDate[n - 1]?.created_at ?? undefined;

  return [
    {
      id: "first-wash",
      label: "First Splash",
      desc: "Complete your first wash",
      longDesc:
        "Welcome to the family. The very first time a CuciXpress vehicle waves you through, this badge is yours forever.",
      howTo: "Drive in to any of our 5 branches and pay for one wash.",
      icon: Sparkles,
      unlocked: total >= 1,
      unlockedAt: total >= 1 ? dateOfNth(1) : undefined,
      progress: { current: Math.min(total, 1), target: 1 },
      tone: "bronze",
      rewardLabel: "Bronze · Welcome badge",
    },
    {
      id: "regular",
      label: "Regular",
      desc: "10 lifetime washes",
      longDesc:
        "Ten washes means we know your plate. You're officially part of the routine — bonus points if you've already picked your favourite branch.",
      howTo: "Reach 10 paid washes on your account.",
      icon: Award,
      unlocked: total >= 10,
      unlockedAt: total >= 10 ? dateOfNth(10) : undefined,
      progress: { current: Math.min(total, 10), target: 10 },
      tone: "silver",
      rewardLabel: "Silver · Routine driver",
    },
    {
      id: "centurion",
      label: "Centurion",
      desc: "100 lifetime washes",
      longDesc:
        "One hundred washes. Your car has spent a small fortune on shampoo and looks immaculate for it. Wear the gold trophy with pride.",
      howTo: "Hit 100 paid washes — typically 2 years of weekly visits.",
      icon: Trophy,
      unlocked: total >= 100,
      unlockedAt: total >= 100 ? dateOfNth(100) : undefined,
      progress: { current: Math.min(total, 100), target: 100 },
      tone: "gold",
      rewardLabel: "Gold · Hall of fame",
    },
    {
      id: "explorer",
      label: "Branch Explorer",
      desc: "Visit all 5 branches",
      longDesc:
        "Stamp your passport at every CuciXpress branch in Brunei. Same great wash, slightly different scenery.",
      howTo: "Wash at each of our 5 locations at least once.",
      icon: MapPin,
      unlocked: branches.size >= 5,
      progress: { current: Math.min(branches.size, 5), target: 5 },
      tone: "platinum",
      rewardLabel: "Platinum · Nationwide",
    },
    {
      id: "premium-loyalist",
      label: "Premium Loyalist",
      desc: "Top up Premium 5+ times",
      longDesc:
        "You don't compromise. Five Premium washes proves it — full interior detail, the works, every time.",
      howTo: "Buy our Premium package on 5 different visits.",
      icon: Crown,
      unlocked: premiumCount >= 5,
      progress: { current: Math.min(premiumCount, 5), target: 5 },
      tone: "gold",
      rewardLabel: "Gold · Top-tier choice",
    },
    {
      id: "freebie-claimer",
      label: "Reward Claimer",
      desc: "Redeem a free wash",
      longDesc:
        "Loyalty pays. Cash in a free wash from your stamp card or a promo voucher and this badge unlocks.",
      howTo: "Fill your loyalty stamp card and redeem the free wash at checkout.",
      icon: Gift,
      unlocked: !!freebieOrder,
      unlockedAt: freebieOrder?.created_at,
      tone: "platinum",
      rewardLabel: "Platinum · Loyalty perk",
    },
    {
      id: "early-bird",
      label: "Early Bird",
      desc: "3+ washes before 8 AM",
      longDesc:
        "Rise and shine. Three washes clocked in before 8 AM proves you beat the queue and get back to your day.",
      howTo: "Visit any branch before 8:00 AM on three separate days.",
      icon: Sunrise,
      unlocked: earlyOrders.length >= 3,
      unlockedAt: earlyOrders.length >= 3 ? earlyOrders[2]?.created_at : undefined,
      progress: { current: Math.min(earlyOrders.length, 3), target: 3 },
      tone: "bronze",
      rewardLabel: "Bronze · Early riser",
    },
    {
      id: "year-rounder",
      label: "Year Rounder",
      desc: "Wash in 6 different months",
      longDesc:
        "Rain, shine or haze, your car stays clean. Wash in six distinct calendar months and prove you're in it for the long haul.",
      howTo: "Spread your washes across 6 different months in any year.",
      icon: Flame,
      unlocked: months.size >= 6,
      progress: { current: Math.min(months.size, 6), target: 6 },
      tone: "silver",
      rewardLabel: "Silver · Consistency",
    },
    {
      id: "subscriber",
      label: "VIP Member",
      desc: "Subscribe to any plan",
      longDesc:
        "Unlimited washes, premium care, no thinking required. Subscribers get the diamond badge — the highest tier we award.",
      howTo: "Subscribe to any monthly plan from the Subscription tab.",
      icon: Medal,
      unlocked: memberships.length > 0,
      unlockedAt: memberships[0]?.created_at,
      tone: "diamond",
      rewardLabel: "Diamond · Premium member",
    },
  ];
}
