import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, Crown, Users, Building2, ShieldCheck, ArrowRight, Sparkles } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { AppShell } from "@/components/dashboard/AppShell";
import type { Whoami } from "@/components/dashboard/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// --- Plan catalog (mirrors the handoff /tmp/handoff/.../landing.jsx tease) ---
type Plan = {
  id: "unlimited" | "family" | "corporate";
  name: string;
  price: string;
  oldPrice?: string; // founding-member discount: struck-through "was" price
  cadence: string;
  tagline: string;
  features: string[];
  icon: typeof Crown;
  accent: string; // tailwind bg shade for icon chip + popular ring
  popular?: boolean;
  custom?: boolean; // corporate → no self-serve, contact sales
};

// Order: Family · Unlimited (highlighted, middle) · Corporate.
// Unlimited is the most popular individual plan and sits in the middle so it
// reads as the natural "default" choice between the two extremes.
const PLANS: Plan[] = [
  {
    id: "family",
    name: "Multi-Car Family",
    price: "BND 105",
    oldPrice: "BND 150",
    cadence: "/ month",
    tagline: "Up to 3 cars in one household",
    features: [
      "Base car + up to 2 more (B$45 + B$30/car)",
      "1 wash per day per vehicle",
      "Unlimited monthly washes",
      "Shared plan management",
      "Rain re-wash guarantee",
    ],
    icon: Users,
    accent: "bg-cuci-secondary",
  },
  {
    id: "unlimited",
    name: "Unlimited Xpress",
    price: "BND 39",
    oldPrice: "BND 45",
    cadence: "/ month",
    tagline: "Single car · all branches",
    features: [
      "Founding member price — locked in while subscribed",
      "Unlimited exterior washes",
      "1 registered vehicle",
      "Rain re-wash guarantee",
      "All 5 branches included",
    ],
    icon: Crown,
    accent: "bg-cuci-primary",
    popular: true,
  },
  {
    id: "corporate",
    name: "Corporate Fleet",
    price: "Custom",
    cadence: "5+ vehicles",
    tagline: "Monthly billing · usage reports",
    features: [
      "Custom pricing for fleets",
      "Priority fleet access",
      "Detailed usage reports",
      "Dedicated onboarding",
      "Rain re-wash included",
    ],
    icon: Building2,
    accent: "bg-emerald-500",
    custom: true,
  },
];

// Subscriptions go live 19 June 2026, 7:00 PM Brunei time (UTC+8).
const LAUNCH_TS = new Date("2026-06-19T19:00:00+08:00").getTime();

type CustomerMe = {
  profile: {
    email: string | null;
    phone_number: string | null;
    customer_phone: string | null;
    first_name: string | null;
  };
};

export default function Subscriptions() {
  const { toast } = useToast();
  const [openPlan, setOpenPlan] = useState<Plan | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [carPlate, setCarPlate] = useState("");

  // Live countdown to the subscription launch (ticks every second).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const msLeft = Math.max(0, LAUNCH_TS - now);
  const launched = msLeft === 0;
  const countdown = {
    days: Math.floor(msLeft / 86_400_000),
    hours: Math.floor((msLeft % 86_400_000) / 3_600_000),
    minutes: Math.floor((msLeft % 3_600_000) / 60_000),
    seconds: Math.floor((msLeft % 60_000) / 1_000),
  };

  // Prefill when logged in. /api/customer/me returns 401 if not logged in —
  // react-query just leaves data undefined and we keep the inputs empty.
  const { data: me } = useQuery<CustomerMe>({
    queryKey: ["/api/customer/me"],
    retry: false,
  });

  useEffect(() => {
    if (openPlan && me?.profile) {
      setEmail((prev) => prev || me.profile.email || "");
      setPhone(
        (prev) => prev || me.profile.phone_number || me.profile.customer_phone || "",
      );
    }
  }, [openPlan, me]);

  const subscribeMutation = useMutation({
    mutationFn: (payload: {
      email: string;
      phone: string;
      plan: string;
      carPlate: string;
    }) => apiRequest("POST", "/api/subscription-signup", payload),
    onSuccess: async (res: any) => {
      const data = await res.json().catch(() => ({}));
      toast({
        title: openPlan?.custom ? "Thanks — we'll be in touch" : "Your founding spot is reserved",
        description:
          data?.message ||
          "You're in. We'll text you at launch (19 June) to activate your plan and book your first wash.",
      });
      setOpenPlan(null);
      setEmail("");
      setPhone("");
      setCarPlate("");
    },
    onError: (error: any) => {
      toast({
        title: "Something went wrong",
        description: error?.message || "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!openPlan) return;
    if (!email.trim()) {
      toast({
        title: "Email required",
        description: "We need an email to confirm your subscription.",
        variant: "destructive",
      });
      return;
    }
    if (!openPlan.custom && !carPlate.trim()) {
      toast({
        title: "Car plate required",
        description: "Add the plate of the car you want to register for this plan.",
        variant: "destructive",
      });
      return;
    }
    subscribeMutation.mutate({
      email: email.trim(),
      phone: phone.trim(),
      plan: openPlan.id,
      carPlate: carPlate.trim(),
    });
  };

  // Signed-in users see the same sidebar shell as /dashboard so they don't
  // get bounced out to the marketing chrome. Guests still get the public
  // navbar/footer.
  const { data: who } = useQuery<Whoami>({ queryKey: ["/api/auth/whoami"] });
  const signedIn = !!who?.authenticated;

  const pageBody = (
    <>
      <main className={signedIn ? "" : "cuci-page-bg pt-20 pb-16"}>
        {/* --- Hero --- */}
        <section className="py-16 md:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="cuci-eyebrow mb-4">Memberships</div>
              <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-gray-900 mb-6">
                Wash as much<br />
                as you <span className="text-cuci-primary">drive</span>
                <span className="text-cuci-secondary">.</span>
              </h1>
              <p className="text-lg md:text-xl text-gray-600 mb-2 max-w-3xl mx-auto leading-relaxed">
                One flat monthly fee. Drive into any branch, any time. Rain re-wash on us — designed for Brunei's everyday drivers, families and fleets.
              </p>
              <p className="text-sm text-gray-500">
                Pay-as-you-go average is <span className="font-bold">BND 15</span> per wash. Most members break even after 4 visits.
              </p>
            </motion.div>
          </div>
        </section>

        {/* --- Plan grid --- */}
        <section className="pb-12">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Founding-member scarcity banner */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              viewport={{ once: true }}
              className="relative overflow-hidden rounded-2xl border-2 border-black mb-8 p-6 md:p-8"
              style={{
                background:
                  "linear-gradient(135deg, #7C5CE7 0%, #B47CF7 55%, #FF9500 100%)",
                boxShadow: "6px 6px 0 0 rgba(0,0,0,0.92)",
              }}
              data-testid="banner-founding"
            >
              <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-5">
                <div className="text-white max-w-2xl">
                  <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-[#FFE89E] text-black px-3 py-1 text-xs font-extrabold uppercase tracking-wider mb-3">
                    <Sparkles className="w-3.5 h-3.5" /> Founding offer · 250 spots only
                  </div>
                  <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-2">
                    Be one of the first 250. Keep founding rates for life.
                  </h2>
                  <p className="text-sm md:text-base text-white/90 leading-relaxed">
                    Founding members lock in{" "}
                    <span className="font-extrabold">BND 39/mo</span> and keep it for as
                    long as they stay subscribed. Once all 250 spots are claimed,
                    Unlimited Xpress returns to its regular{" "}
                    <span className="font-extrabold">BND 45/mo</span> — no exceptions.
                  </p>
                </div>
                {/* Launch countdown */}
                <div
                  className="flex-shrink-0 w-full md:w-72 rounded-xl border-2 border-black bg-white/95 p-4"
                  data-testid="countdown-launch"
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                      {launched ? "Now live" : "Launching in"}
                    </span>
                    <span className="text-[11px] font-bold text-cuci-primary uppercase tracking-wide">
                      19 Jun · 7PM BNT
                    </span>
                  </div>
                  {launched ? (
                    <p
                      className="text-2xl font-black text-cuci-primary leading-tight"
                      data-testid="text-launch-live"
                    >
                      Subscriptions are live! 🎉
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5 text-center">
                      {[
                        { label: "Days", value: countdown.days },
                        { label: "Hrs", value: countdown.hours },
                        { label: "Min", value: countdown.minutes },
                        { label: "Sec", value: countdown.seconds },
                      ].map((u) => (
                        <div
                          key={u.label}
                          className="rounded-lg border border-black/10 bg-gray-50 py-2"
                        >
                          <div
                            className="text-2xl font-black text-cuci-primary leading-none tabular-nums"
                            data-testid={`countdown-${u.label.toLowerCase()}`}
                          >
                            {String(u.value).padStart(2, "0")}
                          </div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mt-1">
                            {u.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
            <div className="grid md:grid-cols-3 gap-6">
              {PLANS.map((plan, i) => {
                const Icon = plan.icon;

                // --- Premium gradient render branch (Unlimited Xpress) ---
                // Spec: glowing 3-stop gradient + brutalist offset + soft bloom,
                // glossy radial highlight, diagonal shimmer streak, 5 white
                // twinkles, ★ MOST PICKED badge, big white price.
                if (plan.popular) {
                  const TWINKLES = [
                    { top: 24,  left: "70%", size: 16, delay: "0s"   },
                    { top: 140, left: "20%", size: 11, delay: "0.3s" },
                    { top: 90,  left: "85%", size: 10, delay: "0.6s" },
                    { top: 280, left: "78%", size: 14, delay: "1.2s" },
                    { top: 360, left: "12%", size: 12, delay: "1.8s" },
                  ];
                  return (
                    // Outer wrapper has NO overflow:hidden so the floating
                    // badge can poke above the card without being clipped.
                    <motion.div
                      key={plan.id}
                      initial={{ opacity: 0, y: 24 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.45, delay: i * 0.08 }}
                      viewport={{ once: true }}
                      className="relative md:-translate-y-2"
                      data-testid={`plan-card-${plan.id}`}
                    >
                      {/* ★ MOST PICKED badge — lives on the OUTER wrapper so
                          the gradient card's overflow:hidden (needed for the
                          shimmer streak) doesn't slice it in half. */}
                      <div
                        className="absolute"
                        style={{
                          top: -12,
                          right: 24,
                          background: "#FF9500",
                          color: "#000",
                          border: "2px solid #000",
                          borderRadius: 999,
                          padding: "4px 12px",
                          fontSize: 11,
                          fontWeight: 800,
                          letterSpacing: 1,
                          textTransform: "uppercase",
                          zIndex: 5,
                          whiteSpace: "nowrap",
                        }}
                      >
                        ★ Most picked
                      </div>

                      {/* Inner gradient card — clips the shimmer/gloss/twinkles. */}
                      <div
                        className="relative overflow-hidden flex flex-col h-full"
                        style={{
                          background:
                            "linear-gradient(135deg, #7C5CE7 0%, #B47CF7 45%, #FF9500 100%)",
                          border: "2px solid #000",
                          borderRadius: 20,
                          padding: 32,
                          boxShadow:
                            "8px 8px 0 0 rgba(0,0,0,0.92), 0 0 60px rgba(255,149,0,0.45), 0 0 100px rgba(124,92,231,0.35)",
                        }}
                      >
                        {/* Glossy double-radial highlight */}
                        <div className="cuci-gloss" aria-hidden />
                        {/* Diagonal shimmer streak */}
                        <div className="cuci-shimmer-wrap" aria-hidden />
                        {/* Twinkle stars */}
                        {TWINKLES.map((t, ti) => (
                          <svg
                            key={ti}
                            className="cuci-twinkle"
                            width={t.size}
                            height={t.size}
                            viewBox="0 0 24 24"
                            style={{ top: t.top, left: t.left, animationDelay: t.delay }}
                            aria-hidden
                          >
                            <path
                              d="M12 0 L13.5 10.5 L24 12 L13.5 13.5 L12 24 L10.5 13.5 L0 12 L10.5 10.5 Z"
                              fill="#fff"
                            />
                          </svg>
                        ))}

                        {/* Foreground content */}
                        <div className="relative flex flex-col flex-1" style={{ zIndex: 1 }}>
                        <div
                          className="w-12 h-12 rounded-xl border-2 border-black flex items-center justify-center mb-5"
                          style={{ background: "rgba(255,255,255,0.18)" }}
                        >
                          <Icon className="w-6 h-6 text-white" strokeWidth={2.5} />
                        </div>

                        {/* Tier label — soft yellow per spec */}
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 800,
                            color: "#FFE89E",
                            textTransform: "uppercase",
                            letterSpacing: 1.5,
                            marginBottom: 6,
                          }}
                        >
                          Member · Unlimited
                        </div>

                        <h3 className="text-2xl font-extrabold mb-1" style={{ color: "#fff" }}>
                          {plan.name}
                        </h3>
                        <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.85)" }}>
                          {plan.tagline}
                        </p>

                        {/* Price — big & bold per spec */}
                        <div className="flex items-baseline justify-center gap-2 mb-7">
                          {plan.oldPrice && (
                            <span
                              style={{
                                fontSize: 26,
                                fontWeight: 700,
                                color: "rgba(255,255,255,0.6)",
                                textDecoration: "line-through",
                                lineHeight: 1,
                              }}
                              data-testid={`text-oldprice-${plan.id}`}
                            >
                              {plan.oldPrice}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: 64,
                              fontWeight: 900,
                              color: "#fff",
                              letterSpacing: "-2.5px",
                              textShadow: "0 4px 20px rgba(0,0,0,0.18)",
                              lineHeight: 1,
                            }}
                          >
                            {plan.price}
                          </span>
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: "rgba(255,255,255,0.9)",
                            }}
                          >
                            {plan.cadence}
                          </span>
                        </div>

                        <ul className="space-y-2.5 mb-7 flex-1">
                          {plan.features.map((f) => (
                            <li
                              key={f}
                              className="flex items-center gap-2.5 text-sm"
                              style={{ color: "#fff" }}
                            >
                              <span
                                className="flex items-center justify-center flex-shrink-0"
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: "50%",
                                  background: "#fff",
                                }}
                              >
                                <Check className="w-3 h-3" strokeWidth={4} style={{ color: "#7C5CE7" }} />
                              </span>
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>

                        <Button
                          onClick={() => setOpenPlan(plan)}
                          className="w-full cuci-cta rounded-lg"
                          style={{ background: "#fff", color: "#7C5CE7" }}
                          data-testid={`button-subscribe-${plan.id}`}
                        >
                          <span className="mr-1">✦</span>
                          Claim founding price
                          <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                // --- Default white card render branch (Family + Corporate) ---
                return (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: i * 0.08 }}
                    viewport={{ once: true }}
                    className="relative cuci-card p-7 flex flex-col"
                    data-testid={`plan-card-${plan.id}`}
                  >
                    <div
                      className={`w-12 h-12 rounded-xl border-2 border-black ${plan.accent} flex items-center justify-center mb-5`}
                    >
                      <Icon className="w-6 h-6 text-white" strokeWidth={2.5} />
                    </div>
                    <h3 className="text-xl font-extrabold text-gray-900 mb-1">
                      {plan.name}
                    </h3>
                    <p className="text-sm text-gray-500 mb-5">{plan.tagline}</p>
                    <div className="flex items-baseline justify-center gap-1 mb-6">
                      {plan.oldPrice && (
                        <span
                          className="text-2xl font-bold text-gray-400 line-through mr-1"
                          data-testid={`text-oldprice-${plan.id}`}
                        >
                          {plan.oldPrice}
                        </span>
                      )}
                      <span className="text-5xl font-black tracking-tight text-cuci-primary">
                        {plan.price}
                      </span>
                      <span className="text-sm text-gray-500 font-medium">
                        {plan.cadence}
                      </span>
                    </div>
                    <ul className="space-y-2.5 mb-7 flex-1">
                      {plan.features.map((f) => (
                        <li
                          key={f}
                          className="flex items-start gap-2.5 text-sm text-gray-700"
                        >
                          <Check className="w-4 h-4 text-cuci-primary mt-0.5 flex-shrink-0" strokeWidth={3} />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      onClick={() => setOpenPlan(plan)}
                      className="w-full cuci-cta bg-cuci-primary text-white rounded-lg"
                      data-testid={`button-subscribe-${plan.id}`}
                    >
                      {plan.custom ? "Contact sales" : "Claim founding price"}
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </motion.div>
                );
              })}
            </div>
            <p className="text-center text-xs text-gray-500 mt-6 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              All plans include rain re-wash guarantee · cancel anytime
            </p>
          </div>
        </section>

        {/* --- Why subscribe --- */}
        <section className="py-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="cuci-eyebrow mb-3">Why subscribe</div>
            <h3 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-10">
              Three reasons our regulars never go back.
            </h3>
            <div className="grid md:grid-cols-3 gap-5">
              {[
                {
                  emoji: "💧",
                  title: "Consistent care",
                  body: "Regular cleaning keeps your car looking sharp every week.",
                  accent: "bg-cuci-primary/10",
                },
                {
                  emoji: "💰",
                  title: "Cost savings",
                  body: "Pays for itself after 4 washes vs. drive-in pricing.",
                  accent: "bg-cuci-secondary/15",
                },
                {
                  emoji: "⏰",
                  title: "Convenience",
                  body: "Set it once. Drive in any branch, any time. No appointments.",
                  accent: "bg-emerald-100",
                },
              ].map((b) => (
                <div key={b.title} className="cuci-kpi text-left">
                  <div
                    className={`w-12 h-12 rounded-full border-2 border-black ${b.accent} flex items-center justify-center mb-4`}
                  >
                    <span className="text-2xl">{b.emoji}</span>
                  </div>
                  <h4 className="font-extrabold text-gray-900 mb-1.5 text-lg">
                    {b.title}
                  </h4>
                  <p className="text-gray-600 text-sm leading-relaxed">{b.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );

  return (
    <div className="min-h-screen">
      {signedIn ? (
        <AppShell activeTab="subscription">{pageBody}</AppShell>
      ) : (
        <>
          <Navigation />
          {pageBody}
          <Footer />
        </>
      )}

      {/* --- Subscribe / Contact dialog --- */}
      <Dialog open={openPlan !== null} onOpenChange={(o) => !o && setOpenPlan(null)}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-subscribe">
          <DialogHeader>
            <DialogTitle>
              {openPlan?.custom ? "Tell us about your fleet" : `Subscribe to ${openPlan?.name}`}
            </DialogTitle>
            <DialogDescription>
              {openPlan?.custom
                ? "Drop your details and our team will reach out within one business day."
                : "Reserve your founding spot now and lock in this price for life. We launch 19 June — we'll text you at launch to activate your plan and book your first wash."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sub-email">Email</Label>
              <Input
                id="sub-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                required
                disabled={subscribeMutation.isPending}
                data-testid="input-subscribe-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sub-phone">
                Phone <span className="text-gray-400 font-normal">(recommended)</span>
              </Label>
              <Input
                id="sub-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+673 ..."
                disabled={subscribeMutation.isPending}
                data-testid="input-subscribe-phone"
              />
            </div>
            {openPlan && !openPlan.custom && (
              <div className="space-y-1.5">
                <Label htmlFor="sub-plate">Car plate</Label>
                <Input
                  id="sub-plate"
                  value={carPlate}
                  onChange={(e) => setCarPlate(e.target.value.toUpperCase())}
                  placeholder="e.g. BAA 1234"
                  required
                  disabled={subscribeMutation.isPending}
                  data-testid="input-subscribe-plate"
                />
                <p className="text-xs text-gray-400">
                  The car you want registered on this membership.
                </p>
              </div>
            )}
            {openPlan && !openPlan.custom && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-900">{openPlan.name}</span>
                  <span className="font-extrabold text-cuci-primary">
                    {openPlan.oldPrice && (
                      <span className="text-gray-400 line-through font-semibold mr-1">
                        {openPlan.oldPrice}
                      </span>
                    )}
                    {openPlan.price}
                    <span className="text-xs font-medium text-gray-500 ml-1">
                      {openPlan.cadence}
                    </span>
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{openPlan.tagline}</p>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpenPlan(null)}
                disabled={subscribeMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={subscribeMutation.isPending}
                className="bg-cuci-primary text-white"
                data-testid="button-subscribe-submit"
              >
                {subscribeMutation.isPending
                  ? "Sending…"
                  : openPlan?.custom
                  ? "Send enquiry"
                  : "Reserve my spot"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
