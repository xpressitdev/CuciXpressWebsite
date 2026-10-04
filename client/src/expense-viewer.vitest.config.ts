import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Frontend-only suite: no integration setup or database access.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "@shared": fileURLToPath(new URL("../../shared", import.meta.url)),
      "@assets": fileURLToPath(new URL("../../attached_assets", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: [
      "client/src/components/admin/ExpenseProfitLossTab.test.tsx",
      "tests/profit-loss-tab.test.tsx",
      "tests/profit-loss-range-controls.test.tsx",
    ],
  },
});