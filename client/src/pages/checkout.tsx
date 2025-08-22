
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import PaymentCheckout from "@/components/PaymentCheckout";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

export default function Checkout() {
  const [selectedService, setSelectedService] = useState<any>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Get service data from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const serviceParam = urlParams.get('service');
    
    if (serviceParam) {
      try {
        const serviceData = JSON.parse(decodeURIComponent(serviceParam));
        setSelectedService(serviceData);
      } catch (error) {
        console.error('Error parsing service data:', error);
      }
    }
  }, []);

  const handleBack = () => {
    // Navigate back to home page and scroll to pricing section
    setLocation('/');
    setTimeout(() => {
      const pricingElement = document.getElementById('service-pricing');
      if (pricingElement) {
        pricingElement.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <main className="pt-16">
        <PaymentCheckout 
          selectedService={selectedService}
          onBack={handleBack}
        />
      </main>
      <Footer />
    </div>
  );
}
