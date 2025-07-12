import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="pt-20 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <Link href="/">
              <button className="inline-flex items-center text-cuci-primary hover:text-cuci-primary-dark transition-colors">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </button>
            </Link>
          </div>
          
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">Terms of Service</h1>
            
            <div className="prose prose-gray max-w-none">
              <p className="text-gray-600 mb-6">
                <strong>Last updated:</strong> July 12, 2025
              </p>
              
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Acceptance of Terms</h2>
              <p className="text-gray-700 mb-4">
                By using our services or visiting our website, you agree to be bound by these Terms of Service 
                and our Privacy Policy. If you do not agree to these terms, please do not use our services.
              </p>
              
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Our Services</h2>
              <p className="text-gray-700 mb-4">
                Cuci Xpress provides professional car wash and detailing services across multiple locations in Brunei. 
                Our services include but are not limited to basic washing, premium cleaning, and elite detailing packages.
              </p>
              
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Service Availability</h2>
              <p className="text-gray-700 mb-4">
                Our services are available during business hours at our designated locations. 
                Service availability may vary due to weather conditions, equipment maintenance, or other factors beyond our control.
              </p>
              
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Payment and Pricing</h2>
              <p className="text-gray-700 mb-4">
                Current pricing for our services is displayed on our website and at our locations. 
                Payment is due at the time of service unless otherwise arranged. We accept various payment methods including cash and digital payments.
              </p>
              
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Customer Responsibilities</h2>
              <p className="text-gray-700 mb-4">
                Customers are responsible for:
              </p>
              <ul className="list-disc list-inside text-gray-700 mb-4 space-y-2">
                <li>Removing personal items from vehicles before service</li>
                <li>Informing staff of any special requirements or concerns</li>
                <li>Following safety instructions provided by our staff</li>
                <li>Treating our staff and facilities with respect</li>
              </ul>
              
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Limitation of Liability</h2>
              <p className="text-gray-700 mb-4">
                While we take great care in providing our services, we are not liable for any pre-existing damage 
                to vehicles or items left in vehicles during service. Customers are advised to inspect their vehicles 
                before and after service.
              </p>
              
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Modifications to Terms</h2>
              <p className="text-gray-700 mb-4">
                We reserve the right to modify these terms at any time. Changes will be effective immediately 
                upon posting on our website. Continued use of our services constitutes acceptance of modified terms.
              </p>
              
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Contact Information</h2>
              <p className="text-gray-700 mb-4">
                For questions about these Terms of Service, please contact us:
              </p>
              <ul className="list-none text-gray-700 space-y-2">
                <li><strong>Phone:</strong> +673 838 7000</li>
                <li><strong>Email:</strong> info@cucixpress.com</li>
                <li><strong>Address:</strong> Cuci Xpress Tungku Link, A6, Ground Floor, Block A, Eng Ho Complex, Spg. 217-5-54 Jalan, Lebuhraya Tungku, BE3119</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}