import { motion } from "framer-motion";
import { ArrowRight, MapPin, CreditCard, Calendar } from "lucide-react";
import { Link, useLocation } from "wouter";

export default function Hero() {
  const [location] = useLocation();

  const handleNavigation = (sectionId: string) => {
    if (location !== "/") {
      window.location.href = `/#${sectionId}`;
    } else {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  return (
    <section id="home" className="relative bg-gradient-to-br from-purple-50 via-white to-orange-50 min-h-screen flex items-center overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 0.1, scale: 1 }}
          transition={{ duration: 2 }}
          className="absolute -top-40 -right-40 w-80 h-80 bg-cuci-primary rounded-full blur-3xl"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 0.1, scale: 1 }}
          transition={{ duration: 2, delay: 0.5 }}
          className="absolute -bottom-40 -left-40 w-80 h-80 bg-cuci-secondary rounded-full blur-3xl"
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left column - Text content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center lg:text-left"
          >
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-4xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight"
            >
              Cuci Xpress Just Got a{" "}
              <span className="text-cuci-primary">Major Upgrade</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="text-xl md:text-2xl text-gray-600 mb-4 max-w-2xl mx-auto lg:mx-0"
            >
              New locations. New features. Same 12-minute wash.
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto lg:mx-0"
            >
              Serving <strong className="text-cuci-primary">100,000+ cars</strong> — now expanding with smarter payments, cleaner chemicals, and unlimited washing.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <button
                onClick={() => handleNavigation("pricing")}
                className="group bg-cuci-primary text-white px-8 py-4 rounded-full font-semibold text-lg hover:bg-cuci-primary/90 transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl transform hover:-translate-y-1"
              >
                <CreditCard className="mr-2 w-5 h-5" />
                View Pricing
              </button>
              
              <button 
                onClick={() => handleNavigation("locations")}
                className="group bg-white text-cuci-primary px-8 py-4 rounded-full font-semibold text-lg border-2 border-cuci-primary hover:bg-cuci-primary hover:text-white transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl transform hover:-translate-y-1"
              >
                <MapPin className="mr-2 w-5 h-5" />
                See New Locations
              </button>

              <button
                onClick={() => handleNavigation("pricing")}
                className="group bg-cuci-secondary text-white px-8 py-4 rounded-full font-semibold text-lg hover:bg-cuci-secondary/90 transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl transform hover:-translate-y-1"
              >
                <Calendar className="mr-2 w-5 h-5" />
                Subscribe Now
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>
          </motion.div>

          {/* Right column - Counter Stats */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="relative"
          >
            <div className="grid grid-cols-2 gap-6">
              {/* Stats cards with counters */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.8 }}
                className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-white/20"
              >
                <div className="text-3xl font-bold text-cuci-primary mb-2">100K+</div>
                <div className="text-gray-600 font-medium">Cars Cleaned</div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1 }}
                className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-white/20"
              >
                <div className="text-3xl font-bold text-cuci-secondary mb-2">$1M+</div>
                <div className="text-gray-600 font-medium">Revenue</div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1.2 }}
                className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-white/20"
              >
                <div className="text-3xl font-bold text-green-500 mb-2">6</div>
                <div className="text-gray-600 font-medium">Branches by Dec</div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1.4 }}
                className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-white/20"
              >
                <div className="text-3xl font-bold text-cuci-primary mb-2">12</div>
                <div className="text-gray-600 font-medium">Min Wash</div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
