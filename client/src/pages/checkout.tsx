
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import PaymentCheckout from "@/components/PaymentCheckout";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { AppShell } from "@/components/dashboard/AppShell";
import type { Whoami } from "@/components/dashboard/types";

export default function Checkout() {
  const [selectedService, setSelectedService] = useState<any>(null);
  const [, setLocation] = useLocation();

  // Which car to pay for — set when the customer taps "Pay & Queue Now" on a
  // specific vehicle card in their garage (/checkout?plate=BAS24). Parsed
  // synchronously so PaymentCheckout gets it on first render.
  const [plateParam] = useState(
    () => new URLSearchParams(window.location.search).get("plate") ?? "",
  );

  // Same query key as AppShell + dashboard → served from cache when the
  // user came from /dashboard, so no flicker.
  const { data: who, isLoading: whoLoading } = useQuery<Whoami>({
    queryKey: ["/api/auth/whoami"],
  });

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const serviceParam = urlParams.get('service');
    if (serviceParam) {
      try {
        setSelectedService(JSON.parse(decodeURIComponent(serviceParam)));
      } catch (error) {
        console.error('Error parsing service data:', error);
      }
    }
  }, []);

  // Signed-in users → "Back" returns to dashboard overview.
  // Guests/walk-ins → "Back" goes to landing page pricing section.
  const handleBack = () => {
    if (who?.authenticated) {
      setLocation('/dashboard');
      return;
    }
    setLocation('/');
    setTimeout(() => {
      document.getElementById('service-pricing')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  if (whoLoading) {
    return (
      <div className="min-h-screen bg-gray-50 grid place-items-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  // Signed-in: render inside dashboard shell (sidebar visible, no marketing
  // navbar/footer). Signed-out: keep the public landing chrome so walk-in
  // customers still see CuciXpress branding.
  if (who?.authenticated) {
    return (
      <AppShell activeTab={null}>
        <PaymentCheckout selectedService={selectedService} onBack={handleBack} initialPlate={plateParam} />
      </AppShell>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <main className="pt-16">
        <PaymentCheckout selectedService={selectedService} onBack={handleBack} initialPlate={plateParam} />
      </main>
      <Footer />
    </div>
  );
}
