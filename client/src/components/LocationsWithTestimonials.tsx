import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Navigation, Star } from "lucide-react";
import { useState, useEffect } from "react";
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
  bgColor: string;
  iconBg: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  placeId: string;
}

function LocationCard({ name, address, hours, bgColor, iconBg, coordinates, placeId, isSelected, onClick }: LocationProps & { isSelected: boolean; onClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -30 }}
      whileInView={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6 }}
      viewport={{ once: true }}
      className={`bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer ${isSelected ? 'ring-2 ring-cuci-primary ring-opacity-50' : ''}`}
      whileHover={{ scale: 1.02 }}
      onClick={onClick}
    >
      <div className="flex items-start space-x-4">
        <div className={`p-3 rounded-full ${iconBg}`}>
          <MapPin className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{name}</h3>
          <p className="text-gray-600 mb-2">{address}</p>
          <p className="text-sm text-gray-500 mb-3">{hours}</p>
          <div className="flex space-x-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(name)}`, '_blank');
              }}
              className="inline-flex items-center space-x-2 text-sm font-medium text-cuci-primary hover:text-cuci-secondary transition-colors"
            >
              <Navigation className="w-4 h-4" />
              <span>Get Directions</span>
            </button>
            {isSelected && (
              <div className="inline-flex items-center space-x-2 text-sm font-medium text-cuci-secondary">
                <Star className="w-4 h-4 fill-current" />
                <span>Showing Reviews</span>
              </div>
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-2xl p-6 shadow-lg"
    >
      <div className="flex items-center space-x-4 mb-4">
        <div className={`w-12 h-12 ${bgColor} rounded-full flex items-center justify-center`}>
          <span className="text-white font-bold text-lg">{initials}</span>
        </div>
        <div>
          <h4 className="font-bold text-gray-900">{name}</h4>
          <p className="text-gray-600 text-sm">{role}</p>
        </div>
      </div>
      <div className="flex items-center space-x-1 mb-4">
        {[...Array(5)].map((_, i) => (
          <Star 
            key={i} 
            className={`w-5 h-5 ${i < rating ? 'text-yellow-400 fill-current' : 'text-gray-300'}`} 
          />
        ))}
      </div>
      <p className="text-gray-700 leading-relaxed">{content}</p>
    </motion.div>
  );
}

export default function LocationsWithTestimonials() {
  const [selectedLocationIndex, setSelectedLocationIndex] = useState(0);

  const locations: LocationProps[] = [
    {
      name: "Cuci Xpress Tungku Link",
      address: "A6, Ground Floor, Block A, Eng Ho Complex, Spg. 217-5-54 Jalan, Lebuhraya Tungku, BE3119",
      hours: "Daily: 8:00 AM - 7:00 PM",
      bgColor: "bg-gradient-to-br from-purple-50 to-purple-100",
      iconBg: "bg-cuci-primary",
      coordinates: { lat: 4.9112738, lng: 114.9239572 },
      placeId: "" // Use default place ID (from environment variable)
    },
    {
      name: "Cuci Xpress Salar",
      address: "Block B, Salar Light Industrial, Unit 23 Jalan Muara, BU1429",
      hours: "Daily: 8:00 AM - 8:00 PM",
      bgColor: "bg-gradient-to-br from-orange-50 to-orange-100",
      iconBg: "bg-cuci-secondary",
      coordinates: { lat: 5.00443, lng: 114.99290 },
      placeId: "salar-branch"
    },
    {
      name: "Cuci Xpress Bengkurong",
      address: "Unit 12, Ground Floor, Spg. 122, Jalan Bengkurong Masin, Jalan Kampung Bengkurong, Bandar Seri Begawan BF1920",
      hours: "Daily: 8:00 AM - 8:00 PM",
      bgColor: "bg-gradient-to-br from-green-50 to-green-100",
      iconBg: "bg-green-500",
      coordinates: { lat: 4.89035, lng: 114.94006 },
      placeId: "bengkurong-branch"
    },
    {
      name: "Cuci Xpress Tutong",
      address: "Unit 5, Ground Floor, Block A, Fatimah Ahmad Complex, Tutong TA2341",
      hours: "Daily: 8:00 AM - 8:00 PM",
      bgColor: "bg-gradient-to-br from-blue-50 to-blue-100",
      iconBg: "bg-blue-500",
      coordinates: { lat: 4.8007081, lng: 114.6520481 },
      placeId: "tutong-branch"
    }
  ];

  // Fetch Google Reviews for the selected location
  const { data: reviewsData, isLoading } = useQuery({
    queryKey: ['/api/reviews', locations[selectedLocationIndex].placeId],
    queryFn: async () => {
      const response = await fetch(`/api/reviews?placeId=${locations[selectedLocationIndex].placeId}`);
      if (!response.ok) throw new Error('Failed to fetch reviews');
      return response.json();
    },
    enabled: true
  });

  const selectedLocation = locations[selectedLocationIndex];
  const testimonials = reviewsData?.reviews || [];

  return (
    <section id="locations" className="py-16 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
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
          {/* Locations Grid */}
          <div className="space-y-6">
            {locations.map((location, index) => (
              <LocationCard
                key={index}
                {...location}
                isSelected={selectedLocationIndex === index}
                onClick={() => setSelectedLocationIndex(index)}
              />
            ))}
          </div>

          {/* Dynamic Testimonials */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="bg-gray-100 rounded-2xl p-8"
          >
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">What Our Customers Say</h3>
              <p className="text-gray-600">Reviews from {selectedLocation.name}</p>
            </div>
            
            <AnimatePresence mode="wait">
              <div key={selectedLocationIndex} className="grid gap-6 md:grid-cols-2">
                {isLoading ? (
                  <div className="md:col-span-2 flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cuci-primary"></div>
                    <span className="ml-3 text-gray-600">Loading reviews...</span>
                  </div>
                ) : testimonials && testimonials.length > 0 ? (
                  testimonials.slice(0, 4).map((testimonial: any, index: number) => (
                    <TestimonialCard key={index} {...testimonial} />
                  ))
                ) : (
                  <div className="md:col-span-2 text-center py-8">
                    <Star className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">Loading authentic reviews for this location...</p>
                  </div>
                )}
              </div>
            </AnimatePresence>
            
            <div className="mt-8 text-center">
              <p className="text-sm text-gray-500">
                Click different locations to see reviews from each branch
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}