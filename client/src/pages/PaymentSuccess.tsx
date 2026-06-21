import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Clock, MapPin, Phone, Home, XCircle, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import PaymentReceipt from "@/components/PaymentReceipt";

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [paymentVerified, setPaymentVerified] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const { toast } = useToast();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlSuccessIndicator = urlParams.get('successIndicator');
    const urlOrderId = urlParams.get('OrderId');

    // The fast-path display cache is NOT proof of payment — the server is the
    // only source of truth. Clear it so a stale entry can never be trusted.
    sessionStorage.removeItem('lastPaymentOrder');

    const CANT_CONFIRM =
      "We couldn't confirm this payment. If money was deducted from your account, please contact support before driving in — do not assume the wash is paid.";
    const NOT_PAID =
      "This payment was not completed, so no charge was made to your account. Please try again, or contact support if you believe this is an error.";
    const STILL_PENDING =
      "We haven't received confirmation of your payment yet. If money was deducted, please contact support — don't drive in expecting service until it's confirmed.";

    const showSuccessToast = (service?: string) =>
      toast({
        title: "Payment Successful! 🎉",
        description: `Your ${service || 'car wash service'} has been confirmed. Please show your QR receipt to the staff.`,
        duration: 6000,
      });

    const showFailure = (message: string) => {
      setOrderDetails(null);
      setStatusMessage(message);
      setPaymentVerified(false);
    };

    // We can only confirm a payment if Pocket Pay handed us the order id + the
    // secret successIndicator in the redirect URL. Without them we MUST NOT
    // claim success.
    if (!urlOrderId || !urlSuccessIndicator) {
      showFailure(CANT_CONFIRM);
      return;
    }

    // Verify the REAL order status server-side before showing anything. Only a
    // status of 'paid' is a confirmed payment — a 'voided'/'refunded'/still
    // 'pending_payment' order must NOT show a success screen (value leakage).
    // We poll briefly because the browser redirect can beat Pocket Pay's
    // server-to-server callback that flips the order to 'paid'.
    const MAX_ATTEMPTS = 6;
    const DELAY_MS = 2000;
    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      const url = `/api/payment-success-order?orderId=${encodeURIComponent(urlOrderId)}&successIndicator=${encodeURIComponent(urlSuccessIndicator)}`;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !cancelled; attempt++) {
        try {
          const res = await fetch(url);
          // 404/400 = wrong/missing indicator or order not found: not retryable.
          if (res.status === 404 || res.status === 400) {
            showFailure(CANT_CONFIRM);
            return;
          }
          if (!res.ok) {
            // Transient server error — retry, then give up safely.
            if (attempt < MAX_ATTEMPTS) { await sleep(DELAY_MS); continue; }
            showFailure(CANT_CONFIRM);
            return;
          }
          const data = await res.json().catch(() => null);
          if (!data?.success || !data.order_details) {
            showFailure(CANT_CONFIRM);
            return;
          }

          const status = data.order_details.status;
          if (status === 'paid') {
            setOrderDetails(data.order_details);
            setStatusMessage('');
            setPaymentVerified(true);
            showSuccessToast(data.order_details.service);
            return;
          }
          if (status === 'pending_payment') {
            // Give the callback a moment to land before declaring it unpaid.
            if (attempt < MAX_ATTEMPTS) { await sleep(DELAY_MS); continue; }
            showFailure(STILL_PENDING);
            return;
          }
          // voided / refunded / cancelled / anything else = not a paid order.
          showFailure(NOT_PAID);
          return;
        } catch (error) {
          console.error('Failed to verify payment status:', error);
          if (attempt < MAX_ATTEMPTS) { await sleep(DELAY_MS); continue; }
          showFailure(CANT_CONFIRM);
          return;
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Verifying state — never flash the success screen before we know the real status.
  if (paymentVerified === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-cuci-primary animate-spin mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-800 mb-1">Confirming your payment…</h1>
          <p className="text-gray-600">Please wait while we verify your payment with the bank.</p>
        </div>
      </div>
    );
  }

  // Payment failed / not completed screen
  if (paymentVerified === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-rose-100 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="max-w-md w-full"
        >
          <Card className="shadow-xl border-0">
            <CardHeader className="text-center pb-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <XCircle className="w-10 h-10 text-red-600" />
              </motion.div>
              <CardTitle className="text-2xl font-bold text-red-800">Payment Not Completed</CardTitle>
              <p className="text-gray-600 mt-2">
                {statusMessage || "Your payment was not completed successfully. No charges have been made to your account."}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-amber-50 rounded-lg p-4">
                <p className="text-sm text-amber-700">
                  This can happen if the payment was cancelled, declined, or timed out. Please try again or contact support if you believe this is an error.
                </p>
              </div>
              <div className="space-y-3">
                <Button
                  className="w-full bg-cuci-primary hover:bg-cuci-primary/90"
                  onClick={() => {
                    setLocation('/');
                    setTimeout(() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }), 100);
                  }}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Try Payment Again
                </Button>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => window.open('tel:+6738387000')}>
                    <Phone className="w-4 h-4 mr-2" />
                    Call Support
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => setLocation('/')}>
                    <Home className="w-4 h-4 mr-2" />
                    Home
                  </Button>
                </div>
              </div>
              <div className="text-center text-sm text-gray-500 pt-2 border-t">
                <p className="font-medium">Customer Support</p>
                <p>Phone: +673 838 7000 • Daily: 8:00 AM – 7:00 PM</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Success Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8 pt-8"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"
          >
            <CheckCircle className="w-10 h-10 text-green-600" />
          </motion.div>
          <h1 className="text-3xl font-bold text-green-800 mb-2">Payment Successful!</h1>
          <p className="text-gray-600 text-lg">
            Thank you for being Xpress! Your {orderDetails?.service || 'car wash service'} has been confirmed.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Receipt Section */}
          <div>
            {orderDetails && <PaymentReceipt orderDetails={orderDetails} />}
          </div>

          {/* Additional Information */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Card className="shadow-lg border-0 mb-6">
              <CardHeader className="text-center pb-4">
                <CardTitle className="text-xl font-bold text-gray-800">
                  Your Booking Details
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Order Summary */}
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600">Transaction ID</span>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {orderDetails?.transaction_id || 'Loading...'}
                    </Badge>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600">Service</span>
                    <span className="text-sm font-semibold">
                      {orderDetails?.service || 'Car Wash Service'}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600">Amount</span>
                    <span className="text-sm font-bold text-green-600">
                      BND {orderDetails?.amount || '12'}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600">Branch</span>
                    <span className="text-sm font-semibold">
                      {orderDetails?.branch || 'Tungku Link'}
                    </span>
                  </div>
                </div>

                {/* Next Steps */}
                <div className="bg-blue-50 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-800 mb-2 flex items-center">
                    <Clock className="w-4 h-4 mr-2" />
                    What's Next?
                  </h3>
                  <ul className="text-sm text-blue-700 space-y-2">
                    <li className="flex items-start">
                      <span className="font-bold text-blue-600 mr-2">1.</span>
                      <span>Drive to your selected branch location</span>
                    </li>
                    <li className="flex items-start">
                      <span className="font-bold text-blue-600 mr-2">2.</span>
                      <span><strong>Show the QR code receipt</strong> to Cuci Xpress staff for verification</span>
                    </li>
                    <li className="flex items-start">
                      <span className="font-bold text-blue-600 mr-2">3.</span>
                      <span>Staff will scan your QR code and input your order into our POS system</span>
                    </li>
                    <li className="flex items-start">
                      <span className="font-bold text-blue-600 mr-2">4.</span>
                      <span>Enjoy your premium car wash service!</span>
                    </li>
                  </ul>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  <Button 
                    className="w-full bg-cuci-primary hover:bg-cuci-primary/90"
                    onClick={() => {
                      const element = document.getElementById('locations');
                      setLocation('/');
                      setTimeout(() => element?.scrollIntoView({ behavior: 'smooth' }), 100);
                    }}
                  >
                    <MapPin className="w-4 h-4 mr-2" />
                    View Branch Locations
                  </Button>
                  
                  <div className="flex gap-3">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => window.open('tel:+6738387000')}
                    >
                      <Phone className="w-4 h-4 mr-2" />
                      Call Support
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => setLocation('/')}
                    >
                      <Home className="w-4 h-4 mr-2" />
                      Back Home
                    </Button>
                  </div>
                </div>

                {/* Operating Hours */}
                <div className="text-center text-sm text-gray-500 pt-4 border-t">
                  <p className="font-medium">Operating Hours</p>
                  <p>Daily: 8:00 AM - 7:00 PM</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}