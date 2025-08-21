
import { useEffect, useState } from "react";
import PaymentCheckout from "@/components/PaymentCheckout";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

export default function Checkout() {
  const [selectedService, setSelectedService] = useState<any>(null);

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
    window.history.back();
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
