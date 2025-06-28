import { motion } from "framer-motion";
import { MapPin } from "lucide-react";

interface LocationProps {
  name: string;
  address: string;
  hours: string;
  bgColor: string;
  iconBg: string;
}

function LocationCard({ name, address, hours, bgColor, iconBg }: LocationProps) {
  const getAccentColor = () => {
    if (iconBg.includes("cuci-primary")) return "#6C5CE7";
    if (iconBg.includes("cuci-secondary")) return "#FFA500";
    if (iconBg.includes("green")) return "#22C55E";
    return "#3B82F6";
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -30 }}
      whileInView={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6 }}
      viewport={{ once: true }}
      className="bg-white p-6 rounded-xl border-3 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,0.9)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,0.9)] transition-all duration-200"
      whileHover={{ scale: 1.02 }}
    >
      <div className="flex items-start space-x-4">
        <motion.div 
          className="p-3 rounded-full border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,0.9)]"
          style={{ backgroundColor: getAccentColor() }}
          animate={{
            rotate: [0, 10, 0, -10, 0],
            scale: [1, 1.1, 0.9, 1.1, 1]
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: [0.76, 0, 0.24, 1]
          }}
        >
          <MapPin className="w-6 h-6 text-white" />
        </motion.div>
        <div className="flex-1">
          <h3 className="text-lg font-black text-black mb-2">{name}</h3>
          <p className="text-gray-700 mb-2 font-bold">{address}</p>
          <motion.p 
            className="text-sm text-white font-bold px-3 py-1 rounded-md border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,0.9)] inline-block"
            style={{ backgroundColor: getAccentColor() }}
            whileHover={{ scale: 1.05 }}
          >
            {hours}
          </motion.p>
        </div>
      </div>
    </motion.div>
  );
}

export default function Locations() {
  const locations = [
    {
      name: "Bandar Seri Begawan - Main Branch",
      address: "Jalan Tutong, Bandar Seri Begawan BA1511",
      hours: "Open: 7:00 AM - 9:00 PM Daily",
      bgColor: "bg-gradient-to-r from-cuci-primary/5 to-cuci-secondary/5",
      iconBg: "bg-cuci-primary",
    },
    {
      name: "Kiulap Branch",
      address: "Kiulap Plaza, Jalan Kiulap BE1518",
      hours: "Open: 8:00 AM - 8:00 PM Daily",
      bgColor: "bg-gradient-to-r from-cuci-secondary/5 to-cuci-primary/5",
      iconBg: "bg-cuci-secondary",
    },
    {
      name: "Gadong Branch",
      address: "Times Square, Jalan Gadong BE3519",
      hours: "Open: 8:00 AM - 10:00 PM Daily",
      bgColor: "bg-gradient-to-r from-green-500/5 to-blue-500/5",
      iconBg: "bg-green-500",
    },
    {
      name: "Seria Branch",
      address: "Seria Plaza, Jalan Seria KB1133",
      hours: "Open: 7:30 AM - 8:30 PM Daily",
      bgColor: "bg-gradient-to-r from-blue-500/5 to-purple-500/5",
      iconBg: "bg-blue-500",
    },
  ];

  return (
    <section id="locations" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Find Us Near You</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            With 4 strategic locations across the region, premium car care is always within reach.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          <div className="space-y-6">
            {locations.map((location, index) => (
              <LocationCard key={index} {...location} />
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="bg-gray-100 rounded-2xl p-4"
          >
            <div className="aspect-w-16 aspect-h-12 rounded-xl overflow-hidden">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d126743.63241384779!2d114.82732019726562!3d4.535276900000002!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3220d70e4d0b0129%3A0x9a55d20d7b98b25a!2sBandar%20Seri%20Begawan%2C%20Brunei!5e0!3m2!1sen!2s!4v1234567890123!5m2!1sen!2s"
                width="100%"
                height="400"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="rounded-xl"
              />
            </div>
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-600">Interactive map showing all our locations</p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
