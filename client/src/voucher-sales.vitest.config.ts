import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

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
    include: ["client/src/components/admin/VoucherSalesTab.test.tsx"],
  },
});
