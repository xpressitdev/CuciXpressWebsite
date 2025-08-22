
import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Lock, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PaymentCheckoutProps {
  selectedService?: {
    name: string;
    price: string;
    duration: string;
    features: string[];
  };
  onBack?: () => void;
}

export default function PaymentCheckout({ selectedService, onBack }: PaymentCheckoutProps) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [formData, setFormData] = useState({
    carPlate: "",
    phone: "",
    selectedBranch: ""
  });

  const branches = [
    { id: "tungku", name: "Tungku Link" },
    { id: "salar", name: "Salar" },
    { id: "bengkurong", name: "Bengkurong" },
    { id: "tutong", name: "Tutong" }
  ];


  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };


  const validateForm = () => {
    const required = ['carPlate', 'phone', 'selectedBranch'];
    return required.every(field => formData[field as keyof typeof formData]);
  };

  const handlePayment = async () => {
    if (!validateForm()) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
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
      
      // Extract numeric price from string like "BND 12"
      const numericPrice = parseFloat(selectedService?.price?.replace(/[^\d.]/g, '') || '0');
      
      const paymentData = {
        serviceName: selectedService?.name || 'Car Wash Service',
        amount: numericPrice,
        carPlate: formData.carPlate,
        phone: formData.phone,
        selectedBranch: formData.selectedBranch
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
            phone: formData.phone
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-orange-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center mb-8">
          {onBack && (
            <Button variant="ghost" onClick={onBack} className="mr-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
          <h1 className="text-3xl font-bold text-gray-900">Secure Checkout</h1>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
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
                {selectedService && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-lg">{selectedService.name}</h3>
                        <p className="text-gray-600">{selectedService.duration}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-cuci-primary">{selectedService.price}</p>
                      </div>
                    </div>
                    
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-2">Included Features:</h4>
                      <ul className="space-y-1">
                        {selectedService.features.map((feature, index) => (
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
                        <span className="text-cuci-primary">{selectedService.price}</span>
                      </div>
                    </div>
                  </div>
                )}

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
                {/* Customer Information */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Customer Information</h3>
                  
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
                    <Label htmlFor="selectedBranch">Select Branch *</Label>
                    <Select value={formData.selectedBranch} onValueChange={(value) => handleInputChange('selectedBranch', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose your preferred branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map((branch) => (
                          <SelectItem key={branch.id} value={branch.id}>
                            {branch.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    `Proceed to Payment (${selectedService?.price || 'BND 0'})`
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
    </div>
  );
}
