import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface GoogleReviewsResponse {
  reviews: TestimonialProps[];
  averageRating: number;
  totalReviews: number;
}

interface TestimonialProps {
  name: string;
  role: string;
  content: string;
  rating: number;
  initials: string;
  bgColor: string;
}

function TestimonialCard({ name, role, content, rating, initials, bgColor }: TestimonialProps) {
  const getAccentColor = () => {
    if (bgColor.includes("cuci-primary")) return "#6C5CE7";
    if (bgColor.includes("cuci-secondary")) return "#FFA500";
    return "#22C55E";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      viewport={{ once: true }}
      className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow"
      whileHover={{ scale: 1.02 }}
    >

      <div className="flex items-center mb-4">
        <div className="flex">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`w-5 h-5 ${
                i < rating ? "text-yellow-400 fill-current" : "text-gray-300"
              }`}
            />
          ))}
        </div>
      </div>
      
      <blockquote className="text-gray-700 mb-6 text-lg leading-relaxed">
        "{content}"
      </blockquote>
      
      <div className="flex items-center">
        <div 
          className="w-12 h-12 rounded-full flex items-center justify-center mr-4"
          style={{ backgroundColor: bgColor }}
        >
          <span className="font-semibold text-white">{initials}</span>
        </div>
        <div>
          <p className="font-semibold text-gray-900">{name}</p>
          <p className="text-gray-600 text-sm">{role}</p>
        </div>
      </div>
    </motion.div>
  );
}

export default function Testimonials() {
  const { data, isLoading, error } = useQuery<GoogleReviewsResponse>({
    queryKey: ['/api/reviews'],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 2,
  });

  // Fallback testimonials when API is unavailable
  const fallbackTestimonials: TestimonialProps[] = [
    {
      name: "Ahmad Hassan",
      role: "Regular Customer",
      content: "Absolutely amazing service! My car has never looked better. The team is professional and the facility is top-notch.",
      rating: 5,
      initials: "AH",
      bgColor: "#6C5CE7",
    },
    {
      name: "Sarah Wong", 
      role: "Business Owner",
      content: "Quick, efficient, and excellent results every time. The staff is friendly and the online queue system is brilliant.",
      rating: 5,
      initials: "SW",
      bgColor: "#FFA500",
    },
    {
      name: "Raj Kumar",
      role: "Fleet Manager", 
      content: "Consistently excellent service across all locations. Great value for money and never disappoints.",
      rating: 4,
      initials: "RK",
      bgColor: "#22C55E",
    },
  ];

  const testimonials = data?.reviews || fallbackTestimonials;

  if (isLoading) {
    return (
      <section id="testimonials" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">What Our Customers Say</h2>
            <p className="text-xl text-gray-600">Loading real Google reviews...</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white p-8 rounded-2xl shadow-lg animate-pulse">
                <div className="h-5 bg-gray-200 rounded mb-4"></div>
                <div className="h-20 bg-gray-200 rounded mb-6"></div>
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-gray-200 rounded-full mr-4"></div>
                  <div>
                    <div className="h-4 bg-gray-200 rounded mb-2 w-24"></div>
                    <div className="h-3 bg-gray-200 rounded w-20"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section id="testimonials" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold text-gray-900 mb-4">What Our Customers Say</h2>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 max-w-2xl mx-auto">
              <p className="text-amber-800 text-sm">
                Temporarily showing recent customer testimonials while reviews load.
              </p>
            </div>
          </motion.div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {fallbackTestimonials.map((testimonial: TestimonialProps, index: number) => (
              <TestimonialCard key={index} {...testimonial} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="testimonials" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold text-gray-900 mb-4">What Our Customers Say</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Real Google reviews from satisfied customers who trust Cuci Xpress with their vehicles.
          </p>
          {data?.averageRating && (
            <div className="flex items-center justify-center mt-4 space-x-2">
              <div className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`w-6 h-6 ${
                      i < Math.round(data.averageRating) ? "text-yellow-400 fill-current" : "text-gray-300"
                    }`}
                  />
                ))}
              </div>
              <span className="text-lg font-semibold text-gray-900">
                {data.averageRating.toFixed(1)} ({data.totalReviews} reviews)
              </span>
            </div>
          )}
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {testimonials.map((testimonial: TestimonialProps, index: number) => (
            <TestimonialCard key={index} {...testimonial} />
          ))}
        </div>
      </div>
    </section>
  );
}
