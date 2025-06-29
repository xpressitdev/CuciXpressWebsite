import { motion } from "framer-motion";

export default function Gallery() {
  const galleryImages = [
    {
      src: "/attached_assets/WhatsApp Image 2025-06-26 at 23.35.45_3b66e14a_1751160530356.jpg",
      alt: "White Haval car getting washed in automated car wash bay with purple fans overhead",
      span: "col-span-2 row-span-2",
    },
    {
      src: "/attached_assets/WhatsApp Image 2025-06-26 at 23.11.24_5946c0a8_1751160533115.jpg",
      alt: "Cuci Xpress storefront with purple and orange branding at sunset",
      span: "col-span-1 row-span-1",
    },
    {
      src: "/attached_assets/20220928_2008581_1751160753598.jpg",
      alt: "Automated car wash tunnel with brushes and spray equipment",
      span: "col-span-1 row-span-1",
    },
    {
      src: "/attached_assets/20241007_182239_1751160790928.jpg",
      alt: "Cuci Xpress night view with purple branding and red car entering wash bay",
      span: "col-span-1 row-span-1",
    },
    {
      src: "/attached_assets/IMG-20220115-WA0070_1751160949647.jpg",
      alt: "Professional team hand-washing white Honda sedan with branded Cuci Xpress logo",
      span: "col-span-1 row-span-1",
    },
    {
      src: "/attached_assets/IMG-20220108-WA0042_1751160949648.jpg",
      alt: "Two white Audi cars being washed simultaneously in automated wash bays",
      span: "col-span-2 row-span-1",
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
            From state-of-the-art facilities to satisfied customers, witness the Cuci Xpress difference.
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
      </div>
    </section>
  );
}
