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
    name: "Basic Wash",
    monthlyPrice: 100,
    yearlyPrice: 1080,
    features: [
      "Weekly exterior wash",
      "Basic interior vacuum", 
      "Tire cleaning",
      "Priority booking",
      "Mobile app access"
    ],
    accent: "bg-gradient-to-br from-purple-500 to-purple-600",
    rotation: -2,
  },
  {
    name: "Premium Clean", 
    monthlyPrice: 120,
    yearlyPrice: 1296,
    features: [
      "Bi-weekly full service",
      "Interior detailing",
      "Wax protection",
      "Engine bay cleaning",
      "Free pickup/delivery"
    ],
    isPopular: true,
    accent: "bg-gradient-to-br from-orange-500 to-red-500",
    rotation: 1,
  },
  {
    name: "Elite Detail",
    monthlyPrice: 150, 
    yearlyPrice: 1620,
    features: [
      "Weekly premium service",
      "Paint protection",
      "Leather conditioning", 
      "Ceramic coating",
      "24/7 concierge service"
    ],
    accent: "bg-gradient-to-br from-green-500 to-emerald-600",
    rotation: -1,
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
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="pt-20 pb-16">
        {/* Hero Section */}
        <section className="py-20 bg-gradient-to-br from-cuci-primary/5 to-cuci-secondary/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
                Car Wash <span className="text-cuci-primary">Subscriptions</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
                Get ready for hassle-free car care with our upcoming subscription service. 
                Never worry about a dirty car again!
              </p>
            </motion.div>
          </div>
        </section>

        {/* Subscription Section */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Not Yet Live Banner */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="text-center mb-8"
            >
              <div className="bg-gradient-to-r from-cuci-primary/10 to-cuci-secondary/10 rounded-2xl p-8 border-2 border-dashed border-cuci-primary/30">
                <h3 className="text-3xl font-bold text-cuci-primary mb-4">Subscription Service: Coming Soon!</h3>
                <p className="text-lg text-gray-600 mb-6 max-w-2xl mx-auto">
                  We're working on launching our subscription service that will revolutionize how you keep your car clean. 
                  Sign up below to be the first to know when it's available!
                </p>
                <form onSubmit={handleSubscriptionSubmit} className="flex flex-col sm:flex-row gap-4 justify-center items-center max-w-lg mx-auto mb-6">
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    required
                    disabled={subscriptionMutation.isPending}
                    className="flex-1 px-6 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cuci-primary focus:border-transparent disabled:opacity-50 text-lg"
                  />
                  <button 
                    type="submit"
                    disabled={subscriptionMutation.isPending}
                    className="bg-cuci-primary hover:bg-cuci-primary/90 text-white px-8 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap disabled:opacity-50 text-lg"
                  >
                    {subscriptionMutation.isPending ? 'Signing Up...' : 'Notify Me'}
                  </button>
                </form>
                
                <button
                  onClick={() => setShowPlannedPackages(!showPlannedPackages)}
                  className="flex items-center gap-2 text-cuci-primary hover:text-cuci-primary-dark font-semibold transition-colors mx-auto text-lg"
                >
                  {showPlannedPackages ? "Hide" : "Preview"} Planned Packages
                  {showPlannedPackages ? (
                    <ChevronUp className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
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
                  title="Planned Subscription Packages"
                  plans={pricingPlans}
                  className="max-w-6xl mx-auto opacity-75"
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
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Why Choose Our Subscription Service?</h3>
              <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto mb-8">
                <div className="text-center">
                  <div className="w-16 h-16 bg-cuci-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">💧</span>
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-2">Consistent Care</h4>
                  <p className="text-gray-600">Regular cleaning schedule keeps your car looking its best</p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-cuci-secondary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">💰</span>
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-2">Cost Savings</h4>
                  <p className="text-gray-600">Save money compared to individual wash visits</p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">⏰</span>
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-2">Convenience</h4>
                  <p className="text-gray-600">Set it and forget it - we'll take care of everything</p>
                </div>
              </div>
              
              <p className="text-gray-600 mb-8 text-lg">
                All plans include our satisfaction guarantee and flexible cancellation policy.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="bg-cuci-primary hover:bg-cuci-primary-dark text-white px-8 py-3 rounded-full font-semibold transition-all shadow-lg"
                >
                  Sign Up for Updates
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    window.location.href = '/';
                    setTimeout(() => {
                      const element = document.getElementById('locations');
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth' });
                      }
                    }, 100);
                  }}
                  className="border-2 border-cuci-secondary text-cuci-secondary hover:bg-cuci-secondary hover:text-white px-8 py-3 rounded-full font-semibold transition-all"
                >
                  Find Our Locations
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