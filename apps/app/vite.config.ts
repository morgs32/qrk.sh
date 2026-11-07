import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite-plus";
import { VitePWA, type VitePluginPWAAPI } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const apiOrigin = (env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  const workerOrigin = (env.APP_WORKER_ORIGIN ?? "http://127.0.0.1:8787").replace(/\/$/, "");

  const offlineCachePrefix = `qrk-app-${randomUUID()}`;
  const pwa = VitePWA({
    manifest: false,
    injectRegister: false,
    registerType: "prompt",
    outDir: "dist/client",
    workbox: {
      cacheId: offlineCachePrefix,
      importScripts: ["offline-cache.js"],
      navigateFallback: "/index.html",
      navigateFallbackDenylist: [/^\/__dev(?:\/|$)/, /^\/rpc(?:\/|$)/],
      globPatterns: ["**/*.{js,css,html,wasm,woff,woff2,png,svg,ico}"],
      maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      clientsClaim: true,
      cleanupOutdatedCaches: false,
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/[^/]+\/npm\/@clerk\/.*\.js(?:\?.*)?$/,
          handler: "StaleWhileRevalidate",
          options: {
            cacheName: "qrk-clerk-static",
            cacheableResponse: { statuses: [0, 200] },
            expiration: { maxEntries: 64 },
          },
        },
      ],
    },
  });

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
            if (
              url.pathname === "/sw.js" &&
              mode !== "production" &&
              process.env.NODE_ENV !== "production"
            ) {
              response.setHeader("Cache-Control", "no-store");
              if (request.method !== "GET" && request.method !== "HEAD") {
                response.statusCode = 405;
                response.setHeader("Allow", "GET, HEAD");
                response.end("Method not allowed");
                return;
              }
              void Promise.all([
                readFile(new URL("./public/offline-cache.js", import.meta.url), "utf8"),
                readFile(new URL("./dev/retire-service-worker.js", import.meta.url), "utf8"),
              ]).then(([cacheScript, retirementScript]) => {
                // The unexpanded build prefix disables cleanup while retaining old assets.
                response.setHeader("Content-Type", "application/javascript; charset=utf-8");
                response.end(
                  request.method === "HEAD" ? undefined : `${cacheScript}\n${retirementScript}`,
                );
              }, next);
              return;
            }
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
      ...pwa,
      {
        name: "qrk-offline-output",
        apply: "build",
        enforce: "post",
        buildApp: {
          order: "post",
          async handler() {
            // Start writes the SPA shell after its environment builds finish.
            const api: VitePluginPWAAPI | undefined = pwa.find(
              (plugin) => plugin.name === "vite-plugin-pwa",
            )?.api;
            if (api === undefined) throw new Error("Missing offline build integration");
            const cacheScript = await readFile(
              new URL("./public/offline-cache.js", import.meta.url),
              "utf8",
            );
            await writeFile(
              new URL("./dist/client/offline-cache.js", import.meta.url),
              cacheScript.replaceAll("__QRK_CACHE_PREFIX__", offlineCachePrefix),
            );
            await api.generateSW();
          },
        },
      },
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
