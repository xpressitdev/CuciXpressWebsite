import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import Home from "@/pages/home";
import GalleryPage from "@/pages/gallery";
import Partners from "@/pages/partners";
import QueuePage from "@/pages/queue";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import Pricing from "@/pages/pricing";
import Subscriptions from "@/pages/subscriptions";
import SubscriptionSuccess from "@/pages/subscription-success";
import AdminSubscriptionTest from "@/pages/admin-subscription-test";
import Checkout from "@/pages/checkout";
import PrivacyPolicy from "@/pages/privacy-policy";
import TermsOfService from "@/pages/terms-of-service";
import Admin from "@/pages/admin";
import AdminShiftPrint from "@/pages/admin-shift-print";
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
      <Route path="/gallery" component={GalleryPage} />
      <Route path="/partners" component={Partners} />
      <Route path="/queue" component={QueuePage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/subscriptions" component={Subscriptions} />
      <Route path="/subscription-success" component={SubscriptionSuccess} />
      <Route path="/admin/subscription-test" component={AdminSubscriptionTest} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/terms-of-service" component={TermsOfService} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/shifts/:id/print" component={AdminShiftPrint} />
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
