import { motion } from "framer-motion";
import carWashBay from "@assets/WhatsApp Image 2025-06-26 at 23.35.45_3b66e14a_1751160530356.jpg";
import storefront from "@assets/WhatsApp Image 2025-06-26 at 23.11.24_5946c0a8_1751160533115.jpg";
import washTunnel from "@assets/20220928_2008581_1751160753598.jpg";
import nightView from "@assets/20241007_182239_1751160790928.jpg";
import dingPayment from "@assets/ding pgh_1751161276778.png";
import dualWash from "@assets/IMG-20220108-WA0042_1751160949648.jpg";
import luxuryCars from "../assets/gallery-7.jpg";
import brandBanner from "../assets/gallery-8.jpg";

export default function Gallery() {
  const galleryImages = [
    { src: dingPayment, alt: "Smiling Cuci Xpress team member providing friendly service with 'pay with ding!' digital payment option", span: "col-span-2 row-span-2" },
    { src: storefront, alt: "Cuci Xpress storefront with purple and orange branding at sunset", span: "col-span-1 row-span-1" },
    { src: washTunnel, alt: "Automated car wash tunnel with brushes and spray equipment", span: "col-span-1 row-span-1" },
    { src: nightView, alt: "Cuci Xpress night view with purple branding and red car entering wash bay", span: "col-span-1 row-span-1" },
    { src: carWashBay, alt: "White Haval car getting washed in automated car wash bay with purple fans overhead", span: "col-span-1 row-span-1" },
    { src: dualWash, alt: "Two white Audi cars being washed simultaneously in automated wash bays", span: "col-span-2 row-span-1" },
    { src: luxuryCars, alt: "Professional detail cleaning of luxury vehicles with Cuci Xpress staff providing meticulous care", span: "col-span-1 row-span-1" },
    { src: brandBanner, alt: "Cuci Xpress purple branded drive-thru car wash promotional banner with red sports car design", span: "col-span-1 row-span-1" },
  ];

  return (
    <section id="gallery" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <div className="cuci-eyebrow mb-3">Behind the scenes</div>
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-4">
            See our <span className="text-cuci-primary">work</span>
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Experience our drive-thru car wash technology and the quality results
            we deliver across all locations.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {galleryImages.map((image, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
              viewport={{ once: true }}
              whileHover={{ translateX: -2, translateY: -2 }}
              className={`${image.span} overflow-hidden rounded-xl border-2 border-black bg-black`}
              style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,0.9)" }}
            >
              <img
                src={image.src}
                alt={image.alt}
                className="w-full h-full object-cover"
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
