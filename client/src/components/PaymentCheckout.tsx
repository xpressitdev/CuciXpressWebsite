
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Lock, ArrowLeft, History, CheckCircle, Phone, Mail, KeyRound, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth, type User as AuthUser } from "@/hooks/useAuth";

const OTP_REASON_TEXT: Record<string, string> = {
  invalid_request: "That number doesn't look right. Please try again.",
  invalid_purpose: "Sign-in is temporarily unavailable.",
  invalid_identifier: "That phone number is invalid.",
  no_active_code: "No active code. Please request a new one.",
  expired: "That code has expired. Please request a new one.",
  too_many_attempts: "Too many wrong tries. Request a new code.",
  wrong_code: "That code is incorrect.",
  server_error: "Something went wrong on our side. Please retry.",
};

interface PaymentCheckoutProps {
  selectedService?: {
    name: string;
    price: string;
    duration: string;
    features: string[];
  };
  onBack?: () => void;
  /** Pre-selected car plate (from /checkout?plate=…) — set when the customer
   *  taps "Pay & Queue Now" on a specific vehicle in their garage. */
  initialPlate?: string;
}

// Minimal shape of GET /api/customer/cars rows used by the plate picker.
interface GarageCar {
  id: number;
  license_plate: string;
  brand?: string | null;
  model?: string | null;
}

// Same normalisation as the server: uppercase, strip spaces/dashes — so
// "BAS 24" from the profile still matches the "BAS24" garage row.
const normPlate = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, "");

// Single source of truth for the wash packages offered at checkout.
// Mirrors the cards on the landing page (ServicePricing.tsx) so prices
// stay aligned across the site.
const PACKAGES = [
  {
    id: "basic",
    name: "Basic Wash",
    price: 8,
    duration: "8 minutes",
    tagline: "Quick exterior clean",
    features: [
      "Exterior foam wash",
      "High-pressure rinse",
      "Basic drying",
      "Drive-thru convenience",
    ],
    popular: false,
  },
  {
    id: "full",
    name: "Full Package",
    price: 12,
    duration: "12 minutes",
    tagline: "Complete care + wax",
    features: [
      "Everything in Basic Wash",
      "Spray wax",
      "Tyre shine",
      "Wheel cleaning",
    ],
    popular: true,
  },
] as const;

type PackageId = (typeof PACKAGES)[number]["id"];

export default function PaymentCheckout({ selectedService, onBack, initialPlate }: PaymentCheckoutProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, logout, isLoading, checkAuthStatus } = useAuth();

  const [isProcessing, setIsProcessing] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  // Picked package — defaults to whatever the caller suggested via
  // `selectedService` (matched by name), else Full Package as the
  // recommended option. Customer can switch in the picker any time.
  const initialPackageId: PackageId =
    PACKAGES.find((p) => p.name === selectedService?.name)?.id ?? "full";
  const [packageId, setPackageId] = useState<PackageId>(initialPackageId);
  const pkg = PACKAGES.find((p) => p.id === packageId)!;
  // Email-OTP sign-in state — same flow as /login's Sign In tab: the
  // customer enters their phone OR email, the server emails a 6-digit
  // code to the account's registered email address. Inline in the
  // checkout modal so the customer never has to leave this page.
  const [otpStep, setOtpStep] = useState<'identifier' | 'code'>('identifier');
  const [otpId, setOtpId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [formData, setFormData] = useState({
    // Seed with the plate the customer picked in their garage (if any) so
    // "Pay & Queue Now" on a specific car always pays for THAT car.
    carPlate: initialPlate?.trim().toUpperCase() ?? "",
    phone: "",
    email: ""
  });

  // Signed-in customers: load their garage so they can pick which car this
  // wash is for (multi-car households). Guests type the plate manually.
  const { data: garage } = useQuery<{ cars: GarageCar[] }>({
    queryKey: ["/api/customer/cars"],
    enabled: isAuthenticated,
  });
  const myCars = garage?.cars ?? [];

  // Auto-fill customer data if user is logged in. The plate keeps whatever
  // is already chosen (URL param or a picker tap) — the profile default only
  // fills in when nothing was pre-selected.
  useEffect(() => {
    if (user) {
      const profile = user.profile_data && typeof user.profile_data === 'object' ? user.profile_data as any : {};
      setFormData(prev => ({
        ...prev,
        carPlate: prev.carPlate || profile.carPlate || "",
        phone: profile.phone || prev.phone,
        email: user.email || prev.email
      }));
    }
  }, [user]);

  // If nothing pre-selected a plate (no URL param, no profile default),
  // fall back to the first car in the garage so the picker always has a
  // sensible selection.
  useEffect(() => {
    if (isAuthenticated && myCars.length > 0) {
      setFormData(prev =>
        prev.carPlate ? prev : { ...prev, carPlate: myCars[0].license_plate },
      );
    }
  }, [isAuthenticated, myCars]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Email-OTP — same endpoints as /login.tsx's Sign In tab. Mints the same
  // Lucia cx_session cookie, so after a successful verify the rest of
  // the checkout works identically to a customer who arrived from
  // /dashboard already logged in. The server accepts a phone OR email
  // identifier and always emails the code to the account's registered
  // email address (there is no WhatsApp/SMS delivery).
  const sendOtp = async () => {
    if (!otpId.trim()) return;
    setOtpBusy(true);
    try {
      const res = await fetch('/api/auth/customer/signin/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ identifier: otpId.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast({
          title: 'Could not send code',
          description: OTP_REASON_TEXT[data.reason] ?? 'Please try again.',
          variant: 'destructive',
        });
        return;
      }
      // Server always answers 200 whether or not an account exists (no
      // account enumeration), so show a generic message.
      toast({
        title: 'Code sent',
        description: "If an account exists for those details, we've emailed a 6-digit code.",
      });
      setOtpStep('code');
    } finally {
      setOtpBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(otpCode)) {
      toast({ title: 'Enter the 6-digit code', variant: 'destructive' });
      return;
    }
    setOtpBusy(true);
    try {
      const res = await fetch('/api/auth/customer/signin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ identifier: otpId.trim(), code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast({
          title: 'Could not sign in',
          description: OTP_REASON_TEXT[data.reason] ?? 'Please try again.',
          variant: 'destructive',
        });
        return;
      }
      // Refresh BOTH auth sources so every part of the app agrees:
      // the local useAuth hook (this form) and the shared whoami query
      // (page chrome, dashboard, navbar).
      await checkAuthStatus();
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/whoami'] });
      await queryClient.refetchQueries({ queryKey: ['/api/auth/whoami'] });
      setShowAuth(false);
      setOtpStep('identifier');
      setOtpCode('');
      toast({ title: 'Welcome back!', description: "You're signed in." });
    } finally {
      setOtpBusy(false);
    }
  };

  // Logout must sign the customer out EVERYWHERE, not just on this form.
  // The dashboard/AppShell/navbar all read the shared '/api/auth/whoami'
  // query, so after the server kills the session we refresh that cache
  // too — otherwise the dashboard keeps showing a logged-in state.
  const handleLogout = async () => {
    await logout();
    queryClient.removeQueries({ queryKey: ['/api/customer/cars'] });
    await queryClient.invalidateQueries({ queryKey: ['/api/auth/whoami'] });
    await queryClient.refetchQueries({ queryKey: ['/api/auth/whoami'] });
    toast({ title: 'Signed out', description: 'You have been logged out.' });
  };


  // Email is required — after Pocket Pay confirms the payment we email the
  // receipt + scannable QR to this address (the order is also linked to the
  // customer's dashboard, activity and car-plate history).
  const validateForm = () => {
    const required = ['carPlate', 'phone', 'email'];
    const allPresent = required.every(field => formData[field as keyof typeof formData]);
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim());
    return allPresent && emailValid;
  };

  const handlePayment = async () => {
    if (!validateForm()) {
      toast({
        title: "Missing Information",
        description: "Please fill in your car plate, phone number, and a valid email address.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);

    try {
      // First, save customer information
      try {
        await fetch('/api/save-customer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            carPlate: formData.carPlate,
            phone: formData.phone
          }),
        });
      } catch (customerError) {
        console.warn('Failed to save customer info:', customerError);
        // Continue with payment even if customer save fails
      }
      
      const paymentData = {
        serviceName: pkg.name,
        amount: pkg.price,
        carPlate: formData.carPlate,
        phone: formData.phone,
        email: formData.email.trim(),
      };

      const response = await fetch('/api/process-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(paymentData),
      });

      const result = await response.json();

      if (result.success && result.redirect_url) {
        // Store order details for success page (including customer email for confirmation)
        if (result.order_details) {
          const orderDetailsWithCustomer = {
            ...result.order_details,
            car_plate: formData.carPlate,
            phone: formData.phone,
            customer_email: formData.email || undefined
          };
          sessionStorage.setItem('lastPaymentOrder', JSON.stringify(orderDetailsWithCustomer));
        }
        
        // Redirect to Pocket Pay for payment
        window.location.href = result.redirect_url;
      } else {
        throw new Error(result.message || 'Payment failed');
      }
    } catch (error) {
      toast({
        title: "Payment Failed",
        description: error instanceof Error ? error.message : "Something went wrong. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-orange-50 py-5 sm:py-8 checkout-grid-wrap">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center mb-5 sm:mb-8">
          {onBack && (
            <Button variant="ghost" onClick={onBack} className="mr-2 sm:mr-4 px-2 sm:px-4">
              <ArrowLeft className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Back</span>
            </Button>
          )}
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Secure Checkout</h1>
        </div>

        <div className="checkout-grid">
          {/* Order Summary */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  Order Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Package picker — radio cards. Customer can switch
                    between Basic Wash and Full Package without leaving
                    the checkout. */}
                <div className="space-y-2 mb-4">
                  <h4 className="font-medium text-sm text-gray-700">Choose your wash</h4>
                  {PACKAGES.map((p) => {
                    const isSelected = p.id === packageId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPackageId(p.id)}
                        data-testid={`button-pick-pkg-${p.id}`}
                        className={
                          "w-full text-left rounded-lg border-2 p-3 transition-all relative " +
                          (isSelected
                            ? "border-cuci-primary bg-cuci-primary/5 ring-2 ring-cuci-primary/20"
                            : "border-gray-200 hover:border-gray-300 bg-white")
                        }
                      >
                        {p.popular && (
                          <Badge className="absolute -top-2 right-3 bg-cuci-primary text-white text-[10px] px-2 py-0">
                            Most popular
                          </Badge>
                        )}
                        <div className="flex justify-between items-start gap-3">
                          <div className="min-w-0">
                            <p className="font-bold text-gray-900">{p.name}</p>
                            <p className="text-xs text-gray-500">{p.tagline} · {p.duration}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={"text-xl font-bold " + (isSelected ? "text-cuci-primary" : "text-gray-700")}>
                              BND {p.price}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="border-t pt-4 space-y-4">
                  <div>
                    <h4 className="font-medium mb-2 text-sm">What's included:</h4>
                    <ul className="space-y-1">
                      {pkg.features.map((feature, index) => (
                        <li key={index} className="text-sm text-gray-600 flex items-start">
                          <div className="w-2 h-2 rounded-full bg-green-500 mr-2 mt-2 flex-shrink-0"></div>
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between text-lg font-semibold">
                      <span>Total Amount:</span>
                      <span className="text-cuci-primary" data-testid="text-total-amount">
                        BND {pkg.price}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Security Notice */}
                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <h4 className="font-medium text-green-900 mb-2">🔒 Secure Payment</h4>
                  <p className="text-sm text-green-700">
                    Your payment is processed securely through Pocket Pay. All transactions are live and will be processed and charged to your selected payment method.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Payment Form */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="w-5 h-5" />
                  Payment Details
                </CardTitle>
                <Badge variant="secondary" className="w-fit">
                  256-bit SSL Encrypted
                </Badge>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* User Authentication Section */}
                {!isAuthenticated && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">Customer Account</h3>
                      <Badge variant="outline" className="text-xs">Optional</Badge>
                    </div>
                    
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="flex items-start gap-3">
                        <History className="w-5 h-5 text-amber-600 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-amber-900 mb-1">Sign in for faster checkout</h4>
                          <p className="text-sm text-amber-700 mb-3">
                            Enter your phone or email and we'll email you a one-time code. Your car &amp; details auto-fill, and your washes are saved in your dashboard.
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // Start each sign-in attempt fresh.
                              setOtpStep('identifier');
                              setOtpCode('');
                              setShowAuth(true);
                            }}
                            className="bg-white hover:bg-amber-50"
                            data-testid="button-open-signin"
                          >
                            <Mail className="w-4 h-4 mr-2" />
                            Sign in
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {isAuthenticated && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <h3 className="font-semibold whitespace-nowrap">Welcome back!</h3>
                      <div className="flex items-center gap-2 min-w-0 max-w-full">
                        <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                        <span className="text-sm text-green-600 truncate min-w-0">{user?.email || user?.username}</span>
                        <button 
                          onClick={handleLogout}
                          className="text-xs text-gray-500 hover:text-gray-700 underline shrink-0"
                          data-testid="button-logout"
                        >
                          Logout
                        </button>
                      </div>
                    </div>
                    
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm text-green-700">
                        Your car details have been automatically filled from your profile. You can edit them below if needed.
                      </p>
                    </div>
                  </div>
                )}

                {/* Customer Information */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Customer Information</h3>
                    {isAuthenticated && (
                      <a
                        href="/dashboard"
                        className="text-xs text-cuci-primary hover:underline"
                        data-testid="link-edit-profile"
                      >
                        Edit in dashboard →
                      </a>
                    )}
                  </div>

                  {isAuthenticated ? (
                    // Logged-in view: locked read-only rows so the user can't
                    // accidentally overwrite their saved profile from this page.
                    <div className="rounded-lg border border-gray-200 bg-gray-50 divide-y divide-gray-200">
                      {myCars.length > 1 ? (
                        // Multi-car household: let the customer pick which of
                        // their cars this wash is for.
                        <div className="px-3 py-2.5">
                          <p className="text-xs text-gray-500 mb-2">Which car is this wash for?</p>
                          <div className="flex flex-wrap gap-2">
                            {myCars.map((c) => {
                              const selected = normPlate(c.license_plate) === normPlate(formData.carPlate);
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => handleInputChange('carPlate', c.license_plate)}
                                  className={
                                    "px-3 py-1.5 rounded-lg border text-sm font-mono font-bold transition " +
                                    (selected
                                      ? "bg-gray-900 text-white border-gray-900"
                                      : "bg-white text-gray-700 border-gray-300 hover:border-gray-500")
                                  }
                                  data-testid={`button-pick-plate-${c.id}`}
                                  aria-pressed={selected}
                                >
                                  {c.license_plate}
                                  {(c.brand || c.model) && (
                                    <span className={"ml-1.5 font-sans font-normal text-xs " + (selected ? "text-gray-300" : "text-gray-400")}>
                                      {[c.brand, c.model].filter(Boolean).join(" ")}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                          <span className="text-xs text-gray-500 shrink-0">Car plate</span>
                          <span className="font-mono font-bold text-gray-900 text-right" data-testid="text-locked-plate">
                            {formData.carPlate || <span className="text-amber-600 text-xs font-sans">Not set — add in dashboard</span>}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <span className="text-xs text-gray-500 shrink-0">Phone</span>
                        <span className="text-gray-900 text-right" data-testid="text-locked-phone">
                          {formData.phone || <span className="text-amber-600 text-xs">Not set</span>}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <span className="text-xs text-gray-500 shrink-0">Email</span>
                        <span className="text-gray-900 text-sm text-right break-all min-w-0" data-testid="text-locked-email">
                          {formData.email || <span className="text-amber-600 text-xs">Not set — add in your dashboard</span>}
                        </span>
                      </div>
                    </div>
                  ) : (
                    // Guest view: still editable so walk-in customers can pay
                    // without signing in.
                    <>
                      <div>
                        <Label htmlFor="carPlate">Car Plate Number *</Label>
                        <Input
                          id="carPlate"
                          value={formData.carPlate}
                          onChange={(e) => handleInputChange('carPlate', e.target.value.toUpperCase())}
                          placeholder="BB1234"
                          required
                        />
                      </div>

                      <div>
                        <Label htmlFor="phone">Phone Number *</Label>
                        <Input
                          id="phone"
                          value={formData.phone}
                          onChange={(e) => handleInputChange('phone', e.target.value)}
                          placeholder="673 7654321"
                          required
                        />
                      </div>

                      <div>
                        <Label htmlFor="email">Email Address *</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => handleInputChange('email', e.target.value)}
                          placeholder="your@email.com"
                          required
                        />
                        <p className="text-xs text-gray-500 mt-1">We'll email your receipt and QR code to this address once payment is confirmed.</p>
                      </div>
                    </>
                  )}

                  {/* Branch picker removed (2026-05-06): customers
                      buy from anywhere and the wash gets allocated to
                      whichever Cuci Xpress lane scans the QR. */}
                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900">
                    <p className="font-medium mb-1">No branch needed</p>
                    <p className="text-blue-800 text-xs leading-relaxed">
                      Drive into any Cuci Xpress branch — Tungku Link, Salar,
                      Bengkurong or Tutong. The lane that scans your QR adds
                      you to its queue automatically.
                    </p>
                  </div>
                </div>

                {/* Payment Notice */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Payment Information</h3>
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">💳 Secure Payment Processing</h4>
                    <p className="text-sm text-blue-700">
                      After clicking "Proceed to Payment", you'll be redirected to our secure Pocket Pay gateway where you can safely enter your card details.
                    </p>
                  </div>
                </div>

                {/* Payment Button */}
                <Button
                  onClick={handlePayment}
                  disabled={isProcessing || !validateForm()}
                  className="w-full bg-cuci-primary hover:bg-cuci-primary/90 text-white py-3 text-lg"
                  size="lg"
                >
                  {isProcessing ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Creating Payment Link...
                    </div>
                  ) : (
                    `Proceed to Payment (BND ${pkg.price})`
                  )}
                </Button>

                <p className="text-xs text-gray-500 text-center">
                  You'll enter your card details securely on the next page through Pocket Pay.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* Authentication Modal */}
      <AnimatePresence>
        {showAuth && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowAuth(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md"
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="w-5 h-5" />
                    {otpStep === 'identifier' ? 'Sign in' : 'Enter your code'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {otpStep === 'identifier' ? (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor="otp-identifier" className="flex items-center gap-1">
                          <Phone className="w-3 h-3" /> Phone or Email
                        </Label>
                        <Input
                          id="otp-identifier"
                          value={otpId}
                          onChange={(e) => setOtpId(e.target.value)}
                          placeholder="+673 7XX XXXX  or  you@example.com"
                          autoFocus
                          data-testid="input-checkout-identifier"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button type="button" variant="outline" onClick={() => setShowAuth(false)} className="flex-1">
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          onClick={sendOtp}
                          disabled={otpBusy || !otpId.trim()}
                          className="flex-1 bg-cuci-primary hover:bg-cuci-primary/90 text-white"
                          data-testid="button-checkout-send-code"
                        >
                          {otpBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Email me a 6-digit code →'}
                        </Button>
                      </div>
                      <p className="text-[11px] text-gray-400 text-center">
                        We'll email a one-time code to your registered email address. No password to remember.
                      </p>
                      <p className="text-xs text-gray-500 text-center">
                        New here? No account needed — just fill in your details below and pay as a guest, or{' '}
                        <a href="/login" className="font-bold text-cuci-primary hover:underline">register</a>.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="rounded-lg bg-cuci-primary/5 border border-cuci-primary/20 p-3 text-center">
                        <p className="text-sm text-gray-700">
                          Code sent to{' '}
                          <span className="font-bold text-cuci-primary">your email</span>
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="otp-code" className="flex items-center gap-1">
                          <KeyRound className="w-3 h-3" /> 6-digit code
                        </Label>
                        <Input
                          id="otp-code"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="••••••"
                          inputMode="numeric"
                          autoFocus
                          className="tracking-[0.6em] text-center text-2xl font-mono py-6"
                          data-testid="input-checkout-code"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => { setOtpStep('identifier'); setOtpCode(''); }}
                          className="flex-1"
                        >
                          ← Back
                        </Button>
                        <Button
                          type="button"
                          onClick={verifyOtp}
                          disabled={otpBusy || otpCode.length !== 6}
                          className="flex-1 bg-cuci-primary hover:bg-cuci-primary/90 text-white"
                          data-testid="button-checkout-verify"
                        >
                          {otpBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & continue'}
                        </Button>
                      </div>

                      {import.meta.env.DEV && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const r = await fetch(`/api/dev/last-otp?phone=${encodeURIComponent(otpId.trim().replace(/\s+/g, ''))}`);
                              const d = await r.json();
                              if (d.ok && /^\d{6}$/.test(d.code)) {
                                setOtpCode(d.code);
                                toast({ title: 'Dev code filled', description: `Code: ${d.code}` });
                              } else {
                                toast({ title: 'No dev code yet', variant: 'destructive' });
                              }
                            } catch {
                              toast({ title: 'Could not read dev code', variant: 'destructive' });
                            }
                          }}
                          className="w-full text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded-md py-2 hover:bg-amber-100"
                        >
                          🔧 Dev only: reveal &amp; auto-fill the OTP
                        </button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
