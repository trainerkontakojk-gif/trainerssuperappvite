import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@trainers/types": path.resolve(__dirname, "../../packages/types/src"),
      "@trainers/api": path.resolve(__dirname, "../../apps/api/src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "*.test.ts"],
    setupFiles: ["./src/__tests__/setup.ts"],
    // 4-core dev machine: 3 workers (leave 1 core free) vs previous 1 worker serial.
    maxWorkers: 3,
  },
});
