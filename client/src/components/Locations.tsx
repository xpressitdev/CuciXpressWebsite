import { motion } from "framer-motion";
import { MapPin, Navigation } from "lucide-react";
import locationMapSvg from "../assets/cuci-xpress-locations-map.svg";

interface LocationProps {
  name: string;
  address: string;
  hours: string;
  bgColor: string;
  iconBg: string;
  coordinates: {
    lat: number;
    lng: number;
  };
}

function LocationCard({ name, address, hours, bgColor, iconBg, coordinates }: LocationProps) {
  const getDirectionsUrl = () => {
    return `https://www.google.com/maps/dir/?api=1&destination=${coordinates.lat},${coordinates.lng}&destination_place_id=${encodeURIComponent(name)}`;
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
          <p className="text-sm text-gray-500 mb-3">{hours}</p>
          <button
            onClick={() => window.open(getDirectionsUrl(), '_blank')}
            className="inline-flex items-center space-x-2 text-sm font-medium text-cuci-primary hover:text-cuci-secondary transition-colors"
          >
            <Navigation className="w-4 h-4" />
            <span>Get Directions</span>
          </button>
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
      coordinates: { lat: 4.9239572, lng: 114.9112738 }
    },
    {
      name: "Cuci Xpress Salar Link",
      address: "Unit 12, Ground Floor, Block A, Rimba Point, Gadong BE4119",
      hours: "Daily: 8:00 AM - 7:00 PM",
      bgColor: "bg-gradient-to-r from-cuci-secondary/5 to-cuci-primary/5",
      iconBg: "bg-cuci-secondary",
      coordinates: { lat: 4.8434285, lng: 114.8728321 }
    },
    {
      name: "Cuci Xpress Bengkurong Link",
      address: "Unit 4, Ground Floor, Block B, Bengkurong Shopping Complex, Brunei-Muara BF2320",
      hours: "Daily: 8:00 AM - 7:00 PM",
      bgColor: "bg-gradient-to-r from-green-500/5 to-blue-500/5",
      iconBg: "bg-green-500",
      coordinates: { lat: 4.8500000, lng: 114.7500000 }
    },
    {
      name: "Cuci Xpress Tutong Link",
      address: "Unit 5, Ground Floor, Block A, Fatimah Ahmad Complex, Tutong TA2341",
      hours: "Daily: 8:00 AM - 7:00 PM",
      bgColor: "bg-gradient-to-r from-blue-500/5 to-purple-500/5",
      iconBg: "bg-blue-500",
      coordinates: { lat: 4.8007081, lng: 114.6520481 }
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
            <div className="bg-white rounded-xl p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4 text-center">Our Strategic Locations</h3>
              <div className="w-full max-w-2xl mx-auto">
                <img 
                  src="/src/assets/cuci-xpress-locations-map.svg" 
                  alt="Cuci Xpress Locations Overview Map showing all 4 branches across Brunei"
                  className="w-full h-auto rounded-lg shadow-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-6">
                {locations.map((location, index) => (
                  <button
                    key={index}
                    onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.name + ' ' + location.address)}`, '_blank')}
                    className="bg-gradient-to-r from-cuci-primary/10 to-cuci-secondary/10 p-3 rounded-lg hover:shadow-md transition-all text-left border border-gray-200"
                  >
                    <div className="flex items-center space-x-2">
                      <div className={`p-2 rounded-full ${location.iconBg}`}>
                        <MapPin className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-gray-900">{location.name.replace('Cuci Xpress ', '')}</p>
                        <p className="text-xs text-gray-600">{location.address.split(',')[0]}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-sm text-gray-600 text-center mt-4">Click any location to get directions on Google Maps</p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
