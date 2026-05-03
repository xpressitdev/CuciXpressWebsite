import { useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
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
      accent: "bg-cuci-primary",
    },
    {
      title: "Community Partnership",
      description: "Building stronger local business networks",
      accent: "bg-cuci-secondary",
    },
    {
      title: "Shared Resources",
      description: "Access to our proven systems and expertise",
      accent: "bg-green-500",
    },
    {
      title: "Mutual Growth",
      description: "Growing together through strategic collaboration",
      accent: "bg-blue-500",
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
    <section id="collaborate" className="py-20 bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <div className="cuci-eyebrow mb-3">Let&apos;s build together</div>
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-4">
            Partner with{" "}
            <span className="text-cuci-primary">local businesses</span>
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            We believe in supporting local entrepreneurs and building stronger
            business communities. Let&apos;s explore opportunities together.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-8 items-start">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="cuci-card p-7"
          >
            <div className="cuci-eyebrow mb-2">Why us</div>
            <h3 className="text-2xl font-extrabold tracking-tight text-gray-900 mb-5">
              Why collaborate with us?
            </h3>
            <ul className="space-y-3">
              {benefits.map((benefit, index) => (
                <motion.li
                  key={index}
                  className="cuci-card-soft flex items-start p-3"
                  whileHover={{ translateX: 2 }}
                >
                  <span
                    className={`p-1.5 rounded-md mr-3 mt-0.5 border-2 border-black ${benefit.accent}`}
                    style={{ boxShadow: "1px 1px 0px 0px rgba(0,0,0,0.9)" }}
                  >
                    <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                  </span>
                  <div>
                    <p className="font-extrabold text-gray-900 text-sm">
                      {benefit.title}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {benefit.description}
                    </p>
                  </div>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="cuci-card p-7"
          >
            <div className="cuci-eyebrow mb-2">Get in touch</div>
            <h3 className="text-2xl font-extrabold tracking-tight text-gray-900 mb-5">
              Let&apos;s collaborate
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name" className="text-xs uppercase tracking-wider font-semibold text-gray-700">
                  Full name *
                </Label>
                <Input
                  id="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="Enter your full name"
                  className="mt-1.5 border-2 border-black"
                />
              </div>

              <div>
                <Label htmlFor="email" className="text-xs uppercase tracking-wider font-semibold text-gray-700">
                  Email address *
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  placeholder="Enter your email"
                  className="mt-1.5 border-2 border-black"
                />
              </div>

              <div>
                <Label htmlFor="phone" className="text-xs uppercase tracking-wider font-semibold text-gray-700">
                  Phone number
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  placeholder="Enter your phone number"
                  className="mt-1.5 border-2 border-black"
                />
              </div>

              <div>
                <Label htmlFor="business-type" className="text-xs uppercase tracking-wider font-semibold text-gray-700">
                  Business type
                </Label>
                <Select
                  value={formData.businessType}
                  onValueChange={(value) => handleInputChange("businessType", value)}
                >
                  <SelectTrigger className="mt-1.5 border-2 border-black">
                    <SelectValue placeholder="Select your business type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retail">Retail Business</SelectItem>
                    <SelectItem value="food">Food &amp; Beverage</SelectItem>
                    <SelectItem value="automotive">Automotive Services</SelectItem>
                    <SelectItem value="tech">Technology</SelectItem>
                    <SelectItem value="service">Service Provider</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="message" className="text-xs uppercase tracking-wider font-semibold text-gray-700">
                  Collaboration ideas
                </Label>
                <Textarea
                  id="message"
                  value={formData.message}
                  onChange={(e) => handleInputChange("message", e.target.value)}
                  placeholder="Tell us about your business and how we might collaborate..."
                  rows={4}
                  className="mt-1.5 border-2 border-black"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="cuci-cta w-full bg-cuci-primary text-white px-8 py-3.5 rounded-lg text-base disabled:opacity-60"
                data-testid="button-collab-submit"
              >
                {isSubmitting ? "Submitting..." : "Send collaboration request →"}
              </button>
            </form>

            <div className="mt-5 pt-5 border-t border-gray-200">
              <p className="text-xs text-gray-600 text-center">
                <strong>Next steps:</strong> we&apos;ll review your request and
                contact you within 48 hours.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
