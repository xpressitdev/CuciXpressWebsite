import { motion } from "framer-motion";
import { Car, Sparkles, Shield, Clock, Phone, MapPin, Banknote, Check } from "lucide-react";
import progresifDing from "@/assets/progresif-ding.webp";
import mydstWallet from "@/assets/mydst-wallet.png";
import cardPayment from "@assets/visa master_1755854326970.png";
import pocketApp from "@assets/POC-Royal-Skies-Partner-logo-290-x-150-05_1755854913328.png";
import bankTransfer from "@assets/bibd baiduri transfer_1755854973361.jpg";

interface ServiceOption {
  name: string;
  price: string;
  duration: string;
  description: string;
  features: string[];
  icon: React.ReactNode;
  popular?: boolean;
  ctaLabel: string;
  ctaBg: string;
  ctaText: string;
}

const serviceOptions: ServiceOption[] = [
  {
    name: "Basic Wash",
    price: "BND 8",
    duration: "8 minutes",
    description: "Quick and efficient exterior wash",
    icon: <Car className="w-6 h-6" />,
    features: [
      "Exterior foam wash",
      "High-pressure rinse",
      "Basic drying",
      "Quick service",
      "Drive-thru convenience",
    ],
    ctaLabel: "Pay & queue now",
    ctaBg: "bg-white",
    ctaText: "text-gray-900",
  },
  {
    name: "Full Package",
    price: "BND 12",
    duration: "12 minutes",
    description: "Complete wash with extra care",
    icon: <Sparkles className="w-6 h-6" />,
    popular: true,
    features: [
      "Exterior foam wash",
      "High-pressure rinse",
      "Basic drying",
      "Quick service",
      "Drive-thru convenience",
      "Spray wax",
      "Wheel cleaning",
    ],
    ctaLabel: "Pay & queue now",
    ctaBg: "bg-cuci-primary",
    ctaText: "text-white",
  },
  {
    name: "Coming Soon",
    price: "Subscriptions",
    duration: "Monthly plans",
    description: "Unlimited washes with a monthly subscription",
    icon: <Shield className="w-6 h-6" />,
    features: [
      "Unlimited exterior washes",
      "Rain re-wash guarantee",
      "All locations included",
      "Family & corporate plans",
      "Starting from BND 60/month",
      "Sign up for early access",
    ],
    ctaLabel: "Learn more",
    ctaBg: "bg-cuci-secondary",
    ctaText: "text-black",
  },
];

const paymentMethods = [
  { name: "Cash", logo: null, icon: <Banknote className="w-8 h-8 text-green-600" />, caption: "Cash" },
  { name: "Bank Transfer", logo: bankTransfer, caption: "Bank Transfer" },
  { name: "Pocket App", logo: pocketApp, caption: "Pocket App" },
  { name: "Progresif Ding!", logo: progresifDing, caption: "Progresif Ding!" },
  { name: "MyDST Wallet", logo: mydstWallet, caption: "MyDST Wallet" },
  { name: "Card Payment", logo: cardPayment, caption: "Card Payment" },
];

export default function ServicePricing() {
  const handlePlanClick = (service: ServiceOption) => {
    if (service.name === "Coming Soon") {
      window.location.href = "/subscriptions";
    } else {
      const serviceData = encodeURIComponent(JSON.stringify(service));
      window.open(`/checkout?service=${serviceData}`, "_blank");
    }
  };

  return (
    <section id="service-pricing" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <div className="cuci-eyebrow mb-3">Transparent pricing · BND</div>
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-4">
            Service <span className="text-cuci-primary">pricing</span>
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Quick, convenient drive-thru car wash at the same flat rate for every
            car size. All major payment methods accepted.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {serviceOptions.map((service, index) => (
            <motion.div
              key={service.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
              className={`cuci-card relative h-full flex flex-col p-6 ${service.popular ? "md:scale-[1.03]" : ""}`}
              data-testid={`card-service-${service.name}`}
            >
              {service.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-cuci-primary text-white text-xs font-extrabold uppercase tracking-wider px-4 py-1 rounded-full border-2 border-black">
                  Most popular
                </span>
              )}

              <div className="text-center pb-4 border-b-2 border-dashed border-gray-200">
                <div
                  className={`mx-auto mb-4 inline-flex items-center justify-center w-14 h-14 rounded-xl border-2 border-black ${service.popular ? "bg-cuci-primary text-white" : "bg-cuci-secondary text-black"}`}
                  style={{ boxShadow: "2px 2px 0px 0px rgba(0,0,0,0.9)" }}
                >
                  {service.icon}
                </div>
                <h3 className="text-xl font-extrabold tracking-tight text-gray-900">
                  {service.name}
                </h3>
                <p className="text-sm text-gray-500 mt-1">{service.description}</p>
                <div className="mt-4">
                  <span className="text-4xl font-extrabold tracking-tight text-cuci-primary">
                    {service.price}
                  </span>
                  <div className="flex items-center justify-center mt-1.5 text-xs uppercase tracking-wider text-gray-500 font-semibold">
                    <Clock className="w-3.5 h-3.5 mr-1" />
                    {service.duration}
                  </div>
                </div>
              </div>

              <ul className="space-y-2.5 my-6 flex-1">
                {service.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start text-sm">
                    <span className="w-5 h-5 rounded border-2 border-black bg-green-400 inline-flex items-center justify-center mr-3 mt-0.5 flex-shrink-0">
                      <Check className="w-3 h-3 text-black" strokeWidth={3} />
                    </span>
                    <span className="text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handlePlanClick(service)}
                className={`cuci-cta w-full py-3 rounded-lg ${service.ctaBg} ${service.ctaText}`}
                data-testid={`button-service-${service.name}`}
              >
                {service.ctaLabel} →
              </button>
            </motion.div>
          ))}
        </div>

        {/* Payment methods */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="cuci-card p-8 mb-12"
        >
          <div className="text-center mb-6">
            <div className="cuci-eyebrow mb-2">Pay your way</div>
            <h3 className="text-2xl font-extrabold tracking-tight text-gray-900">
              Payment methods
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              We accept multiple convenient payment options
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {paymentMethods.map((payment, index) => (
              <motion.div
                key={payment.name}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                viewport={{ once: true }}
                whileHover={{ translateX: -1, translateY: -1 }}
                className="cuci-card-soft p-3 hover:border-cuci-primary transition-colors"
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="h-14 w-full flex items-center justify-center px-2">
                    {payment.logo ? (
                      <img
                        src={payment.logo}
                        alt={payment.name}
                        className="max-h-12 max-w-full object-contain"
                      />
                    ) : (
                      <div className="scale-110">{payment.icon}</div>
                    )}
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700 text-center leading-tight">
                    {payment.caption}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Ready to start */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="cuci-card p-8 text-center"
        >
          <div className="cuci-eyebrow mb-2">Ready to roll</div>
          <h3 className="text-2xl font-extrabold tracking-tight text-gray-900 mb-3">
            Drive in or queue online
          </h3>
          <p className="text-sm text-gray-600 mb-6 max-w-xl mx-auto">
            Visit any of our 5 locations or skip the wait by joining the live
            queue from your phone.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <a
              href="/queue"
              className="cuci-cta bg-cuci-primary text-white px-6 py-3 rounded-lg inline-flex items-center gap-2"
              data-testid="button-cta-queue"
            >
              <Clock className="w-4 h-4" />
              Live queue system
            </a>
            <button
              onClick={() => {
                document
                  .getElementById("locations")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
              className="cuci-cta bg-white text-gray-900 px-6 py-3 rounded-lg inline-flex items-center gap-2"
              data-testid="button-cta-locations"
            >
              <MapPin className="w-4 h-4" />
              Find locations
            </button>
            <a
              href="tel:+6738387000"
              className="cuci-cta bg-cuci-secondary text-black px-6 py-3 rounded-lg inline-flex items-center gap-2"
              data-testid="button-cta-call"
            >
              <Phone className="w-4 h-4" />
              +673 838 7000
            </a>
          </div>

          <p className="text-xs text-gray-500 mt-5 uppercase tracking-wider font-semibold">
            All locations open daily · 8:00 AM – 7:00 PM
          </p>
        </motion.div>
      </div>
    </section>
  );
}
