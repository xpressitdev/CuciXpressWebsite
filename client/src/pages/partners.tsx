import { useState } from "react";
import { motion } from "framer-motion";
import { Check, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import washTunnel from "@assets/20220928_2008581_1751160753598.jpg";
import nightView from "@assets/20241007_182239_1751160790928.jpg";
import dualWash from "@assets/IMG-20220108-WA0042_1751160949648.jpg";
import brandBanner from "../assets/gallery-8.jpg";

export default function Partners() {
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
      accent: "#6C5CE7",
    },
    {
      title: "Community Partnership",
      description: "Building stronger local business networks",
      accent: "#FFA500",
    },
    {
      title: "Shared Resources",
      description: "Access to our proven systems and expertise",
      accent: "#22C55E",
    },
    {
      title: "Mutual Growth",
      description: "Growing together through strategic collaboration",
      accent: "#3B82F6",
    },
  ];

  const proofImages = [
    {
      src: washTunnel,
      alt: "Automated car wash tunnel with brushes and spray equipment",
    },
    {
      src: dualWash,
      alt: "Two cars being washed simultaneously in automated wash bays",
    },
    {
      src: nightView,
      alt: "Cuci Xpress branch operating at night with cars entering the wash bay",
    },
    {
      src: brandBanner,
      alt: "Cuci Xpress branded drive-thru car wash promotional banner",
    },
  ];

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
        description:
          "Thank you for your interest in collaboration! We will contact you within 48 hours.",
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
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="pt-16">
        {/* Hero / intro */}
        <section className="py-20 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
                Partner with Local Businesses
              </h1>
              <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-4">
                We believe in supporting local entrepreneurs and building
                stronger business communities. Let's explore collaboration
                opportunities together.
              </p>
              <p className="text-base text-gray-500 max-w-2xl mx-auto">
                For business owners and entrepreneurs looking to collaborate with
                Cuci Xpress.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Why Collaborate with Us */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold text-gray-900 mb-10 text-center"
            >
              Why Collaborate with Us?
            </motion.h2>

            <div className="grid sm:grid-cols-2 gap-6">
              {benefits.map((benefit, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  whileHover={{ scale: 1.02, x: 5 }}
                  className="flex items-start p-5 bg-white rounded-md border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.9)]"
                >
                  <div
                    className="p-2 rounded-full mr-4 mt-1 border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,0.9)]"
                    style={{ backgroundColor: benefit.accent }}
                  >
                    <Check className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="font-black text-black text-lg">
                      {benefit.title}
                    </p>
                    <p className="text-gray-700 text-sm font-bold">
                      {benefit.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Proof strip — operations & systems photos */}
        <section className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="text-center mb-10"
            >
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
                Proven Systems & Expertise
              </h2>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto">
                Our automated wash technology and operations across five branches
                are ready to support the right partnerships.
              </p>
            </motion.div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {proofImages.map((image, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  whileHover={{ scale: 1.02 }}
                >
                  <img
                    src={image.src}
                    alt={image.alt}
                    className="w-full h-48 md:h-56 object-cover rounded-2xl shadow-lg"
                  />
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Collaboration form */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <div className="bg-white p-8 rounded-xl border-3 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,0.9)]">
                <h2 className="text-2xl font-black text-black mb-6">
                  Let's Collaborate
                </h2>
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
                      onChange={(e) =>
                        handleInputChange("email", e.target.value)
                      }
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
                      onChange={(e) =>
                        handleInputChange("phone", e.target.value)
                      }
                      placeholder="Enter your phone number"
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="business-type">Business Type</Label>
                    <Select
                      value={formData.businessType}
                      onValueChange={(value) =>
                        handleInputChange("businessType", value)
                      }
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Select your business type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="retail">Retail Business</SelectItem>
                        <SelectItem value="food">Food & Beverage</SelectItem>
                        <SelectItem value="automotive">
                          Automotive Services
                        </SelectItem>
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
                      onChange={(e) =>
                        handleInputChange("message", e.target.value)
                      }
                      placeholder="Tell us about your business and how we might collaborate..."
                      rows={4}
                      className="mt-2"
                    />
                  </div>

                  <motion.button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-cuci-primary text-white px-8 py-4 rounded-lg text-lg font-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.9)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,0.9)] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,0.9)] transition-all duration-200"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {isSubmitting
                      ? "Submitting..."
                      : "Send Collaboration Request →"}
                  </motion.button>
                </form>

                <div className="mt-6 pt-6 border-t border-gray-200">
                  <p className="text-sm text-gray-600 text-center">
                    <strong>Next Steps:</strong> We'll review your request and
                    contact you within 48 hours to discuss collaboration
                    opportunities.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Closing — point customers back to the main site */}
        <section className="py-12 bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-gray-600 mb-4">
              Just here for a car wash? Check our live queue or head back to the
              main page.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/queue"
                className="inline-flex items-center gap-2 bg-cuci-secondary text-black px-6 py-3 rounded-full font-semibold transition-all shadow-lg hover:opacity-90"
                data-testid="link-partners-queue"
              >
                View Live Queue <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-cuci-primary hover:text-cuci-primary-dark font-semibold transition-colors"
                data-testid="link-partners-home"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
