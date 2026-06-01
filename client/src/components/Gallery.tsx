import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import carWashBay from "@assets/WhatsApp Image 2025-06-26 at 23.35.45_3b66e14a_1751160530356.jpg";
import storefront from "@assets/WhatsApp Image 2025-06-26 at 23.11.24_5946c0a8_1751160533115.jpg";
import dingPayment from "@assets/ding pgh_1751161276778.png";
import luxuryCars from "../assets/gallery-7.jpg";

export default function Gallery() {
  // Trimmed homepage teaser — our four strongest customer-facing shots.
  // The full set lives on the dedicated /gallery page.
  const teaserImages = [
    {
      src: dingPayment,
      alt: "Smiling Cuci Xpress team member providing friendly service",
    },
    {
      src: storefront,
      alt: "Cuci Xpress storefront with purple and orange branding at sunset",
    },
    {
      src: carWashBay,
      alt: "Car getting washed in automated car wash bay with purple fans overhead",
    },
    {
      src: luxuryCars,
      alt: "Freshly cleaned car after professional detailing by Cuci Xpress staff",
    },
  ];

  return (
    <section id="gallery" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold text-gray-900 mb-4">See Our Work</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Real cars, real results — across all five branches.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {teaserImages.map((image, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              viewport={{ once: true }}
              whileHover={{ scale: 1.02 }}
            >
              <img
                src={image.src}
                alt={image.alt}
                className="w-full h-56 md:h-64 object-cover rounded-2xl shadow-lg hover:shadow-xl transition-shadow"
              />
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mt-12"
        >
          <Link
            href="/gallery"
            className="inline-flex items-center gap-2 bg-cuci-primary text-white px-8 py-4 rounded-lg text-lg font-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.9)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,0.9)] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,0.9)] transition-all duration-200"
            data-testid="link-view-full-gallery"
          >
            View Full Gallery <ArrowRight className="w-5 h-5" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
