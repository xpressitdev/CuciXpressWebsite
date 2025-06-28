import { motion } from "framer-motion";
import { PricingContainer } from "@/components/ui/pricing-container";

const pricingPlans = [
  {
    name: "Basic Wash",
    monthlyPrice: 15,
    yearlyPrice: 144, // 20% discount
    features: [
      "Exterior wash",
      "Wheel cleaning",
      "Basic interior vacuum",
      "1 wash per month",
      "Basic soap & rinse"
    ],
    accent: "#6C5CE7",
  },
  {
    name: "Premium Clean",
    monthlyPrice: 35,
    yearlyPrice: 336, // 20% discount
    features: [
      "Everything in Basic",
      "Interior detailing",
      "Dashboard cleaning",
      "Tire shine",
      "2 washes per month",
      "Premium cleaning products"
    ],
    isPopular: true,
    accent: "#FFA500",
    rotation: -2,
  },
  {
    name: "Elite Detail",
    monthlyPrice: 65,
    yearlyPrice: 624, // 20% discount
    features: [
      "Everything in Premium",
      "Complete interior detailing",
      "Leather conditioning",
      "Engine bay cleaning",
      "Unlimited monthly washes",
      "Priority booking",
      "Free pickup & delivery"
    ],
    accent: "#6C5CE7",
    rotation: 2,
  },
];

export default function PricingSection() {
  return (
    <section id="pricing" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Choose Your Perfect{" "}
            <span className="text-cuci-primary">Car Care</span> Plan
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            From basic maintenance to premium detailing, we have subscription plans 
            designed to keep your car looking its best all year round.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          viewport={{ once: true }}
        >
          <PricingContainer
            title=""
            plans={pricingPlans}
            className="max-w-6xl mx-auto"
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