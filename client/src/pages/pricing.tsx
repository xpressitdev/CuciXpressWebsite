import { PricingContainer } from "@/components/ui/pricing-container";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

// Types
interface PricingPlan {
    name: string;
    monthlyPrice: number;
    yearlyPrice: number;
    features: string[];
    isPopular?: boolean;
    accent: string;
    rotation?: number;
}

const CAR_WASH_PLANS: PricingPlan[] = [
    {
        name: "Basic Wash",
        monthlyPrice: 15,
        yearlyPrice: 150,
        features: ["Exterior Wash", "Rinse & Dry", "Basic Interior Vacuum", "Tire Cleaning"],
        isPopular: false,
        accent: "bg-cuci-primary",
        rotation: -2
    },
    {
        name: "Premium Clean",
        monthlyPrice: 35,
        yearlyPrice: 350,
        features: ["Full Exterior Detail", "Deep Interior Clean", "Wax Protection", "Dashboard Polish", "Window Cleaning", "Priority Queue"],
        isPopular: true,
        accent: "bg-cuci-secondary",
        rotation: 1
    },
    {
        name: "Elite Detail",
        monthlyPrice: 65,
        yearlyPrice: 650,
        features: ["Premium Detailing", "Paint Protection", "Leather Treatment", "Engine Bay Clean", "Unlimited Visits", "VIP Service"],
        isPopular: false,
        accent: "bg-green-500",
        rotation: 2
    }
];

export default function Pricing() {
    return (
        <div className="min-h-screen bg-gray-50">
            <Navigation />
            <main className="pt-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                    <PricingContainer
                        title="Car Wash Subscriptions"
                        plans={CAR_WASH_PLANS}
                        className="bg-gradient-to-br from-gray-50 to-white"
                    />
                    
                    {/* Additional Information Section */}
                    <div className="mt-16 text-center">
                        <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-200">
                            <h3 className="text-2xl font-bold text-gray-900 mb-4">Why Choose Cuci Xpress Subscriptions?</h3>
                            <div className="grid md:grid-cols-3 gap-6 mt-8">
                                <div className="text-center">
                                    <div className="bg-cuci-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <span className="text-2xl">🚗</span>
                                    </div>
                                    <h4 className="font-semibold text-gray-900 mb-2">Unlimited Access</h4>
                                    <p className="text-gray-600 text-sm">Visit any of our 4 locations as many times as you want</p>
                                </div>
                                <div className="text-center">
                                    <div className="bg-cuci-secondary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <span className="text-2xl">⚡</span>
                                    </div>
                                    <h4 className="font-semibold text-gray-900 mb-2">Skip the Queue</h4>
                                    <p className="text-gray-600 text-sm">Premium members get priority service and faster wait times</p>
                                </div>
                                <div className="text-center">
                                    <div className="bg-green-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <span className="text-2xl">💰</span>
                                    </div>
                                    <h4 className="font-semibold text-gray-900 mb-2">Save Money</h4>
                                    <p className="text-gray-600 text-sm">Yearly plans save you 20% compared to monthly subscriptions</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}