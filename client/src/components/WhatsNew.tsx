import { motion } from "framer-motion";
import { MapPin, CreditCard, Sparkles, DollarSign, Calendar } from "lucide-react";

const features = [
  {
    icon: <MapPin className="w-8 h-8" />,
    title: "New Branches",
    description: "Now open in Sengkurong & Rimba — more convenience near you.",
    color: "text-cuci-primary",
    bgColor: "bg-cuci-primary/10"
  },
  {
    icon: <CreditCard className="w-8 h-8" />,
    title: "New Payment Options",
    description: "Pay with Pocket, Ding, MyDST, Tarus, and Olive apps. Cashless, seamless.",
    color: "text-cuci-secondary",
    bgColor: "bg-cuci-secondary/10"
  },
  {
    icon: <Sparkles className="w-8 h-8" />,
    title: "Premium Wash Chemicals",
    description: "Partnered with Osren for deeper, shinier results.",
    color: "text-green-600",
    bgColor: "bg-green-100"
  },
  {
    icon: <DollarSign className="w-8 h-8" />,
    title: "New Pricing",
    description: "Basic Wash: $9 — transparent pricing with no surprises.",
    color: "text-cuci-primary",
    bgColor: "bg-cuci-primary/10"
  },
  {
    icon: <Calendar className="w-8 h-8" />,
    title: "New Membership",
    description: "Unlimited washes from only $30/month. Wash anytime, any branch.",
    color: "text-cuci-secondary",
    bgColor: "bg-cuci-secondary/10"
  }
];

export default function WhatsNew() {
  return (
    <section id="whats-new" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            What's <span className="text-cuci-primary">New</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            We're constantly improving to serve you better. Here's what's new at Cuci Xpress.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2"
            >
              <div className={`inline-flex p-4 rounded-2xl ${feature.bgColor} mb-6`}>
                <div className={feature.color}>
                  {feature.icon}
                </div>
              </div>
              
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                {feature.title}
              </h3>
              
              <p className="text-gray-600 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}