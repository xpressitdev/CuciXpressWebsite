import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";
import heroVideo from "../assets/hero-video.mp4";

export default function BrandVideo() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="relative max-w-4xl mx-auto"
      >
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

        <div className="absolute -bottom-6 -left-6 bg-white p-6 rounded-xl shadow-lg hidden sm:block">
          <div className="flex items-center space-x-4">
            <div className="bg-cuci-primary/10 p-3 rounded-full">
              <CheckCircle className="w-8 h-8 text-cuci-primary" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Xpress, Convenient, Clean</p>
              <p className="font-semibold text-gray-900">Guaranteed</p>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
