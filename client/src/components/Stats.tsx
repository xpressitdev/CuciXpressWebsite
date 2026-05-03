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
  iconBg: string;
  iconColor: string;
}

function StatCard({ icon, value, label, subtitle, prefix = "", suffix = "", iconBg, iconColor }: StatCardProps) {
  const [ref, isVisible] = useIntersectionObserver({ threshold: 0.5 });

  const formatValue = (val: number) => {
    if (val >= 1000000) return `${Math.floor(val / 1000000)}M+`;
    if (val >= 100000 && val !== 100592) return `${Math.floor(val / 1000)}K+`;
    if (val < 10) return val.toFixed(1);
    return Math.floor(val).toLocaleString();
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.6 }}
      className="cuci-kpi text-center p-6"
    >
      <div
        className={`inline-flex items-center justify-center w-14 h-14 rounded-xl mb-5 border-2 border-black ${iconBg}`}
        style={{ boxShadow: "2px 2px 0px 0px rgba(0,0,0,0.9)" }}
      >
        <div className={`w-7 h-7 flex items-center justify-center ${iconColor}`}>
          {icon}
        </div>
      </div>
      <motion.div
        className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-2"
        initial={{ opacity: 0 }}
        animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 1, delay: 0.3 }}
      >
        {isVisible && (
          <CountUp end={value} duration={2} prefix={prefix} suffix={suffix} formatter={formatValue} />
        )}
      </motion.div>
      <p className="text-sm font-semibold text-gray-700">{label}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
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
      setCount(end * easeOutProgress);
      if (progress < 1) animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [end, duration]);

  return (
    <span>
      {prefix}
      {formatter(count)}
      {suffix}
    </span>
  );
}

export default function Stats() {
  const { data: ratingData } = useQuery<{ averageRating: number }>({
    queryKey: ["/api/average-rating"],
    staleTime: 5 * 60 * 1000,
  });

  const stats: StatCardProps[] = [
    {
      icon: <Calendar className="w-7 h-7" />,
      value: 120000,
      label: "Cars cleaned and counting",
      iconBg: "bg-cuci-primary",
      iconColor: "text-white",
    },
    {
      icon: <Users className="w-7 h-7" />,
      value: 22,
      label: "Local staff employed",
      iconBg: "bg-cuci-secondary",
      iconColor: "text-black",
    },
    {
      icon: <MapPin className="w-7 h-7" />,
      value: 5,
      label: "Active branches",
      iconBg: "bg-green-500",
      iconColor: "text-white",
    },
    {
      icon: <Star className="w-7 h-7 fill-current" />,
      value: ratingData?.averageRating || 4.8,
      label: "Average rating",
      suffix: "/5",
      iconBg: "bg-yellow-400",
      iconColor: "text-black",
    },
  ];

  return (
    <section id="stats" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <div className="cuci-eyebrow mb-3">By the numbers</div>
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-4">
            Our success <span className="text-cuci-primary">story</span>
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            From humble beginnings to becoming the most trusted Xpress drive-thru
            car wash service — our numbers speak for themselves.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => (
            <StatCard key={index} {...stat} />
          ))}
        </div>
      </div>
    </section>
  );
}
