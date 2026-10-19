import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite-plus";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const mapboxToken = env.PUBLIC_MAPBOX_TOKEN;
  if (!mapboxToken) throw new Error("PUBLIC_MAPBOX_TOKEN is required in apps/library/.env.local");
  const workerOrigin = (env.LIBRARY_WORKER_ORIGIN ?? "http://127.0.0.1:8787").replace(/\/$/, "");

  return {
    plugins: [
      tailwindcss(),
      tanstackStart({
        srcDirectory: ".",
        router: {
          entry: "./router.tsx",
          routesDirectory: "./routes",
          generatedRouteTree: "./routeTree.gen.ts",
        },
        spa: { enabled: true },
      }),
      react(),
    ],
    resolve: { dedupe: ["react", "react-dom"] },
    ssr: { noExternal: [/^@zerospin\//] },
    define: { "process.env.PUBLIC_MAPBOX_TOKEN": JSON.stringify(mapboxToken) },
    worker: { format: "es" },
    server: {
      host: "127.0.0.1",
      port: Number(process.env.PORT ?? 10004),
      strictPort: true,
      allowedHosts: ["library.qrk.localhost"],
      proxy: {
        "/rpc": { target: workerOrigin, changeOrigin: true, ws: true },
        "/upload": { target: workerOrigin, changeOrigin: true },
        "/image/upload": { target: workerOrigin, changeOrigin: true },
        "/assets": { target: workerOrigin, changeOrigin: true },
      },
    },
  };
});
