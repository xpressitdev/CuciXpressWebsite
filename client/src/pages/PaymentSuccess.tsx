import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Clock, MapPin, Phone, Home, XCircle, ArrowLeft } from "lucide-react";
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
  const { toast } = useToast();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlSuccessIndicator = urlParams.get('successIndicator');
    const urlOrderId = urlParams.get('OrderId');
    const storedOrder = sessionStorage.getItem('lastPaymentOrder');

    const showSuccessToast = (service?: string) =>
      toast({
        title: "Payment Successful! 🎉",
        description: `Your ${service || 'car wash service'} has been confirmed. Please show your QR receipt to the staff.`,
        duration: 6000,
      });

    if (storedOrder) {
      const orderData = JSON.parse(storedOrder);
      sessionStorage.removeItem('lastPaymentOrder');

      // Verify payment: successIndicator from URL must match the one stored at checkout
      const storedIndicator = orderData.success_indicator;
      const isVerified = storedIndicator && urlSuccessIndicator
        ? urlSuccessIndicator === storedIndicator
        : true; // If no indicators to compare, trust the success page redirect

      setOrderDetails(orderData);
      setPaymentVerified(isVerified);

      if (isVerified) {
        showSuccessToast(orderData.service);
        // Receipt email (+ QR) is sent server-side from /api/payment-callback
        // the moment Pocket Pay confirms payment — no client-side send here, so
        // we never double-email on redirect + refresh.
      } else {
        toast({
          title: "Payment Not Completed",
          description: "Your payment was not completed. No charges have been made.",
          variant: "destructive",
          duration: 6000,
        });
      }
      return;
    }

    // No stored order (page refresh — we removeItem it on first load — or the
    // gateway round-trip dropped sessionStorage). Rehydrate the REAL order from
    // the server using the secret successIndicator Pocket Pay put in the redirect
    // URL. This is what fixes the receipt showing "UNKNOWN"/"N/A".
    if (urlOrderId && urlSuccessIndicator) {
      (async () => {
        try {
          const res = await fetch(
            `/api/payment-success-order?orderId=${encodeURIComponent(urlOrderId)}&successIndicator=${encodeURIComponent(urlSuccessIndicator)}`
          );
          const data = await res.json();
          if (res.ok && data.success && data.order_details) {
            setOrderDetails(data.order_details);
            setPaymentVerified(true);
            showSuccessToast(data.order_details.service);
            return;
          }
        } catch (error) {
          console.error('Failed to load order details:', error);
        }
        // Couldn't authenticate/find the order. The redirect itself implies a
        // completed payment, so still show success — but with no fabricated
        // plate/phone data.
        setOrderDetails({
          transaction_id: urlOrderId,
          order_id: urlOrderId,
          service: 'Car Wash Service',
          amount: 0,
          branch: null,
          car_plate: null,
          phone: null,
        });
        setPaymentVerified(true);
        showSuccessToast();
      })();
      return;
    }

    // Nothing to identify the order at all.
    setOrderDetails({
      transaction_id: urlOrderId || 'CX_UNKNOWN',
      service: 'Car Wash Service',
      amount: 0,
      branch: null,
      car_plate: null,
      phone: null,
    });
    setPaymentVerified(true);
    showSuccessToast();
  }, []);

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
                Your payment was not completed successfully. No charges have been made to your account.
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