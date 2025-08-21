import { motion } from "framer-motion";
import { XCircle, ArrowLeft, Phone, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";

export default function PaymentCancel() {
  const [, setLocation] = useLocation();

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
            <CardTitle className="text-2xl font-bold text-red-800">
              Payment Cancelled
            </CardTitle>
            <p className="text-gray-600">
              Your payment was cancelled. No charges have been made to your account.
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Information */}
            <div className="bg-amber-50 rounded-lg p-4">
              <h3 className="font-semibold text-amber-800 mb-2">
                Need Help?
              </h3>
              <p className="text-sm text-amber-700">
                If you experienced any issues during payment or need assistance, 
                please contact our support team or try again.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button 
                className="w-full bg-cuci-primary hover:bg-cuci-primary/90"
                onClick={() => {
                  const element = document.getElementById('pricing');
                  setLocation('/');
                  setTimeout(() => element?.scrollIntoView({ behavior: 'smooth' }), 100);
                }}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Try Payment Again
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

            {/* Contact Info */}
            <div className="text-center text-sm text-gray-500 pt-4 border-t">
              <p className="font-medium">Customer Support</p>
              <p>Phone: +673 838 7000</p>
              <p>Daily: 8:00 AM - 7:00 PM</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}