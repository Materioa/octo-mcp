import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": "/src",
      "html2canvas": "html2canvas-pro",
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api/v2/login": {
        target: "https://auth.getmaterio.app",
        changeOrigin: true,
        secure: false,
      },
      "/api/v2/profile": {
        target: "https://accounts.getmaterio.app",
        changeOrigin: true,
        secure: false,
      },
      "/mcp-proxy": {
        target: "https://mcp.getmaterio.app",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mcp-proxy/, "/mcp"),
        secure: false,
      },
      "/backend-api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        timeout: 300000,
      },
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        timeout: 300000,
      },
    },
  },
  preview: {
    port: 5173,
    proxy: {
      "/api/v2/login": {
        target: "https://auth.getmaterio.app",
        changeOrigin: true,
        secure: false,
      },
      "/api/v2/profile": {
        target: "https://accounts.getmaterio.app",
        changeOrigin: true,
        secure: false,
      },
      "/mcp-proxy": {
        target: "https://mcp.getmaterio.app",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mcp-proxy/, "/mcp"),
        secure: false,
      },
      "/backend-api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        timeout: 300000,
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
