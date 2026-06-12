import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@trainers/types": path.resolve(__dirname, "../../packages/types/src"),
      "@trainers/api": path.resolve(__dirname, "../../apps/api/src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    exclude: [
      "src/__tests__/**/*.test.tsx",
      "src/__tests__/auth-login-flow.test.ts",
      "src/__tests__/authInit.test.ts",
      "src/__tests__/useApi.test.ts",
      "src/__tests__/useQueryParams.test.ts",
    ],
    setupFiles: ["./src/__tests__/setup-fast.ts"],
  },
});
