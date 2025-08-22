import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Car, Sparkles, Shield, Clock, Phone, MapPin, Banknote } from "lucide-react";
import progresifDing from "@/assets/progresif-ding.webp";
import mydstWallet from "@/assets/mydst-wallet.png";
import cardPayment from "@assets/visa master_1755854326970.png";
import bankTransfer from "@assets/image_1755854644968.png";

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
    <section id="service-pricing" className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Service Pricing</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Quick and convenient drive-thru car wash with transparent pricing. Same great rates for all car sizes. All major payment methods accepted for your convenience.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {serviceOptions.map((service, index) => (
            <motion.div
              key={service.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              viewport={{ once: true }}
            >
              <Card className={`relative h-full ${service.popular ? 'ring-2 ring-cuci-primary shadow-lg scale-105' : ''}`}>
                {service.popular && (
                  <Badge 
                    className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-cuci-primary text-white px-6 py-1"
                  >
                    Most Popular
                  </Badge>
                )}
                
                <CardHeader className="text-center pb-4">
                  <div className="mx-auto mb-4 p-3 bg-gradient-to-br from-purple-100 to-orange-100 rounded-full text-cuci-primary">
                    {service.icon}
                  </div>
                  <CardTitle className="text-2xl font-bold text-gray-900">{service.name}</CardTitle>
                  <CardDescription className="text-gray-600">{service.description}</CardDescription>
                  
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-cuci-primary">{service.price}</span>
                    <div className="flex items-center justify-center mt-2 text-sm text-gray-500">
                      <Clock className="w-4 h-4 mr-1" />
                      {service.duration}
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  <ul className="space-y-3 mb-6">
                    {service.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-start">
                        <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center mr-3 mt-0.5 flex-shrink-0">
                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        </div>
                        <span className="text-gray-700 text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button 
                    className={`w-full font-semibold py-3 shadow-lg transition-all duration-300 ${service.popular 
                      ? 'bg-gradient-to-r from-purple-600 to-orange-500 hover:from-purple-700 hover:to-orange-600 text-white hover:shadow-xl transform hover:scale-105' 
                      : service.name === "Coming Soon"
                      ? 'bg-cuci-secondary hover:bg-cuci-secondary/90 text-white hover:shadow-xl'
                      : 'bg-cuci-primary hover:bg-cuci-primary/90 text-white hover:shadow-xl transform hover:scale-105'
                    }`}
                    onClick={() => {
                      if (service.name === "Coming Soon") {
                        window.location.href = '/subscriptions';
                      } else {
                        // Open payment checkout in new tab with service data
                        const serviceData = encodeURIComponent(JSON.stringify(service));
                        window.open(`/checkout?service=${serviceData}`, '_blank');
                      }
                    }}
                  >
                    {service.name === "Coming Soon" ? "Learn More" : "Pay & Queue Now"}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Payment Methods */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          viewport={{ once: true }}
          className="text-center bg-gradient-to-br from-purple-50 to-orange-50 rounded-2xl p-8 mb-8"
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
                className="bg-white rounded-lg p-4 shadow-md border border-gray-200 hover:shadow-lg transition-shadow duration-300"
              >
                <div className="flex flex-col items-center gap-3">
                  {/* Logo or Icon */}
                  <div className="h-12 flex items-center justify-center">
                    {payment.logo ? (
                      <img 
                        src={payment.logo} 
                        alt={payment.name}
                        className="max-h-10 max-w-full object-contain"
                      />
                    ) : (
                      payment.icon
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
          className="text-center bg-gray-50 rounded-2xl p-8"
        >
          <h3 className="text-2xl font-bold text-gray-900 mb-4">Ready to Get Started?</h3>
          <p className="text-gray-600 mb-6">
            Visit any of our 4 locations or book online through our live queue system.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button 
              className="bg-cuci-primary hover:bg-cuci-primary/90 text-white px-8"
              onClick={() => window.open('https://cuci-xpress.com', '_blank')}
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