import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";
import { useLocation } from "wouter";
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
    <section
      id="home"
      className="relative pt-24 pb-20 lg:pt-32 lg:pb-28 overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-cuci-primary/10 to-cuci-secondary/10" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center lg:text-left"
          >
            <div className="cuci-eyebrow mb-3">
              Cuci Xpress · Brunei drive-thru
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-gray-900 leading-[1.05] mb-6">
              We&apos;ve cleaned over{" "}
              <span className="text-cuci-primary">120,000</span> cars.
              <span className="block text-cuci-secondary">
                And we&apos;re just getting started.
              </span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 mb-8 leading-relaxed">
              From a single location to five thriving branches, Cuci Xpress
              provides fast, consistent drive-thru car washes built on
              convenience, reliability, and customer satisfaction. Built for
              Brunei. Washed for speed. Part of our mission to{" "}
              <span className="font-semibold text-gray-800">
                Bina Wawasan Negara
              </span>{" "}
              — building time-saving services that help move Brunei forward.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <button
                onClick={() => handleNavigation("locations")}
                className="cuci-cta bg-cuci-primary text-white px-8 py-4 rounded-lg text-lg"
                data-testid="button-hero-locations"
              >
                Find Our Locations →
              </button>
              <button
                onClick={() => handleNavigation("service-pricing")}
                className="cuci-cta bg-cuci-secondary text-black px-8 py-4 rounded-lg text-lg"
                data-testid="button-hero-pricing"
              >
                View Pricing →
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            {/* Video container — 2px black border + 4px brutalist shadow
                so it ties into the rest of the page rhythm. */}
            <div className="relative w-full h-0 pb-[56.25%] rounded-2xl overflow-hidden bg-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.9)]">
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
              className="cuci-card absolute -bottom-6 -left-6 p-5"
            >
              <div className="flex items-center space-x-4">
                <div className="bg-cuci-primary/10 p-3 rounded-full border-2 border-black">
                  <CheckCircle className="w-7 h-7 text-cuci-primary" />
                </div>
                <div>
                  <div className="cuci-eyebrow">Xpress · Convenient · Clean</div>
                  <p className="font-extrabold tracking-tight text-gray-900 text-lg">
                    Guaranteed
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
