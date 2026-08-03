import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Standalone Vitest config (NOT the app's vite.config.ts). Tests are
// integration tests that boot the real Express routes against the
// STAGING database — never the shared dev/prod DB. The `test.env` block
// rewires DATABASE_URL to STAGING_DATABASE_URL *before* any app module
// (which reads DATABASE_URL at import time) is loaded.
export default defineConfig({
  // tsconfig sets jsx:"preserve" (the app's vite.config.ts compiles JSX via
  // @vitejs/plugin-react). Vitest 4 bundles rolldown-vite, whose oxc
  // transform must be told to compile JSX for .tsx test/component files.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
      "@assets": fileURLToPath(new URL("./attached_assets", import.meta.url)),
      "@": fileURLToPath(new URL("./client/src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Default env is node (DB-backed integration tests). UI component
    // tests (.test.tsx) opt into jsdom with a `// @vitest-environment jsdom`
    // pragma at the top of the file.
    environment: "node",
    // DB-backed integration tests share one staging DB; run them serially
    // so seeded fixtures and ticket-sequence assertions don't race.
    fileParallelism: false,
    sequence: { concurrent: false },
    hookTimeout: 60_000,
    testTimeout: 60_000,
    env: {
      DATABASE_URL: process.env.STAGING_DATABASE_URL ?? "",
      NODE_ENV: "test",
    },
  },
});
