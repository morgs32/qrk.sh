import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite-plus";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const apiOrigin = (env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  const workerOrigin = (env.APP_WORKER_ORIGIN ?? "http://127.0.0.1:8787").replace(/\/$/, "");

  return {
    plugins: [
      tailwindcss(),
      tanstackStart({
        srcDirectory: ".",
        router: {
          entry: "./router.tsx",
          routesDirectory: "./routes",
          generatedRouteTree: "./routeTree.gen.ts",
          basepath: "/",
        },
        spa: {
          enabled: true,
          prerender: { outputPath: "/index.html" },
        },
      }),
      react(),
    ],
    resolve: {
      alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
      dedupe: ["react", "react-dom"],
    },
    ssr: { noExternal: [/^@zerospin\//] },
    define: {
      "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(apiOrigin),
      "process.env.NEXT_PUBLIC_WEB_ORIGIN": JSON.stringify(
        env.NEXT_PUBLIC_WEB_ORIGIN ??
          (mode === "production" ? "https://qrk.sh" : "https://qrk.localhost"),
      ),
      "process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY": JSON.stringify(
        env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
      ),
      "process.env.NEXT_PUBLIC_ZEROSPIN_API_URL": JSON.stringify(
        env.NEXT_PUBLIC_ZEROSPIN_API_URL ?? "",
      ),
      "process.env.NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY": JSON.stringify(
        env.NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY ?? "",
      ),
      "process.env.PUBLIC_MAPBOX_TOKEN": JSON.stringify(env.PUBLIC_MAPBOX_TOKEN ?? ""),
    },
    worker: { format: "es" },
    server: {
      host: "127.0.0.1",
      port: 3001,
      strictPort: true,
      allowedHosts: ["app.qrk.localhost"],
      proxy: {
        "^/rpc(?:/|$)": {
          target: workerOrigin,
          changeOrigin: true,
          ws: true,
        },
        "^/assets/(?:site-settings-social-preview\\.png|favicon\\.ico|favicon-light\\.png|qrk-sh\\.svg)$":
          {
            bypass: (request) => (request.url ?? "/").replace("/assets/", "/"),
          },
      },
    },
  };
});
