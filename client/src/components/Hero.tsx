import { useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import LiveQueueWidget from "@/components/LiveQueueWidget";

export default function Hero() {
  const [location] = useLocation();
  const [expanded, setExpanded] = useState(false);

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
            <h1 className="text-4xl md:text-6xl font-black tracking-tight text-gray-900 leading-[1.05] mb-6">
              We've cleaned over{" "}
              <span className="cuci-rainbow-text">120,000</span>{" "}
              cars.
              <span className="cuci-rainbow-text block">
                And we're just getting started.
              </span>
            </h1>
            <p
              id="hero-description"
              className={`text-xl text-gray-600 mb-2 leading-relaxed lg:mb-8 lg:line-clamp-none ${
                expanded ? "" : "line-clamp-2"
              }`}
            >Cuci Xpress provides fast, consistent drive-thru car washes focused on convenience, reliability, and customer satisfaction. Built for Brunei. Washed for speed. It’s all part of our mission to Bina Wawasan Negara (BWN) — building time-saving services that help move Brunei forward.</p>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-controls="hero-description"
              className="lg:hidden mb-6 text-sm font-bold text-cuci-primary underline"
              data-testid="button-toggle-hero-text"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
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
            <LiveQueueWidget embedded />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
