import { useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";

export default function Investment() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    investmentLevel: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const benefits = [
    {
      title: "Proven Business Model",
      description: "100,000+ cars served with consistent profitability",
      color: "bg-cuci-primary/10 text-cuci-primary",
    },
    {
      title: "Growing Market",
      description: "Increasing demand for premium car care services",
      color: "bg-cuci-secondary/10 text-cuci-secondary",
    },
    {
      title: "Technology Advantage",
      description: "Innovative queue system and operational efficiency",
      color: "bg-green-500/10 text-green-500",
    },
    {
      title: "Profit Sharing Model",
      description: "Transparent returns based on branch performance",
      color: "bg-blue-500/10 text-blue-500",
    },
  ];

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      await apiRequest("POST", "/api/investor-interest", formData);
      
      toast({
        title: "Success!",
        description: "Thank you for your interest! We will contact you within 48 hours.",
      });
      
      setFormData({
        name: "",
        email: "",
        phone: "",
        investmentLevel: "",
        message: "",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit form. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="invest" className="py-20 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Join Our Expansion Journey</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-6">
            We're expanding to 10 branches and looking for partners who believe in our vision. Be part of our profitable growth story.
          </p>
          <Link href="/pricing">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-cuci-secondary hover:bg-cuci-secondary-dark text-white px-6 py-3 rounded-full font-semibold transition-all shadow-lg"
            >
              View Our Subscription Plans
            </motion.button>
          </Link>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <div className="bg-gradient-to-br from-cuci-primary/5 to-cuci-secondary/5 p-8 rounded-2xl">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Why Invest in Cuci Xpress?</h3>
              <ul className="space-y-4">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-start">
                    <div className={`${benefit.color} p-2 rounded-full mr-4 mt-1`}>
                      <Check className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{benefit.title}</p>
                      <p className="text-gray-600 text-sm">{benefit.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Express Your Interest</h3>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => handleInputChange("name", e.target.value)}
                    placeholder="Enter your full name"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    placeholder="Enter your email"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleInputChange("phone", e.target.value)}
                    placeholder="Enter your phone number"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="investment-level">Investment Interest Level</Label>
                  <Select value={formData.investmentLevel} onValueChange={(value) => handleInputChange("investmentLevel", value)}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select your interest level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small Investment (BND 10K - 50K)</SelectItem>
                      <SelectItem value="medium">Medium Investment (BND 50K - 100K)</SelectItem>
                      <SelectItem value="large">Large Investment (BND 100K+)</SelectItem>
                      <SelectItem value="explore">Just Exploring Options</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="message">Additional Comments</Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => handleInputChange("message", e.target.value)}
                    placeholder="Tell us about your investment goals or any questions..."
                    rows={4}
                    className="mt-2"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-cuci-primary to-cuci-secondary hover:from-cuci-primary-dark hover:to-cuci-secondary-dark text-white px-8 py-4 rounded-lg text-lg font-semibold transition-all shadow-lg"
                >
                  {isSubmitting ? "Submitting..." : "Submit Interest"}
                </Button>
              </form>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-600 text-center">
                  <strong>Next Steps:</strong> We'll review your submission and contact you within 48 hours to discuss opportunities.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
