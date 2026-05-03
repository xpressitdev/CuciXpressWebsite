import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Users, MapPin, Star } from "lucide-react";

interface StatCardProps {
  icon: React.ReactNode;
  value: number;
  label: string;
  subtitle?: string;
  prefix?: string;
  suffix?: string;
  color: string;
  bgColor: string;
}

function StatCard({ icon, value, label, subtitle, prefix = "", suffix = "", color, bgColor }: StatCardProps) {
  const [ref, isVisible] = useIntersectionObserver({ threshold: 0.5 });

  const formatValue = (val: number) => {
    if (val >= 1000000) {
      return `${Math.floor(val / 1000000)}M+`;
    } else if (val >= 100000 && val !== 100592) {
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
      className="cuci-kpi text-center p-8"
    >
      <div 
        className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6"
        style={{ backgroundColor: color === "text-cuci-primary" ? "#6C5CE7" : color === "text-cuci-secondary" ? "#FFA500" : "#22C55E" }}
      >
        <div className="text-white w-8 h-8 flex items-center justify-center">{icon}</div>
      </div>
      <motion.div
        className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-2"
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
      <div className="text-center">
        <p className="text-gray-600">{label}</p>
        {subtitle && (
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        )}
      </div>
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
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
      
      const easeOutProgress = 1 - Math.pow(1 - progress, 3);
      const currentValue = end * easeOutProgress;
      
      setCount(currentValue);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [end, duration]);

  return (
    <span>
      {prefix}{formatter(count)}{suffix}
    </span>
  );
}

export default function Stats() {
  // Fetch real average rating across all branches
  const { data: ratingData } = useQuery({
    queryKey: ['/api/average-rating'],
    queryFn: async () => {
      const response = await fetch('/api/average-rating');
      if (!response.ok) throw new Error('Failed to fetch average rating');
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const stats = [
    {
      icon: <Calendar className="w-8 h-8" />,
      value: 120000,
      label: "Cars Cleaned and counting",
      color: "text-cuci-primary",
      bgColor: "bg-gradient-to-br from-cuci-primary/5 to-cuci-primary/10",
    },
    {
      icon: <Users className="w-8 h-8" />,
      value: 22,
      label: "Local Staff Employed and counting",
      color: "text-cuci-secondary",
      bgColor: "bg-gradient-to-br from-cuci-secondary/5 to-cuci-secondary/10",
    },
    {
      icon: <MapPin className="w-8 h-8" />,
      value: 5,
      label: "Active Branches",
      color: "text-green-500",
      bgColor: "bg-gradient-to-br from-green-500/5 to-green-500/10",
    },
    {
      icon: <Star className="w-8 h-8" />,
      value: ratingData?.averageRating || 4.8,
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
          <div className="cuci-eyebrow mb-3">By the numbers</div>
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-4">
            Our success <span className="text-cuci-primary">story</span>
          </h2>
          <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto">
            From humble beginnings to becoming the most trusted Xpress drive-thru car wash service, our numbers speak for themselves.
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
