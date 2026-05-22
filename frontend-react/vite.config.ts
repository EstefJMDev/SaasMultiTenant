import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

// Configuraci?n de Vite para React + TS.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const devHost = process.env.VITE_DEV_HOST || env.VITE_DEV_HOST || "0.0.0.0";
  const proxyTarget =
    process.env.VITE_API_PROXY_TARGET ||
    env.VITE_API_PROXY_TARGET ||
    "http://localhost:8000";
  const agentProxyTarget =
    process.env.VITE_AGENT_PROXY_TARGET ||
    env.VITE_AGENT_PROXY_TARGET ||
    "http://localhost:3000";

  return {
    plugins: [react()],
    // Evita que Vite intente parsear Dockerfile como JS si se importa por error.
    assetsInclude: ["**/Dockerfile"],
    resolve: {
      alias: {
        "@app": path.resolve(__dirname, "src/app"),
        "@components": path.resolve(__dirname, "src/components"),
        "@shared": path.resolve(__dirname, "src/shared"),
        "@entities": path.resolve(__dirname, "src/entities"),
        "@widgets": path.resolve(__dirname, "src/widgets"),
        "@pages": path.resolve(__dirname, "src/pages"),
        "@api": path.resolve(__dirname, "src/api"),
        "@hooks": path.resolve(__dirname, "src/hooks"),
        "@test": path.resolve(__dirname, "src/test"),
        "@features": path.resolve(__dirname, "src/features"),
        "@theme": path.resolve(__dirname, "src/theme.ts"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom"],
            chakra: [
              "@chakra-ui/react",
              "@chakra-ui/icons",
              "@emotion/react",
              "@emotion/styled",
              "framer-motion",
            ],
            tanstack: [
              "@tanstack/react-query",
              "@tanstack/react-router",
              "@tanstack/react-table",
            ],
            recharts: ["recharts"],
          },
        },
      },
    },
    server: {
      port: 5173,
      host: devHost,
      allowedHosts: true,
      watch: {
        usePolling: true,
        interval: 500,
      },
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/public/supplier-onboarding": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/public/supplier": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/public/contracts": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/public/signatures": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/static": {
          target: proxyTarget,
          changeOrigin: true,
        },
        "/agent": {
          target: agentProxyTarget,
          changeOrigin: true,
        },
        "/audit": {
          target: agentProxyTarget,
          changeOrigin: true,
        },
        "/health": {
          target: agentProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
