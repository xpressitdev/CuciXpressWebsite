import { motion } from "framer-motion";
import { Sparkles, ArrowRight, Check, Crown } from "lucide-react";

const FOUNDING_FEATURES = [
  "Unlimited exterior washes",
  "Founding price locked in for life",
  "Rain re-wash guarantee",
  "All 5 branches included",
];

export default function PricingSection() {
  return (
    <section id="pricing" className="py-12 sm:py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          viewport={{ once: true }}
          className="text-center mb-8"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Unlimited washes with a{" "}
            <span className="text-cuci-primary">Cuci Xpress Subscription</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Our subscriptions are live — and the founding offer is open now.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          viewport={{ once: true }}
          className="relative overflow-hidden rounded-2xl border-2 border-black p-6 md:p-10"
          style={{
            background:
              "linear-gradient(135deg, #7C5CE7 0%, #B47CF7 55%, #FF9500 100%)",
            boxShadow: "6px 6px 0 0 rgba(0,0,0,0.92)",
          }}
          data-testid="founding-offer-home"
        >
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
            <div className="text-white max-w-2xl">
              <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-[#FFE89E] text-black px-3 py-1 text-xs font-extrabold uppercase tracking-wider mb-4">
                <Sparkles className="w-3.5 h-3.5" /> Founding offer · 250 spots only
              </div>

              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-6 h-6 text-white" />
                <h3 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                  Unlimited Xpress
                </h3>
              </div>

              <div className="flex items-baseline gap-3 mb-4">
                <span className="text-4xl md:text-5xl font-extrabold text-white">
                  BND 39
                </span>
                <span className="text-white/80 font-semibold">/ month</span>
                <span className="text-white/70 line-through text-lg">BND 45</span>
              </div>

              <p className="text-sm md:text-base text-white/90 leading-relaxed mb-5">
                Be one of the first 250 members to lock in{" "}
                <span className="font-extrabold">BND 39/mo</span> — and keep it for as
                long as you stay subscribed. Once all 250 spots are claimed, Unlimited
                Xpress returns to its regular <span className="font-extrabold">BND 45/mo</span>.
              </p>

              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                {FOUNDING_FEATURES.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-2 text-white text-sm md:text-base"
                  >
                    <Check className="w-4 h-4 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex-shrink-0 w-full lg:w-auto flex flex-col items-stretch lg:items-end gap-3">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  window.location.href = "/subscriptions";
                }}
                className="cuci-cta rounded-lg px-8 py-4 text-base font-extrabold bg-white text-cuci-primary shadow-lg inline-flex items-center justify-center"
                data-testid="button-claim-founding-home"
              >
                <span className="mr-1">✦</span>
                Claim founding price
                <ArrowRight className="w-4 h-4 ml-1" />
              </motion.button>
              <button
                onClick={() => {
                  window.location.href = "/subscriptions";
                }}
                className="text-white/90 hover:text-white text-sm font-semibold underline underline-offset-4 text-center lg:text-right"
                data-testid="button-view-all-plans-home"
              >
                View all subscription plans
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
