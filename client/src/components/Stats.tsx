import { motion } from "framer-motion";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { Calendar, DollarSign, MapPin, Star } from "lucide-react";

interface StatCardProps {
  icon: React.ReactNode;
  value: number;
  label: string;
  prefix?: string;
  suffix?: string;
  color: string;
  bgColor: string;
}

function StatCard({ icon, value, label, prefix = "", suffix = "", color, bgColor }: StatCardProps) {
  const [ref, isVisible] = useIntersectionObserver({ threshold: 0.5 });

  const formatValue = (val: number) => {
    if (val >= 1000000) {
      return `${Math.floor(val / 1000000)}M+`;
    } else if (val >= 100000) {
      return `${Math.floor(val / 1000)}K+`;
    } else if (val < 10) {
      return val.toFixed(1);
    } else {
      return Math.floor(val).toLocaleString();
    }
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
      transition={{ duration: 0.6 }}
      className={`text-center p-8 ${bgColor} rounded-2xl`}
    >
      <div className={`inline-flex items-center justify-center w-16 h-16 ${color}/10 rounded-full mb-6`}>
        <div className={`${color} w-8 h-8`}>{icon}</div>
      </div>
      <motion.div
        className={`text-4xl font-bold ${color} mb-2`}
        initial={{ opacity: 0 }}
        animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 1, delay: 0.3 }}
      >
        {isVisible && (
          <CountUp
            end={value}
            duration={2}
            prefix={prefix}
            suffix={suffix}
            formatter={formatValue}
          />
        )}
      </motion.div>
      <p className="text-gray-600 font-medium">{label}</p>
    </motion.div>
  );
}

interface CountUpProps {
  end: number;
  duration: number;
  prefix?: string;
  suffix?: string;
  formatter: (value: number) => string;
}

function CountUp({ end, duration, prefix = "", suffix = "", formatter }: CountUpProps) {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration }}
    >
      {prefix}
      <motion.span
        initial={{ textContent: "0" }}
        animate={{ textContent: formatter(end) }}
        transition={{
          duration,
          ease: "easeOut",
        }}
        onUpdate={(latest) => {
          if (typeof latest.textContent === "string") {
            const current = parseFloat(latest.textContent.replace(/[^\d.]/g, ""));
            return formatter(current);
          }
        }}
      >
        0
      </motion.span>
      {suffix}
    </motion.span>
  );
}

export default function Stats() {
  const stats = [
    {
      icon: <Calendar className="w-8 h-8" />,
      value: 100000,
      label: "Cars Cleaned",
      color: "text-cuci-primary",
      bgColor: "bg-gradient-to-br from-cuci-primary/5 to-cuci-primary/10",
    },
    {
      icon: <DollarSign className="w-8 h-8" />,
      value: 1000000,
      label: "Revenue Generated",
      prefix: "BND ",
      color: "text-cuci-secondary",
      bgColor: "bg-gradient-to-br from-cuci-secondary/5 to-cuci-secondary/10",
    },
    {
      icon: <MapPin className="w-8 h-8" />,
      value: 4,
      label: "Active Branches",
      color: "text-green-500",
      bgColor: "bg-gradient-to-br from-green-500/5 to-green-500/10",
    },
    {
      icon: <Star className="w-8 h-8" />,
      value: 4.8,
      label: "Average Rating",
      suffix: "/5",
      color: "text-yellow-500",
      bgColor: "bg-gradient-to-br from-yellow-500/5 to-yellow-500/10",
    },
  ];

  return (
    <section id="stats" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Our Success Story</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            From humble beginnings to becoming the premier car wash service, our numbers speak for themselves.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <StatCard key={index} {...stat} />
          ))}
        </div>
      </div>
    </section>
  );
}
