import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Clock, MapPin, Phone, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const [orderDetails, setOrderDetails] = useState<any>(null);

  useEffect(() => {
    // Get order details from URL params or session storage
    const urlParams = new URLSearchParams(window.location.search);
    const storedOrder = sessionStorage.getItem('lastPaymentOrder');
    
    if (storedOrder) {
      setOrderDetails(JSON.parse(storedOrder));
      sessionStorage.removeItem('lastPaymentOrder'); // Clean up
    } else {
      // Fallback order details from URL params
      setOrderDetails({
        transaction_id: urlParams.get('OrderId') || 'CX_UNKNOWN',
        service: 'Car Wash Service',
        amount: 12,
        branch: 'Tungku Link'
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
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
              className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <CheckCircle className="w-10 h-10 text-green-600" />
            </motion.div>
            <CardTitle className="text-2xl font-bold text-green-800">
              Payment Successful!
            </CardTitle>
            <p className="text-gray-600">
              Your {orderDetails?.service || 'car wash service'} booking has been confirmed.
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Order Details */}
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
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Drive to your selected branch</li>
                <li>• Show this confirmation at the service counter</li>
                <li>• Enjoy your car wash service!</li>
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
                  Home
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
  );
}