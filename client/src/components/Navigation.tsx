import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Menu, X, User, LogIn } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

// Navigation works in two modes:
//   - Section anchors (home/stats/locations/gallery/service-pricing): smooth-
//     scroll inside `/`. If the user is on another route, we route to /#anchor
//     via wouter so the browser uses SPA navigation instead of a hard reload.
//   - Page links (subscriptions, queue, login, dashboard): plain wouter Link.
//
// Renamed the Sign-in pill to "Customer login" so customers don't confuse it
// with the staff sign-in at /admin and /pos.
type NavItem =
  | { kind: "section"; id: string; label: string }
  | { kind: "page"; href: string; label: string };

const navItems: NavItem[] = [
  { kind: "section", id: "home", label: "Home" },
  { kind: "section", id: "stats", label: "Our Success" },
  { kind: "section", id: "locations", label: "Locations" },
  { kind: "section", id: "gallery", label: "Gallery" },
  { kind: "section", id: "service-pricing", label: "Pricing" },
  { kind: "page", href: "/subscriptions", label: "Subscriptions" },
  { kind: "page", href: "/queue", label: "Live Queue" },
];

export default function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [location, setLocation] = useLocation();
  // Cheap whoami check so we can swap the "Customer login" pill to
  // "My account" when a customer Lucia session is present.
  const { data: who } = useQuery<{ authenticated: boolean }>({
    queryKey: ["/api/auth/whoami"],
  });
  const isLoggedIn = !!who?.authenticated;

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 100);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const goToSection = (id: string) => {
    setIsMobileMenuOpen(false);
    if (location !== "/") {
      // Land on home with the hash, then scroll once mounted.
      setLocation("/");
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }, 80);
      return;
    }
    if (id === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  const goToHome = () => {
    setIsMobileMenuOpen(false);
    if (location !== "/") {
      setLocation("/");
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <nav
      className={`fixed top-0 w-full z-50 transition-all duration-300 nav-backdrop ${
        isScrolled
          ? "bg-white/95 border-b-2 border-black"
          : "bg-white/90 border-b-2 border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <button
            onClick={goToHome}
            className="text-2xl font-bold text-cuci-primary hover:opacity-80 transition-opacity whitespace-nowrap"
            data-testid="link-nav-brand"
          >
            Cuci<span className="text-cuci-secondary">Xpress</span>
          </button>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-5">
            {navItems.map((item) =>
              item.kind === "section" ? (
                <button
                  key={`section-${item.id}-${item.label}`}
                  onClick={() => goToSection(item.id)}
                  className="text-gray-700 hover:text-cuci-primary px-1 py-2 text-sm font-medium transition-colors whitespace-nowrap"
                  data-testid={`link-nav-${item.id}`}
                >
                  {item.label}
                </button>
              ) : (
                <Link
                  key={`page-${item.href}`}
                  href={item.href}
                  className="text-gray-700 hover:text-cuci-primary px-1 py-2 text-sm font-medium transition-colors whitespace-nowrap"
                  data-testid={`link-nav-${item.href.replace(/\//g, "")}`}
                >
                  {item.label}
                </Link>
              ),
            )}
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                className="cuci-cta bg-cuci-primary text-white px-5 py-2 rounded-full text-sm inline-flex items-center gap-1.5 whitespace-nowrap"
                data-testid="link-nav-dashboard"
              >
                <User className="w-4 h-4" /> My account
              </Link>
            ) : (
              <Link
                href="/login"
                className="cuci-cta bg-cuci-primary text-white px-5 py-2 rounded-full text-sm inline-flex items-center gap-1.5 whitespace-nowrap"
                data-testid="link-nav-signin"
              >
                <LogIn className="w-4 h-4" /> Customer login
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-gray-700 hover:text-cuci-primary focus:outline-none focus:text-cuci-primary transition-colors"
              data-testid="button-nav-mobile-toggle"
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
          className="md:hidden bg-white border-t-2 border-black"
        >
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {navItems.map((item) =>
              item.kind === "section" ? (
                <button
                  key={`m-section-${item.id}-${item.label}`}
                  onClick={() => goToSection(item.id)}
                  className="block px-3 py-2 text-base font-medium text-gray-700 hover:text-cuci-primary transition-colors w-full text-left"
                  data-testid={`link-nav-mobile-${item.id}`}
                >
                  {item.label}
                </button>
              ) : (
                <Link
                  key={`m-page-${item.href}`}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-3 py-2 text-base font-medium text-gray-700 hover:text-cuci-primary transition-colors w-full text-left"
                  data-testid={`link-nav-mobile-${item.href.replace(/\//g, "")}`}
                >
                  {item.label}
                </Link>
              ),
            )}
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                onClick={() => setIsMobileMenuOpen(false)}
                className="cuci-cta bg-cuci-primary text-white px-6 py-2 rounded-full text-base font-semibold mx-3 my-2 inline-flex items-center justify-center gap-2 w-auto"
                data-testid="link-nav-dashboard-mobile"
              >
                <User className="w-4 h-4" /> My account
              </Link>
            ) : (
              <Link
                href="/login"
                onClick={() => setIsMobileMenuOpen(false)}
                className="cuci-cta bg-cuci-primary text-white px-6 py-2 rounded-full text-base font-semibold mx-3 my-2 inline-flex items-center justify-center gap-2 w-auto"
                data-testid="link-nav-signin-mobile"
              >
                <LogIn className="w-4 h-4" /> Customer login
              </Link>
            )}
          </div>
        </motion.div>
      )}
    </nav>
  );
}
