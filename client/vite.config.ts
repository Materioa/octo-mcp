import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/mcp-proxy": {
        target: "https://mcp.getmaterio.app",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mcp-proxy/, "/mcp"),
        secure: false,
      },
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        timeout: 300000,
      },
    },
  },
  worker: {
    format: "es",
  },
});
