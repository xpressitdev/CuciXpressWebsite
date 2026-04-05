import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";
import { Link, useLocation } from "wouter";
import heroVideo from "../assets/hero-video.mp4";

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
    <section id="home" className="relative pt-24 pb-20 lg:pt-32 lg:pb-28 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-cuci-primary/10 to-cuci-secondary/10"></div>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center lg:text-left"
          >
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 leading-tight mb-6">
              We've cleaned over{" "}
              <span className="text-cuci-primary">120,000</span> cars.
              <span className="block text-cuci-secondary">
                And we're just getting started.
              </span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">From a single location to five thriving branches, Cuci Xpress provide fast, consistent drive-thru car washes focus on convenience, reliability, and customer satisfaction.

            Built for Brunei. Washed for speed.

            It’s all part of our mission to Bina Wawasan Negara (BWN) — building time-saving services that help move Brunei forward.
</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <motion.button
                whileHover={{ 
                  scale: 1.02,
                  boxShadow: "6px 6px 0px 0px rgba(0,0,0,0.9)"
                }}
                whileTap={{ 
                  scale: 0.95,
                  boxShadow: "2px 2px 0px 0px rgba(0,0,0,0.9)"
                }}
                onClick={() => handleNavigation("locations")}
                className="bg-cuci-primary text-white px-8 py-4 rounded-lg text-lg font-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.9)] transition-all duration-200"
              >
                Find Our Locations →
              </motion.button>
              <motion.button
                whileHover={{ 
                  scale: 1.02,
                  boxShadow: "6px 6px 0px 0px rgba(0,0,0,0.9)"
                }}
                whileTap={{ 
                  scale: 0.95,
                  boxShadow: "2px 2px 0px 0px rgba(0,0,0,0.9)"
                }}
                onClick={() => handleNavigation("service-pricing")}
                className="bg-cuci-secondary text-white px-8 py-4 rounded-lg text-lg font-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.9)] transition-all duration-200"
              >
                View Pricing →
              </motion.button>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            {/* Video Container */}
            <div className="relative w-full h-0 pb-[56.25%] rounded-2xl overflow-hidden shadow-2xl bg-black">
              <video
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                muted
                loop
                playsInline
              >
                <source src={heroVideo} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
            
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="absolute -bottom-6 -left-6 bg-white p-6 rounded-xl shadow-lg"
            >
              <div className="flex items-center space-x-4">
                <div className="bg-cuci-primary/10 p-3 rounded-full">
                  <CheckCircle className="w-8 h-8 text-cuci-primary" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Xpress, Convenient, Clean</p>
                  <p className="font-semibold text-gray-900">Guaranteed</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
