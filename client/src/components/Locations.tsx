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
      className="bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-shadow"
      whileHover={{ scale: 1.02 }}
    >
      <div className="flex items-start space-x-4">
        <div 
          className={`p-3 rounded-full ${iconBg}`}
        >
          <MapPin className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{name}</h3>
          <p className="text-gray-600 mb-2">{address}</p>
          <p className="text-sm text-gray-500">{hours}</p>
        </div>
      </div>
    </motion.div>
  );
}

export default function Locations() {
  const locations = [
    {
      name: "Cuci Xpress Tungku Link",
      address: "A6, Ground Floor, Block A, Eng Ho Complex, Spg. 217-5-54 Jalan Lebuhraya Tungku, BE3119",
      hours: "Mon-Thu & Sat-Sun: 8:00 AM - 7:00 PM | Fri: 8:00 AM - 12:00 PM, 2:00 - 7:00 PM",
      bgColor: "bg-gradient-to-r from-cuci-primary/5 to-cuci-secondary/5",
      iconBg: "bg-cuci-primary",
    },
    {
      name: "Cuci Xpress Salar Link",
      address: "Unit 12, Ground Floor, Block A, Rimba Point, Gadong BE4119",
      hours: "Daily: 8:00 AM - 7:00 PM",
      bgColor: "bg-gradient-to-r from-cuci-secondary/5 to-cuci-primary/5",
      iconBg: "bg-cuci-secondary",
    },
    {
      name: "Cuci Xpress Bengkurong Link",
      address: "Unit 4, Ground Floor, Block B, Bengkurong Shopping Complex, Brunei-Muara BF2320",
      hours: "Daily: 8:00 AM - 7:00 PM",
      bgColor: "bg-gradient-to-r from-green-500/5 to-blue-500/5",
      iconBg: "bg-green-500",
    },
    {
      name: "Cuci Xpress Tutong Link",
      address: "Unit 5, Ground Floor, Block A, Fatimah Ahmad Complex, Tutong TA2341",
      hours: "Daily: 8:00 AM - 7:00 PM",
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
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d63652.13359375!2d114.85!3d4.87!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x32217370a7b90975%3A0x60217b50a93d96d!2sBrunei-Muara%2C%20Brunei!5e0!3m2!1sen!2s!4v1640995200000!5m2!1sen!2s"
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
              <p className="text-sm text-gray-600">Find our 4 convenient locations across Brunei-Muara</p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
