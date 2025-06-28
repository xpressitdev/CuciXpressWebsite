import { motion } from "framer-motion";
import { Star } from "lucide-react";

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
      className="bg-white p-8 rounded-xl border-3 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,0.9)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,0.9)] transition-all duration-200 relative"
      whileHover={{ scale: 1.02 }}
    >
      {/* Rating Badge */}
      <motion.div
        className="absolute -top-4 -right-4 w-12 h-12 rounded-full flex items-center justify-center border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,0.9)]"
        style={{ backgroundColor: getAccentColor() }}
        animate={{
          rotate: [0, 10, 0, -10, 0]
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: [0.76, 0, 0.24, 1]
        }}
      >
        <div className="text-center text-white">
          <div className="text-sm font-black">{rating}</div>
          <Star className="w-3 h-3 fill-current" />
        </div>
      </motion.div>

      <div className="flex items-center mb-4">
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <motion.div
              key={i}
              whileHover={{ scale: 1.2, rotate: 180 }}
              className={`w-6 h-6 rounded-md border border-black flex items-center justify-center text-xs font-bold shadow-[1px_1px_0px_0px_rgba(0,0,0,0.9)]`}
              style={{ 
                backgroundColor: i < rating ? getAccentColor() : "#f3f4f6",
                color: i < rating ? "white" : "#9ca3af"
              }}
            >
              ★
            </motion.div>
          ))}
        </div>
      </div>
      
      <blockquote className="text-black mb-6 text-lg leading-relaxed font-bold">
        "{content}"
      </blockquote>
      
      <div className="flex items-center">
        <motion.div 
          className="w-12 h-12 rounded-full flex items-center justify-center mr-4 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,0.9)]"
          style={{ backgroundColor: getAccentColor() }}
          whileHover={{ scale: 1.1, rotate: 360 }}
          transition={{ duration: 0.3 }}
        >
          <span className="font-black text-white">{initials}</span>
        </motion.div>
        <div>
          <p className="font-black text-black">{name}</p>
          <p className="text-gray-600 text-sm font-bold">{role}</p>
        </div>
      </div>
    </motion.div>
  );
}

export default function Testimonials() {
  const testimonials = [
    {
      name: "Ahmad Hassan",
      role: "Regular Customer",
      content: "Absolutely amazing service! My car has never looked better. The team is professional and the facility is top-notch. I'm a customer for life!",
      rating: 5,
      initials: "AH",
      bgColor: "bg-cuci-primary/10 text-cuci-primary",
    },
    {
      name: "Sarah Wong",
      role: "Business Owner",
      content: "Quick, efficient, and excellent results every time. The staff is friendly and the online queue system is brilliant. Highly recommended!",
      rating: 5,
      initials: "SW",
      bgColor: "bg-cuci-secondary/10 text-cuci-secondary",
    },
    {
      name: "Raj Kumar",
      role: "Fleet Manager",
      content: "Consistently excellent service across all locations. I've tried them all and the quality never disappoints. Great value for money too!",
      rating: 4,
      initials: "RK",
      bgColor: "bg-green-500/10 text-green-500",
    },
  ];

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
            Real reviews from satisfied customers who trust Cuci Xpress with their vehicles.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <TestimonialCard key={index} {...testimonial} />
          ))}
        </div>
      </div>
    </section>
  );
}
