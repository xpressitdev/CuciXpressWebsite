import { motion } from "framer-motion";
import { PricingContainer } from "@/components/ui/pricing-container";

const pricingPlans = [
  {
    name: "Basic Wash",
    monthlyPrice: 100,
    yearlyPrice: 960, // 20% discount
    features: [
      "Exterior Wash",
      "Rinse & Dry",
      "Basic Interior Vacuum",
      "Tire Cleaning"
    ],
    accent: "#6C5CE7",
  },
  {
    name: "Premium Clean",
    monthlyPrice: 120,
    yearlyPrice: 1152, // 20% discount
    features: [
      "Full Exterior Detail",
      "Deep Interior Clean",
      "Wax Protection",
      "Dashboard Polish",
      "Window Cleaning",
      "Priority Queue"
    ],
    isPopular: true,
    accent: "#FFA500",
    rotation: -2,
  },
  {
    name: "Elite Detail",
    monthlyPrice: 150,
    yearlyPrice: 1440, // 20% discount
    features: [
      "Premium Detailing",
      "Paint Protection",
      "Leather Treatment",
      "Engine Bay Clean",
      "Unlimited Visits",
      "VIP Service"
    ],
    accent: "#22C55E",
    rotation: 2,
  },
];

export default function PricingSection() {
  return (
    <section id="pricing" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Not Yet Live Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-8"
        >
          <div className="bg-gradient-to-r from-cuci-primary/10 to-cuci-secondary/10 rounded-2xl p-6 border-2 border-dashed border-cuci-primary/30">
            <h3 className="text-2xl font-bold text-cuci-primary mb-2">Subscription Service: Coming Soon!</h3>
            <p className="text-gray-600 mb-4">
              We're working on launching our subscription service. Sign up below to be notified when it's available!
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center max-w-md mx-auto">
              <input 
                type="email" 
                placeholder="Enter your email address"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cuci-primary focus:border-transparent"
              />
              <button className="bg-cuci-primary hover:bg-cuci-primary/90 text-white px-6 py-2 rounded-lg font-medium transition-colors whitespace-nowrap">
                Notify Me
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          viewport={{ once: true }}
        >
          <PricingContainer
            title="Planned Subscription Packages"
            plans={pricingPlans}
            className="max-w-6xl mx-auto opacity-75"
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          viewport={{ once: true }}
          className="text-center mt-12"
        >
          <p className="text-gray-600 mb-6">
            All plans include our satisfaction guarantee and flexible cancellation policy.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                const element = document.getElementById('locations');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="bg-cuci-primary hover:bg-cuci-primary-dark text-white px-8 py-3 rounded-full font-semibold transition-all shadow-lg"
            >
              Find Nearest Location
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                const element = document.getElementById('invest');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="border-2 border-cuci-secondary text-cuci-secondary hover:bg-cuci-secondary hover:text-white px-8 py-3 rounded-full font-semibold transition-all"
            >
              Get in Touch
            </motion.button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}