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
                src="https://www.google.com/maps/embed?pb=!1m76!1m12!1m3!1d254747.5234375!2d114.65205!3d4.8639!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!4m61!4e1!4m60!1m5!1m1!1s0x3220f8bfbf1f8c8b:0x363a1c6d6bb3c49c!2m2!1d114.9112738!2d4.9239572!1m5!1m1!1s0x3220ee0ac6a44b4d:0x4a2d2a2b0b2d2a2b!2m2!1d114.8728321!2d4.8434285!1m5!1m1!1s0x3220e3e5e5e5e5e5:0x5e5e5e5e5e5e5e5e!2m2!1d114.7500000!2d4.8500000!1m5!1m1!1s0x3220a0a0a0a0a0a0:0x6a6a6a6a6a6a6a6a!2m2!1d114.6520481!2d4.8007081!5e0!3m2!1sen!2s!4v1751120995000!5m2!1sen!2s"
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
