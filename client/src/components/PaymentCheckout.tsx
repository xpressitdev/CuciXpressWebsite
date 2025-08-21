
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
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    cardNumber: "",
    expiryMonth: "",
    expiryYear: "",
    cvv: "",
    selectedBranch: ""
  });

  const branches = [
    { id: "tungku", name: "Tungku Link" },
    { id: "salar", name: "Salar" },
    { id: "bengkurong", name: "Bengkurong" },
    { id: "tutong", name: "Tutong" }
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 15 }, (_, i) => currentYear + i); // Extended to 15 years to include 2035
  const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    const formatted = cleaned.replace(/(\d{4})(?=\d)/g, '$1 ');
    return formatted;
  };

  const handleCardNumberChange = (value: string) => {
    const formatted = formatCardNumber(value);
    if (formatted.replace(/\s/g, '').length <= 16) {
      handleInputChange('cardNumber', formatted);
    }
  };

  const validateForm = () => {
    const required = ['customerName', 'customerEmail', 'customerPhone', 'cardNumber', 'expiryMonth', 'expiryYear', 'cvv', 'selectedBranch'];
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
      // Extract numeric price from string like "BND 12"
      const numericPrice = parseFloat(selectedService?.price?.replace(/[^\d.]/g, '') || '0');
      
      const paymentData = {
        serviceName: selectedService?.name || 'Car Wash Service',
        amount: numericPrice,
        customerName: formData.customerName,
        customerEmail: formData.customerEmail,
        customerPhone: formData.customerPhone,
        cardNumber: formData.cardNumber.replace(/\s/g, ''),
        expiryMonth: formData.expiryMonth,
        expiryYear: formData.expiryYear,
        cvv: formData.cvv,
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

      if (result.success) {
        toast({
          title: "Payment Successful!",
          description: `Your ${selectedService?.name} booking has been confirmed.`,
        });
        
        // Redirect to success page or reset form
        setFormData({
          customerName: "",
          customerEmail: "",
          customerPhone: "",
          cardNumber: "",
          expiryMonth: "",
          expiryYear: "",
          cvv: "",
          selectedBranch: ""
        });
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

                {/* Test Environment Notice */}
                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Test Environment</h4>
                  <p className="text-sm text-blue-700 mb-2">
                    This is a test payment gateway. Use the following test card details:
                  </p>
                  <div className="text-sm text-blue-700 space-y-1">
                    <p><strong>Card Number:</strong> 4444 5555 6666 7777</p>
                    <p><strong>Expiry:</strong> Any future date</p>
                    <p><strong>CVV:</strong> Any 3-digit number</p>
                  </div>
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
                    <Label htmlFor="customerName">Full Name *</Label>
                    <Input
                      id="customerName"
                      value={formData.customerName}
                      onChange={(e) => handleInputChange('customerName', e.target.value)}
                      placeholder="Enter your full name"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="customerEmail">Email Address *</Label>
                    <Input
                      id="customerEmail"
                      type="email"
                      value={formData.customerEmail}
                      onChange={(e) => handleInputChange('customerEmail', e.target.value)}
                      placeholder="Enter your email"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="customerPhone">Phone Number *</Label>
                    <Input
                      id="customerPhone"
                      value={formData.customerPhone}
                      onChange={(e) => handleInputChange('customerPhone', e.target.value)}
                      placeholder="Enter your phone number"
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

                {/* Payment Information */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Payment Information</h3>
                  
                  <div>
                    <Label htmlFor="cardNumber">Card Number *</Label>
                    <Input
                      id="cardNumber"
                      value={formData.cardNumber}
                      onChange={(e) => handleCardNumberChange(e.target.value)}
                      placeholder="4444 5555 6666 7777"
                      maxLength={19}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="expiryMonth">Expiry Month *</Label>
                      <Select value={formData.expiryMonth} onValueChange={(value) => handleInputChange('expiryMonth', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="MM" />
                        </SelectTrigger>
                        <SelectContent>
                          {months.map((month) => (
                            <SelectItem key={month} value={month}>
                              {month}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="expiryYear">Expiry Year *</Label>
                      <Select value={formData.expiryYear} onValueChange={(value) => handleInputChange('expiryYear', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="YYYY" />
                        </SelectTrigger>
                        <SelectContent>
                          {years.map((year) => (
                            <SelectItem key={year} value={year.toString()}>
                              {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="cvv">CVV *</Label>
                    <Input
                      id="cvv"
                      value={formData.cvv}
                      onChange={(e) => handleInputChange('cvv', e.target.value.replace(/\D/g, ''))}
                      placeholder="123"
                      maxLength={3}
                      required
                    />
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
                      Processing Payment...
                    </div>
                  ) : (
                    `Pay ${selectedService?.price || 'Now'}`
                  )}
                </Button>

                <p className="text-xs text-gray-500 text-center">
                  Your payment information is secure and encrypted. We do not store your card details.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
