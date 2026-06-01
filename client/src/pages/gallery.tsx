import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import carWashBay from "@assets/WhatsApp Image 2025-06-26 at 23.35.45_3b66e14a_1751160530356.jpg";
import storefront from "@assets/WhatsApp Image 2025-06-26 at 23.11.24_5946c0a8_1751160533115.jpg";
import washTunnel from "@assets/20220928_2008581_1751160753598.jpg";
import nightView from "@assets/20241007_182239_1751160790928.jpg";
import dingPayment from "@assets/ding pgh_1751161276778.png";
import dualWash from "@assets/IMG-20220108-WA0042_1751160949648.jpg";
import luxuryCars from "../assets/gallery-7.jpg";
import brandBanner from "../assets/gallery-8.jpg";

export default function GalleryPage() {
  const galleryImages = [
    {
      src: dingPayment,
      alt: "Smiling Cuci Xpress team member providing friendly service with 'pay with ding!' digital payment option",
      span: "col-span-2 row-span-2",
    },
    {
      src: storefront,
      alt: "Cuci Xpress storefront with purple and orange branding at sunset",
      span: "col-span-1 row-span-1",
    },
    {
      src: washTunnel,
      alt: "Automated car wash tunnel with brushes and spray equipment",
      span: "col-span-1 row-span-1",
    },
    {
      src: nightView,
      alt: "Cuci Xpress night view with purple branding and red car entering wash bay",
      span: "col-span-1 row-span-1",
    },
    {
      src: carWashBay,
      alt: "White Haval car getting washed in automated car wash bay with purple fans overhead",
      span: "col-span-1 row-span-1",
    },
    {
      src: dualWash,
      alt: "Two white Audi cars being washed simultaneously in automated wash bays",
      span: "col-span-2 row-span-1",
    },
    {
      src: luxuryCars,
      alt: "Professional detail cleaning of luxury vehicles including Jeep and Ford Ranger with Cuci Xpress staff providing meticulous care",
      span: "col-span-1 row-span-1",
    },
    {
      src: brandBanner,
      alt: "Cuci Xpress purple branded drive-thru car wash promotional banner with red sports car design",
      span: "col-span-1 row-span-1",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="pt-16">
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-16"
            >
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
                Our Gallery
              </h1>
              <p className="text-xl text-gray-600 max-w-3xl mx-auto">
                Experience our drive-thru car wash technology and see the quality
                results we deliver across all five branches.
              </p>
            </motion.div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {galleryImages.map((image, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  whileHover={{ scale: 1.02 }}
                  className={image.span}
                >
                  <img
                    src={image.src}
                    alt={image.alt}
                    className="w-full h-full object-cover rounded-2xl shadow-lg hover:shadow-xl transition-shadow"
                  />
                </motion.div>
              ))}
            </div>

            <div className="text-center mt-12">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-cuci-primary hover:text-cuci-primary-dark font-semibold transition-colors"
                data-testid="link-back-home"
              >
                <ArrowLeft className="w-5 h-5" /> Back to Home
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
