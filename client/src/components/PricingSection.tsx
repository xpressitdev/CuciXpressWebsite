import { motion } from "framer-motion";

export default function PricingSection() {
  return (
    <section id="pricing" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <div className="cuci-eyebrow mb-3">Coming soon</div>
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-4">
            Looking for{" "}
            <span className="text-cuci-primary">subscriptions?</span>
          </h2>
          <p className="text-lg text-gray-600 mb-8 max-w-3xl mx-auto">
            We&apos;re launching subscription packages for regular car care.
            Check our dedicated subscriptions page for early access.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => {
                window.location.href = "/subscriptions";
              }}
              className="cuci-cta bg-cuci-primary text-white px-8 py-4 rounded-lg text-base"
              data-testid="button-pricing-subs"
            >
              View subscription plans →
            </button>
            <button
              onClick={() => {
                document
                  .getElementById("locations")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
              className="cuci-cta bg-white text-gray-900 px-8 py-4 rounded-lg text-base"
              data-testid="button-pricing-locations"
            >
              Find nearest location
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
