import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Link, useLocation } from "wouter";

export default function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleNavigation = (item: { id: string; path: string }) => {
    if (item.id === "home") {
      // Navigate to home and scroll to top
      if (location !== "/") {
        window.location.href = "/";
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } else if (item.path === "/") {
      // For home page sections, ensure we're on home page first
      if (location !== "/") {
        window.location.href = `/#${item.id}`;
      } else {
        const element = document.getElementById(item.id);
        if (element) {
          element.scrollIntoView({ behavior: "smooth" });
        }
      }
    }
    setIsMobileMenuOpen(false);
  };

  const navItems = [
    { id: "home", label: "Home", path: "/" },
    { id: "stats", label: "Our Success", path: "/" },
    { id: "testimonials", label: "Reviews", path: "/" },
    { id: "locations", label: "Locations", path: "/" },
    { id: "gallery", label: "Gallery", path: "/" },
    { id: "pricing", label: "Pricing", path: "/" },
  ];

  return (
    <nav
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        isScrolled ? "bg-white/95 shadow-sm" : "bg-white/90"
      } nav-backdrop`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <button 
              onClick={() => handleNavigation({ id: "home", path: "/" })}
              className="text-2xl font-bold text-cuci-primary hover:opacity-80 transition-opacity"
            >
              Cuci<span className="text-cuci-secondary">Xpress</span>
            </button>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-8">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavigation(item)}
                  className="text-gray-700 hover:text-cuci-primary px-3 py-2 text-sm font-medium transition-colors"
                >
                  {item.label}
                </button>
              ))}
              <a
                href="https://cuci-xpress.com"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-cuci-primary hover:bg-cuci-primary-dark text-white px-6 py-2 rounded-full text-sm font-medium transition-colors"
              >
                Live-Queue
              </a>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-gray-700 hover:text-cuci-primary focus:outline-none focus:text-cuci-primary transition-colors"
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {isMobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="md:hidden bg-white border-t"
        >
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavigation(item)}
                className="block px-3 py-2 text-base font-medium text-gray-700 hover:text-cuci-primary transition-colors w-full text-left"
              >
                {item.label}
              </button>
            ))}
            <button
              onClick={() => handleNavigation({ id: "invest", path: "/" })}
              className="block bg-cuci-primary hover:bg-cuci-primary-dark text-white px-6 py-2 rounded-full text-base font-medium transition-colors mx-3 my-2 text-center w-auto"
            >
              Invest
            </button>
          </div>
        </motion.div>
      )}
    </nav>
  );
}
