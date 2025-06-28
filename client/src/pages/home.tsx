import Navigation from "@/components/Navigation";
import Hero from "@/components/Hero";
import WhatsNew from "@/components/WhatsNew";
import NewPricing from "@/components/NewPricing";
import Membership from "@/components/Membership";
import Locations from "@/components/Locations";
import Testimonials from "@/components/Testimonials";
import Investment from "@/components/Investment";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main>
        <Hero />
        <WhatsNew />
        <NewPricing />
        <Membership />
        <Locations />
        <Testimonials />
        <Investment />
      </main>
      <Footer />
    </div>
  );
}
