import Navigation from "@/components/Navigation";
import Hero from "@/components/Hero";
import Stats from "@/components/Stats";
import Testimonials from "@/components/Testimonials";
import Locations from "@/components/Locations";
import Gallery from "@/components/Gallery";
import Investment from "@/components/Investment";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main>
        <Hero />
        <Stats />
        <Testimonials />
        <Locations />
        <Gallery />
        <Investment />
      </main>
      <Footer />
    </div>
  );
}
