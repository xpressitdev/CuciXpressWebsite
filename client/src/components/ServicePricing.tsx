import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Car, Sparkles, Shield, Clock, Phone, MapPin, Banknote, Check, Star } from "lucide-react";
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
  isSubscription?: boolean;
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
      "Drive-thru convenience"
    ]
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
      "Wheel cleaning"
    ]
  },
  {
    name: "Coming Soon",
    price: "Subscriptions",
    duration: "Monthly plans",
    description: "Unlimited washes with monthly subscription",
    icon: <Shield className="w-6 h-6" />,
    features: [
      "Unlimited exterior washes",
      "Rain re-wash guarantee",
      "All locations included",
      "Family & corporate plans",
      "Starting from BND 60/month",
      "Sign up for early access!"
    ]
  }
];

export default function ServicePricing() {
  return (
    <section id="service-pricing" className="py-12 sm:py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-10 sm:mb-16"
        >
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Service Pricing</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Quick and convenient drive-thru car wash with transparent pricing. Same great rates for all car sizes. All major payment methods accepted for your convenience.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 sm:gap-8 mb-10 sm:mb-12 items-stretch">
          {serviceOptions.map((service, index) => {
            const priceParts = service.price.split(" ");
            const hasNumericPrice = priceParts.length > 1 && /^\d/.test(priceParts[priceParts.length - 1]);
            const amount = hasNumericPrice ? priceParts[priceParts.length - 1] : null;
            const currency = hasNumericPrice ? priceParts.slice(0, -1).join(" ") : null;
            const ctaLabel = service.popular
              ? "Pick this one"
              : service.name === "Coming Soon"
              ? "Learn More"
              : `Choose ${service.name}`;

            return (
              <motion.div
                key={service.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="h-full"
              >
                <Card
                  className={`relative h-full flex flex-col text-left rounded-2xl border-2 border-black p-6 ${
                    service.popular ? "text-white" : "bg-white text-gray-900"
                  }`}
                  style={{
                    boxShadow: service.popular
                      ? "6px 6px 0px 0px rgba(0,0,0,0.9)"
                      : "4px 4px 0px 0px rgba(0,0,0,0.9)",
                    ...(service.popular
                      ? {
                          backgroundImage:
                            "linear-gradient(135deg, hsl(257,74%,66%) 0%, hsl(278,72%,72%) 45%, hsl(36,100%,55%) 100%)",
                        }
                      : {}),
                  }}
                >
                  {service.popular && (
                    <span className="absolute -top-3 right-4 inline-flex items-center gap-1 bg-amber-400 text-black border-2 border-black rounded-md px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide">
                      <Star className="w-3 h-3 fill-black" />
                      Most Picked
                    </span>
                  )}

                  <span
                    className={`text-xs font-bold uppercase tracking-wider ${
                      service.popular ? "text-white/90" : "text-cuci-primary"
                    }`}
                  >
                    {service.name}
                  </span>

                  <div className="mt-2 flex items-end gap-1.5">
                    {amount ? (
                      <>
                        <span
                          className={`text-5xl font-black leading-none ${
                            service.popular ? "text-white" : "text-gray-900"
                          }`}
                        >
                          {amount}
                        </span>
                        <span
                          className={`mb-1 text-base font-bold ${
                            service.popular ? "text-white/80" : "text-gray-500"
                          }`}
                        >
                          {currency}
                        </span>
                      </>
                    ) : (
                      <span
                        className={`text-3xl font-black leading-tight ${
                          service.popular ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {service.price}
                      </span>
                    )}
                  </div>

                  <div
                    className={`mt-2 flex items-center gap-1.5 text-sm ${
                      service.popular ? "text-white/80" : "text-gray-500"
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                    {amount ? `~ ${service.duration}` : service.duration}
                  </div>

                  <ul className="mt-5 mb-6 space-y-2.5 flex-1">
                    {service.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-start gap-2.5">
                        <Check
                          className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                            service.popular ? "text-green-300" : "text-green-500"
                          }`}
                        />
                        <span
                          className={`text-sm ${
                            service.popular ? "text-white" : "text-gray-700"
                          }`}
                        >
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <button
                    className={`cuci-cta mt-auto w-full rounded-lg py-3 flex items-center justify-center gap-2 ${
                      service.popular
                        ? "bg-white text-cuci-primary"
                        : service.name === "Coming Soon"
                        ? "bg-cuci-secondary text-white"
                        : "bg-cuci-primary text-white"
                    }`}
                    onClick={() => {
                      if (service.name === "Coming Soon") {
                        window.location.href = "/subscriptions";
                      } else {
                        const serviceData = encodeURIComponent(JSON.stringify(service));
                        window.open(`/checkout?service=${serviceData}`, "_blank");
                      }
                    }}
                  >
                    {service.popular && <Sparkles className="w-4 h-4" />}
                    {ctaLabel}
                  </button>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Payment Methods */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          viewport={{ once: true }}
          className="text-center bg-gradient-to-br from-purple-50 to-orange-50 rounded-2xl p-5 sm:p-8 mb-6 sm:mb-8"
        >
          <h3 className="text-2xl font-bold text-gray-900 mb-4">Payment Methods</h3>
          <p className="text-gray-600 mb-8">We accept multiple convenient payment options</p>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {[
              { 
                name: "Cash Payment", 
                logo: null, 
                icon: <Banknote className="w-8 h-8 text-green-600" />,
                caption: "Cash"
              },
              { 
                name: "Bank Transfer", 
                logo: bankTransfer, 
                icon: null,
                caption: "Bank Transfer"
              },
              { 
                name: "Pocket App", 
                logo: pocketApp, 
                icon: null,
                caption: "Pocket App"
              },
              { 
                name: "Progresif Ding!", 
                logo: progresifDing, 
                icon: null,
                caption: "Progresif Ding!"
              },
              { 
                name: "MyDST Wallet", 
                logo: mydstWallet, 
                icon: null,
                caption: "MyDST Wallet"
              },
              { 
                name: "Card Payment", 
                logo: cardPayment, 
                icon: null,
                caption: "Card Payment"
              }
            ].map((payment, index) => (
              <motion.div
                key={payment.name}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="bg-white rounded-lg p-3 shadow-md border border-gray-200 hover:shadow-lg transition-shadow duration-300"
              >
                <div className="flex flex-col items-center gap-2">
                  {/* Logo or Icon */}
                  <div className="h-16 w-full flex items-center justify-center px-2">
                    {payment.logo ? (
                      <img 
                        src={payment.logo} 
                        alt={payment.name}
                        className="max-h-14 max-w-full object-contain"
                      />
                    ) : (
                      <div className="scale-125">
                        {payment.icon}
                      </div>
                    )}
                  </div>
                  
                  {/* Caption */}
                  <span className="text-xs font-medium text-gray-600 text-center leading-tight">
                    {payment.caption}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Contact and Location Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          viewport={{ once: true }}
          className="text-center bg-gray-50 rounded-2xl p-5 sm:p-8"
        >
          <h3 className="text-2xl font-bold text-gray-900 mb-4">Ready to Get Started?</h3>
          <p className="text-gray-600 mb-6">
            Visit any of our 5 locations or check our live queue before you drive over.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button 
              className="bg-cuci-primary hover:bg-cuci-primary/90 text-white px-8"
              onClick={() => { window.location.href = '/queue'; }}
            >
              <Clock className="w-4 h-4 mr-2" />
              Live Queue System
            </Button>
            
            <Button 
              variant="outline" 
              className="border-cuci-primary text-cuci-primary hover:bg-cuci-primary hover:text-white px-8"
              onClick={() => {
                const element = document.getElementById('locations');
                element?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <MapPin className="w-4 h-4 mr-2" />
              Find Locations
            </Button>
            
            <Button 
              variant="outline" 
              className="border-gray-300 text-gray-600 hover:bg-gray-100 px-8"
              onClick={() => window.open('tel:+6738387000', '_blank')}
            >
              <Phone className="w-4 h-4 mr-2" />
              Call: +673 838 7000
            </Button>
          </div>
          
          <p className="text-sm text-gray-500 mt-4">
            All locations open daily: 8:00 AM - 7:00 PM
          </p>
        </motion.div>
      </div>
    </section>
  );
}