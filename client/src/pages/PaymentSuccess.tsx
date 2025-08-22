import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Clock, MapPin, Phone, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import PaymentReceipt from "@/components/PaymentReceipt";

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const [orderDetails, setOrderDetails] = useState<any>(null);

  useEffect(() => {
    // Get order details from URL params or session storage
    const urlParams = new URLSearchParams(window.location.search);
    const storedOrder = sessionStorage.getItem('lastPaymentOrder');
    
    if (storedOrder) {
      const orderData = JSON.parse(storedOrder);
      setOrderDetails(orderData);
      sessionStorage.removeItem('lastPaymentOrder'); // Clean up
      
      // Send confirmation email
      sendConfirmationEmail(orderData);
    } else {
      // Fallback order details from URL params
      const fallbackOrder = {
        transaction_id: urlParams.get('OrderId') || 'CX_UNKNOWN',
        service: 'Car Wash Service',
        amount: 12,
        branch: 'Tungku Link',
        customer_email: 'customer@example.com' // This would come from the actual order
      };
      setOrderDetails(fallbackOrder);
      
      // Send confirmation email for fallback too
      sendConfirmationEmail(fallbackOrder);
    }
  }, []);

  const sendConfirmationEmail = async (orderData: any) => {
    try {
      if (!orderData.customer_email) {
        console.log('No customer email found - skipping confirmation email');
        return;
      }

      const response = await fetch('/api/send-payment-confirmation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerEmail: orderData.customer_email,
          transactionId: orderData.transaction_id,
          orderId: orderData.order_id || orderData.transaction_id,
          service: orderData.service,
          amount: orderData.amount,
          branch: orderData.branch,
          customerName: orderData.customer_name || 'Valued Customer'
        })
      });

      const result = await response.json();
      if (result.success) {
        console.log('Confirmation email sent successfully');
      } else {
        console.error('Failed to send confirmation email:', result.message);
      }
    } catch (error) {
      console.error('Error sending confirmation email:', error);
    }
  };

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