import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { PricingContainer } from "@/components/ui/pricing-container";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const pricingPlans = [
  {
    name: "Unlimited Xpress Wash",
    monthlyPrice: 60,
    yearlyPrice: 648,
    features: [
      "Unlimited exterior washes",
      "1 registered vehicle",
      "Limit: 1 wash per day",
      "Rain Re-Wash Guarantee",
      "All locations included",
      "Wash history tracking"
    ],
    accent: "#6C5CE7",
    rotation: -2,
  },
  {
    name: "Multi-Car Family Plan", 
    monthlyPrice: 150,
    yearlyPrice: 1620,
    features: [
      "Up to 3 vehicles covered",
      "1 wash per day per vehicle",
      "Unlimited monthly washes",
      "Rain Re-Wash Guarantee",
      "Shared plan management",
      "Easy multi-plate registration"
    ],
    isPopular: true,
    accent: "#FFA500",
    rotation: 1,
  },
  {
    name: "Corporate Plan",
    monthlyPrice: 0, 
    yearlyPrice: 0,
    features: [
      "Custom pricing (5+ vehicles)",
      "Monthly or prepaid billing",
      "Priority fleet access",
      "Detailed usage reports",
      "Custom onboarding support",
      "Rain Re-Wash included"
    ],
    accent: "#22C55E",
    rotation: -1,
    isCustom: true,
  },
];

export default function Subscriptions() {
  const [email, setEmail] = useState("");
  const [showPlannedPackages, setShowPlannedPackages] = useState(false);
  const { toast } = useToast();

  const subscriptionMutation = useMutation({
    mutationFn: (email: string) => apiRequest('POST', '/api/subscription-signup', { email }),
    onSuccess: () => {
      setEmail("");
      toast({
        title: "Thanks for signing up!",
        description: "We'll notify you when our subscription service launches.",
      });
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to sign up. Please try again.";
      toast({
        title: "Sign up failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleSubscriptionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({
        title: "Email required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }
    subscriptionMutation.mutate(email);
  };

  return (
    <div className="min-h-screen">
      <Navigation />
      <main className="cuci-page-bg pt-20 pb-16">
        {/* Hero — eyebrow + duotone headline mirrors /queue & /login. */}
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="cuci-eyebrow mb-4">Memberships · Coming soon</div>
              <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-gray-900 mb-6">
                Wash as much<br />as you <span className="text-cuci-primary">drive</span>
                <span className="text-cuci-secondary">.</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
                One flat monthly fee. Drive in any branch, any time. Rain re-wash on us — designed for Brunei's everyday drivers, families and fleets.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Subscription Section */}
        <section className="pb-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Not Yet Live Banner — brutalist card, gradient backdrop. */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="text-center mb-12 max-w-3xl mx-auto"
            >
              <div
                className="cuci-card p-8 md:p-10"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(257, 74%, 97%) 0%, hsl(36, 100%, 96%) 100%)",
                }}
              >
                <div className="cuci-eyebrow mb-3">Join the waitlist</div>
                <h3 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-4">
                  We're <span className="text-cuci-primary">almost ready</span>.
                </h3>
                <p className="text-base text-gray-600 mb-6 max-w-xl mx-auto leading-relaxed">
                  We're finalising our exterior-wash subscription plans for Brunei's climate. Drop your email — we'll ping you the moment they go live.
                </p>
                <form onSubmit={handleSubscriptionSubmit} className="flex flex-col sm:flex-row gap-3 justify-center items-stretch max-w-md mx-auto mb-5">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    required
                    disabled={subscriptionMutation.isPending}
                    className="flex-1 px-4 py-3 border-2 border-black rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-cuci-primary disabled:opacity-50 text-base"
                  />
                  <button
                    type="submit"
                    disabled={subscriptionMutation.isPending}
                    className="cuci-cta bg-cuci-primary text-white px-6 py-3 rounded-lg whitespace-nowrap disabled:opacity-50 text-base"
                  >
                    {subscriptionMutation.isPending ? 'Signing up…' : 'Notify me →'}
                  </button>
                </form>

                <button
                  onClick={() => setShowPlannedPackages(!showPlannedPackages)}
                  className="inline-flex items-center gap-2 text-cuci-primary hover:text-cuci-primary-dark font-bold transition-colors mx-auto text-sm"
                >
                  {showPlannedPackages ? "Hide" : "Preview"} planned packages
                  {showPlannedPackages ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              </div>
            </motion.div>

            {showPlannedPackages && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.5 }}
                className="overflow-hidden"
              >
                <PricingContainer
                  title="Subscription Packages"
                  plans={pricingPlans}
                  className="max-w-6xl mx-auto"
                />
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              viewport={{ once: true }}
              className="text-center mt-16"
            >
              <div className="cuci-eyebrow mb-3">Why subscribe</div>
              <h3 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-10">
                Three reasons our regulars never go back.
              </h3>
              <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto mb-10">
                {[
                  { emoji: '💧', title: 'Consistent care', body: 'Regular cleaning keeps your car looking sharp every week.', accent: 'bg-cuci-primary/10' },
                  { emoji: '💰', title: 'Cost savings', body: 'Pays for itself after 5 washes vs. drive-in pricing.', accent: 'bg-cuci-secondary/15' },
                  { emoji: '⏰', title: 'Convenience', body: 'Set it once. Drive in any branch, any time. No appointments.', accent: 'bg-green-100' },
                ].map((b) => (
                  <div key={b.title} className="cuci-kpi text-left">
                    <div className={`w-12 h-12 rounded-full border-2 border-black ${b.accent} flex items-center justify-center mb-4`}>
                      <span className="text-2xl">{b.emoji}</span>
                    </div>
                    <h4 className="font-extrabold text-gray-900 mb-1.5 text-lg">{b.title}</h4>
                    <p className="text-gray-600 text-sm leading-relaxed">{b.body}</p>
                  </div>
                ))}
              </div>

              <p className="text-gray-600 mb-8 text-base">
                All plans include our rain re-wash guarantee and flexible cancellation.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="cuci-cta bg-cuci-primary text-white px-7 py-3 rounded-full"
                >
                  Sign up for updates
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    window.location.href = '/';
                    setTimeout(() => {
                      const element = document.getElementById('locations');
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth' });
                      }
                    }, 100);
                  }}
                  className="cuci-cta bg-white text-gray-900 px-7 py-3 rounded-full"
                >
                  Find our locations
                </motion.button>
              </div>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}