import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Navigation, Star, Crown } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface TestimonialProps {
  name: string;
  role: string;
  content: string;
  rating: number;
  initials: string;
  bgColor: string;
}

interface LocationProps {
  name: string;
  address: string;
  hours: string;
  iconBg: string;
  coordinates: { lat: number; lng: number };
  placeId: string;
  flagship?: boolean;
  services?: string[];
}

function LocationCard({
  name,
  address,
  hours,
  iconBg,
  flagship,
  services,
  isSelected,
  onClick,
}: LocationProps & { isSelected: boolean; onClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      viewport={{ once: true }}
      whileHover={{ translateX: -2, translateY: -2 }}
      onClick={onClick}
      className={`cuci-card p-5 cursor-pointer relative overflow-hidden transition-all ${
        isSelected ? "ring-2 ring-cuci-primary ring-offset-2" : ""
      }`}
      data-testid={`card-location-${name}`}
    >
      {flagship && (
        <div className="absolute top-0 right-0 bg-cuci-secondary text-black text-xs font-extrabold px-3 py-1 flex items-center gap-1 border-l-2 border-b-2 border-black">
          <Crown className="w-3 h-3" />
          FLAGSHIP
        </div>
      )}
      <div className="flex items-start space-x-4">
        <div
          className={`p-3 rounded-lg border-2 border-black ${iconBg}`}
          style={{ boxShadow: "2px 2px 0px 0px rgba(0,0,0,0.9)" }}
        >
          <MapPin className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-extrabold tracking-tight text-gray-900 mb-1">
            {name}
          </h3>
          {services && services.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {services.map((service, i) => (
                <span
                  key={i}
                  className="text-[11px] uppercase tracking-wider font-semibold bg-cuci-primary/10 text-cuci-primary px-2 py-0.5 rounded border border-cuci-primary/30"
                >
                  {service}
                </span>
              ))}
            </div>
          )}
          <p className="text-sm text-gray-700 mb-1">{address}</p>
          <p className="text-xs text-gray-500 mb-3">{hours}</p>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open(
                  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(name)}`,
                  "_blank",
                );
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-cuci-primary hover:text-cuci-primary-dark transition-colors"
              data-testid={`button-directions-${name}`}
            >
              <Navigation className="w-3.5 h-3.5" />
              Get Directions
            </button>
            {isSelected && (
              <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-cuci-secondary">
                <Star className="w-3.5 h-3.5 fill-current" />
                Showing reviews
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function TestimonialCard({ name, role, content, rating, initials, bgColor }: TestimonialProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4 }}
      className="cuci-card-soft p-5"
    >
      <div className="flex items-center space-x-3 mb-3">
        <div
          className={`w-10 h-10 ${bgColor} rounded-full flex items-center justify-center border-2 border-black`}
        >
          <span className="text-white font-extrabold text-sm">{initials}</span>
        </div>
        <div className="min-w-0">
          <h4 className="font-extrabold text-gray-900 truncate">{name}</h4>
          <p className="text-xs text-gray-500 truncate">{role}</p>
        </div>
      </div>
      <div className="flex items-center space-x-0.5 mb-3">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`w-4 h-4 ${
              i < rating ? "text-yellow-400 fill-current" : "text-gray-300"
            }`}
          />
        ))}
      </div>
      <p className="text-sm text-gray-700 leading-relaxed">{content}</p>
    </motion.div>
  );
}

export default function LocationsWithTestimonials() {
  const [selectedLocationIndex, setSelectedLocationIndex] = useState(0);

  const locations: LocationProps[] = [
    {
      name: "Cuci Xpress Tungku Link",
      address:
        "A6–A7, Ground Floor, Block A, Eng Ho Complex, Spg. 217-5-54 Jalan, Lebuhraya Tungku, BE3119",
      hours: "Daily: 8:00 AM - 7:00 PM",
      iconBg: "bg-cuci-primary",
      coordinates: { lat: 4.9112738, lng: 114.9239572 },
      placeId: "",
      flagship: true,
      services: ["Exterior Auto Wash", "Interior Detailing"],
    },
    {
      name: "Cuci Xpress Salar",
      address: "Block B, Salar Light Industrial, Unit 23 Jalan Muara, BU1429",
      hours: "Daily: 8:00 AM - 7:00 PM",
      iconBg: "bg-cuci-secondary",
      coordinates: { lat: 5.00443, lng: 114.9929 },
      placeId: "salar-branch",
      services: ["Exterior Auto Wash"],
    },
    {
      name: "Cuci Xpress Bengkurong",
      address:
        "Unit 12, Ground Floor, Spg. 122, Jalan Bengkurong Masin, Jalan Kampung Bengkurong, Bandar Seri Begawan BF1920",
      hours: "Daily: 8:00 AM - 7:00 PM",
      iconBg: "bg-green-500",
      coordinates: { lat: 4.89035, lng: 114.94006 },
      placeId: "bengkurong-branch",
      services: ["Exterior Auto Wash"],
    },
    {
      name: "Cuci Xpress Tutong",
      address:
        "Unit 5, Ground Floor, Block A, Fatimah Ahmad Complex, Tutong TA2341",
      hours: "Daily: 8:00 AM - 7:00 PM",
      iconBg: "bg-blue-500",
      coordinates: { lat: 4.8007081, lng: 114.6520481 },
      placeId: "tutong-branch",
      services: ["Exterior Auto Wash"],
    },
    {
      name: "Cuci Xpress Lambak",
      address:
        "Unit B11, Ground Floor, Block B, PHDPS Complex, Spg. 209, Jalan Penghubung Berakas, Kg. Lambak Kanan, Bandar Seri Begawan BB1714",
      hours: "Daily: 8:00 AM - 7:00 PM",
      iconBg: "bg-pink-500",
      coordinates: { lat: 4.9715818, lng: 114.9499111 },
      placeId: "lambak-branch",
      services: ["Exterior Auto Wash"],
    },
  ];

  const { data: reviewsData, isLoading } = useQuery<{ reviews: TestimonialProps[] }>({
    queryKey: ["/api/reviews", locations[selectedLocationIndex].placeId],
    queryFn: async () => {
      const response = await fetch(
        `/api/reviews?placeId=${locations[selectedLocationIndex].placeId}`,
      );
      if (!response.ok) throw new Error("Failed to fetch reviews");
      return response.json();
    },
    enabled: true,
  });

  const selectedLocation = locations[selectedLocationIndex];
  const testimonials = reviewsData?.reviews || [];

  return (
    <section id="locations" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <div className="cuci-eyebrow mb-3">5 branches across Brunei</div>
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-4">
            Find us <span className="text-cuci-primary">near you</span>
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            With 5 locations across the region, an Xpress car wash is always
            within reach.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-10 items-start">
          <div className="space-y-4">
            {locations.map((location, index) => (
              <LocationCard
                key={index}
                {...location}
                isSelected={selectedLocationIndex === index}
                onClick={() => setSelectedLocationIndex(index)}
              />
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="cuci-card p-6 md:p-8 lg:sticky lg:top-24"
          >
            <div className="text-center mb-6">
              <div className="cuci-eyebrow mb-2">Customer reviews</div>
              <h3 className="text-2xl font-extrabold tracking-tight text-gray-900">
                What our customers say
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Reviews from {selectedLocation.name}
              </p>
            </div>

            <AnimatePresence mode="wait">
              <div key={selectedLocationIndex} className="grid gap-4 md:grid-cols-2">
                {isLoading ? (
                  <div className="md:col-span-2 flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cuci-primary" />
                    <span className="ml-3 text-sm text-gray-600">
                      Loading reviews...
                    </span>
                  </div>
                ) : testimonials && testimonials.length > 0 ? (
                  testimonials.slice(0, 4).map((testimonial, index) => (
                    <TestimonialCard key={index} {...testimonial} />
                  ))
                ) : (
                  <div className="md:col-span-2 text-center py-8">
                    <Star className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">
                      Loading authentic reviews for this location...
                    </p>
                  </div>
                )}
              </div>
            </AnimatePresence>

            <div className="mt-6 text-center">
              <p className="text-xs text-gray-500">
                Click any branch on the left to see its reviews.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
