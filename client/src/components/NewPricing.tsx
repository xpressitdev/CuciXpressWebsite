import { motion } from "framer-motion";
import { Check, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

const pricingData = [
  {
    type: "Basic Wash",
    price: "$9",
    description: "Quick exterior clean (machine + blow dry)",
    features: ["Exterior wash", "Machine dry", "Basic cleaning"],
    color: "text-cuci-primary",
    bgColor: "bg-cuci-primary/5"
  },
  {
    type: "Full Wash",
    price: "$12", 
    description: "Basic Wash + hand detailing",
    features: ["Everything in Basic", "Hand detailing", "Interior vacuum"],
    color: "text-cuci-secondary",
    bgColor: "bg-cuci-secondary/5"
  },
  {
    type: "Membership",
    price: "$30/mo",
    description: "Unlimited washes. Any time. Any branch.",
    features: ["Unlimited visits", "All locations", "Skip queues", "Cancel anytime"],
    color: "text-green-600",
    bgColor: "bg-green-50",
    isPopular: true
  }
];

export default function NewPricing() {
  const [location] = useLocation();

  const handleMembershipClick = () => {
    if (location !== "/") {
      window.location.href = "/#membership";
    } else {
      const element = document.getElementById("membership");
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

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
            Transparent Pricing. <span className="text-cuci-primary">No Surprises.</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Simple, straightforward pricing for every car care need.
          </p>
        </motion.div>

        {/* Pricing Table */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          viewport={{ once: true }}
          className="max-w-5xl mx-auto"
        >
          <div className="grid md:grid-cols-3 gap-8">
            {pricingData.map((plan, index) => (
              <motion.div
                key={plan.type}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className={`relative bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 border-2 ${
                  plan.isPopular ? 'border-cuci-primary' : 'border-gray-100'
                }`}
              >
                {plan.isPopular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-cuci-primary text-white px-6 py-2 rounded-full text-sm font-semibold">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className={`text-center mb-8 ${plan.bgColor} -mx-8 -mt-8 pt-8 pb-6 rounded-t-2xl`}>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.type}</h3>
                  <div className={`text-4xl font-bold ${plan.color} mb-2`}>
                    {plan.price}
                  </div>
                  <p className="text-gray-600">{plan.description}</p>
                </div>

                <div className="space-y-4 mb-8">
                  {plan.features.map((feature, featureIndex) => (
                    <div key={featureIndex} className="flex items-center space-x-3">
                      <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                        plan.isPopular ? 'bg-cuci-primary' : 'bg-gray-200'
                      }`}>
                        <Check className={`w-3 h-3 ${
                          plan.isPopular ? 'text-white' : 'text-gray-600'
                        }`} />
                      </div>
                      <span className="text-gray-700">{feature}</span>
                    </div>
                  ))}
                </div>

                {plan.type === "Membership" ? (
                  <button
                    onClick={handleMembershipClick}
                    className="w-full bg-cuci-primary text-white py-3 rounded-full font-semibold hover:bg-cuci-primary/90 transition-all duration-300 flex items-center justify-center group"
                  >
                    Compare Packages
                    <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                ) : (
                  <button className="w-full border-2 border-gray-200 text-gray-700 py-3 rounded-full font-semibold hover:border-cuci-primary hover:text-cuci-primary transition-all duration-300">
                    Available Now
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}