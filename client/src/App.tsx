import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import Home from "@/pages/home";
import Pricing from "@/pages/pricing";
import Subscriptions from "@/pages/subscriptions";
import Checkout from "@/pages/checkout";
import PrivacyPolicy from "@/pages/privacy-policy";
import TermsOfService from "@/pages/terms-of-service";
import Admin from "@/pages/admin";
import POS from "@/pages/pos";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentCancel from "@/pages/PaymentCancel";
import NotFound from "@/pages/not-found";

function Router() {
  const [location] = useLocation();

  useEffect(() => {
    // Scroll to top when location changes
    window.scrollTo(0, 0);
  }, [location]);

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/subscriptions" component={Subscriptions} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/terms-of-service" component={TermsOfService} />
      <Route path="/admin" component={Admin} />
      <Route path="/pos" component={POS} />
      <Route path="/payment-success" component={PaymentSuccess} />
      <Route path="/payment-cancel" component={PaymentCancel} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
