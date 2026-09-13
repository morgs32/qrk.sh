import tailwindcss from "@tailwindcss/vite";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, ["NEXT_PUBLIC_", "PUBLIC_"]);
  const mapboxToken = process.env.PUBLIC_MAPBOX_TOKEN ?? env.PUBLIC_MAPBOX_TOKEN;
  if (!mapboxToken) throw new Error("PUBLIC_MAPBOX_TOKEN is required in apps/app/.env.local");

  // Copy the existing worker build verbatim; vendor sources remain read-only.
  const backupWorkerAssets = new URL("./public/__zerospin/", import.meta.url);
  mkdirSync(backupWorkerAssets, { recursive: true });
  copyFileSync(
    new URL(
      "../../vendor/zerospin/packages/backup-worker/dist/backupWorker.bundle.js",
      import.meta.url,
    ),
    new URL("backup-worker.js", backupWorkerAssets),
  );
  copyFileSync(
    new URL(
      "../../vendor/zerospin/packages/backup-worker/dist/wa-sqlite-async.wasm",
      import.meta.url,
    ),
    new URL("wa-sqlite-async.wasm", backupWorkerAssets),
  );

  return {
    base: "/app-static/",
    envPrefix: [],
    server: { hmr: { path: "hmr" } },
    plugins: [
      tailwindcss(),
      {
        name: "rooted-app-routes",
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            if (request.url?.startsWith("/_vercel/")) {
              response.writeHead(404).end();
              return;
            }
            if (request.url && !request.url.startsWith("/app-static/"))
              request.url = "/app-static" + request.url;
            next();
          });
        },
      },
      {
        name: "rooted-app-prerender",
        configurePreviewServer(server) {
          // Vite strips its asset base before the Framework request handler.
          // Prefix document requests too so its base middleware does not redirect `/`.
          server.middlewares.use((request, response, next) => {
            if (request.url?.startsWith("/_vercel/")) {
              response.writeHead(404).end();
              return;
            }
            if (request.url && !request.url.startsWith("/app-static/"))
              request.url = "/app-static" + request.url;
            next();
          });
        },
      },
      reactRouter(),
    ],
    resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
    // Keep the public contract explicit; never replace process.env as a whole.
    define: {
      "process.env.PUBLIC_MAPBOX_TOKEN": JSON.stringify(mapboxToken),
      "process.env.NEXT_PUBLIC_ZEROSPIN_API_URL": JSON.stringify(
        process.env.NEXT_PUBLIC_ZEROSPIN_API_URL ?? env.NEXT_PUBLIC_ZEROSPIN_API_URL ?? "",
      ),
      "process.env.NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY": JSON.stringify(
        process.env.NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY ??
          env.NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY ??
          "",
      ),
      "process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY": JSON.stringify(
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
          env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
          "",
      ),
    },
    optimizeDeps: {
      entries: [
        "app/root.tsx",
        "app/routes/*.tsx",
        "app/**/Dashboard.tsx",
        "app/**/UserLayout.tsx",
        "app/**/SiteLayout.tsx",
        "app/**/EditorLayout.tsx",
      ],
      include: ["react-dom/client", "framer-motion"],
      force: process.env.COLD_DEV === "1",
    },
  };
});
