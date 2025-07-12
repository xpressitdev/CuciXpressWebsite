import Navigation from "@/components/Navigation";
import Hero from "@/components/Hero";
import Stats from "@/components/Stats";
import LocationsWithTestimonials from "@/components/LocationsWithTestimonials";
import Gallery from "@/components/Gallery";
import PricingSection from "@/components/PricingSection";
import ServicePricing from "@/components/ServicePricing";
import Investment from "@/components/Investment";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main>
        <Hero />
        <Stats />
        <LocationsWithTestimonials />
        <Gallery />
        <ServicePricing />
        <PricingSection />
        <Investment />
      </main>
      <Footer />
    </div>
  );
}
