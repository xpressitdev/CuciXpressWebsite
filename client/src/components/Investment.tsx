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
    businessType: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const benefits = [
    {
      title: "Local Business Support",
      description: "Helping local entrepreneurs grow and succeed",
      color: "bg-cuci-primary/10 text-cuci-primary",
    },
    {
      title: "Community Partnership",
      description: "Building stronger local business networks",
      color: "bg-cuci-secondary/10 text-cuci-secondary",
    },
    {
      title: "Shared Resources",
      description: "Access to our proven systems and expertise",
      color: "bg-green-500/10 text-green-500",
    },
    {
      title: "Mutual Growth",
      description: "Growing together through strategic collaboration",
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
      await apiRequest("POST", "/api/collaboration-interest", formData);
      
      toast({
        title: "Success!",
        description: "Thank you for your interest in collaboration! We will contact you within 48 hours.",
      });
      
      setFormData({
        name: "",
        email: "",
        phone: "",
        businessType: "",
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
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Partner with Local Businesses</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-6">
            We believe in supporting local entrepreneurs and building stronger business communities. Let's explore collaboration opportunities together.
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              const element = document.getElementById('pricing');
              if (element) {
                element.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            className="bg-cuci-secondary hover:bg-cuci-secondary-dark text-white px-6 py-3 rounded-full font-semibold transition-all shadow-lg"
          >
            View Our Subscription Plans
          </motion.button>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <div className="bg-gradient-to-br from-cuci-primary/5 to-cuci-secondary/5 p-8 rounded-2xl">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Why Collaborate with Us?</h3>
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
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Let's Collaborate</h3>
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
                  <Label htmlFor="business-type">Business Type</Label>
                  <Select value={formData.businessType} onValueChange={(value) => handleInputChange("businessType", value)}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select your business type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="retail">Retail Business</SelectItem>
                      <SelectItem value="food">Food & Beverage</SelectItem>
                      <SelectItem value="automotive">Automotive Services</SelectItem>
                      <SelectItem value="tech">Technology</SelectItem>
                      <SelectItem value="service">Service Provider</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="message">Collaboration Ideas</Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => handleInputChange("message", e.target.value)}
                    placeholder="Tell us about your business and how we might collaborate..."
                    rows={4}
                    className="mt-2"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-cuci-primary to-cuci-secondary hover:from-cuci-primary-dark hover:to-cuci-secondary-dark text-white px-8 py-4 rounded-lg text-lg font-semibold transition-all shadow-lg"
                >
                  {isSubmitting ? "Submitting..." : "Send Collaboration Request"}
                </Button>
              </form>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-600 text-center">
                  <strong>Next Steps:</strong> We'll review your request and contact you within 48 hours to discuss collaboration opportunities.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
