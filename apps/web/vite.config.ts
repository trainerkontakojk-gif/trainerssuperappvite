import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const appPort = Number(process.env.PORT) || 3005;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: path.resolve(__dirname, "../../"),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@trainers/api": path.resolve(__dirname, "../../apps/api/src"),
    },
  },
  server: {
    port: appPort,
    allowedHosts: [".trycloudflare.com", ".lhr.life"],
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: appPort,
    strictPort: true,
  },
});
