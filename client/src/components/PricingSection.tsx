import { motion } from "framer-motion";

export default function PricingSection() {
  return (
    <section id="pricing" className="py-12 sm:py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Looking for <span className="text-cuci-primary">Subscription Services</span>?
          </h2>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            We're working on launching subscription packages for regular car care. 
            Check out our dedicated subscriptions page for more details!
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                window.location.href = '/subscriptions';
              }}
              className="bg-cuci-primary hover:bg-cuci-primary-dark text-white px-8 py-3 rounded-full font-semibold transition-all shadow-lg"
            >
              View Subscription Plans
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                const element = document.getElementById('locations');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="border-2 border-cuci-secondary text-cuci-secondary hover:bg-cuci-secondary hover:text-white px-8 py-3 rounded-full font-semibold transition-all"
            >
              Find Nearest Location
            </motion.button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}