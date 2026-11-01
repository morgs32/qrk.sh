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
      {
        name: "development-sign-in-handoff",
        apply: "serve",
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            const url = new URL(
              request.url ?? "/",
              "http://development.invalid",
            );
            if (!/^\/__dev\/log-me-in\/[^/]+$/.test(url.pathname))
              return next();
            if (mode === "production" || process.env.NODE_ENV === "production") {
              response.statusCode = 404;
              response.end("Not found");
              return;
            }
            if (request.method !== "GET") {
              response.statusCode = 405;
              response.end("Method not allowed");
              return;
            }
            const target = new URL(
              url.pathname,
              env.NEXT_PUBLIC_WEB_ORIGIN ?? "https://qrk.localhost",
            );
            target.searchParams.set(
              "returnTo",
              url.searchParams.get("returnTo") ?? "/replace",
            );
            response.statusCode = 302;
            response.setHeader("Cache-Control", "no-store");
            response.setHeader("Location", target.href);
            response.end();
          });
        },
      },
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
      port: Number(process.env.PORT ?? 10001),
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
