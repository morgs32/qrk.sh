import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer, defineConfig, loadEnv, type ViteDevServer } from "vite-plus";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  let devServer: ViteDevServer | undefined;
  const env = loadEnv(mode, import.meta.dirname, ["NEXT_PUBLIC_", "PUBLIC_"]);
  const mapboxToken = process.env.PUBLIC_MAPBOX_TOKEN ?? env.PUBLIC_MAPBOX_TOKEN;
  if (!mapboxToken) throw new Error("PUBLIC_MAPBOX_TOKEN is required in apps/studio/.env.local");

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
    base: "/assets/",
    envPrefix: [],
    build: { outDir: "build/client" },
    server: { hmr: { path: "hmr" } },
    plugins: [
      tailwindcss(),
      {
        name: "render-loading-workspace",
        configureServer(server) {
          devServer = server;
        },
        async transformIndexHtml(html) {
          const loader =
            devServer ??
            (await createServer({
              configFile: false,
              root: import.meta.dirname,
              server: { middlewareMode: true },
            }));
          try {
            const { LoadingWorkspace } = await loader.ssrLoadModule(
              "/app/LoadingWorkspace/LoadingWorkspace.tsx",
            );
            return html.replace(
              "<!-- loading-workspace -->",
              renderToStaticMarkup(createElement(LoadingWorkspace)),
            );
          } finally {
            if (!devServer) await loader.close();
          }
        },
      },
      {
        name: "rooted-app-routes",
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            // Next rewrites serialize bare Vite query flags as `?url=` / `?import=`.
            // Restore empty flags for asset requests before Vite's import analysis.
            if (request.url?.startsWith("/assets/"))
              request.url = request.url.replace(/([?&][^=&]+)=(?=&|$)/g, "$1");
            if (request.url?.startsWith("/_vercel/")) {
              response.writeHead(404).end();
              return;
            }
            if (request.url && !request.url.startsWith("/assets/"))
              request.url = "/assets" + request.url;
            next();
          });
        },
      },
      {
        name: "rooted-app-preview",
        configurePreviewServer(server) {
          // Vite strips its asset base before serving the SPA document.
          // Prefix document requests too so its base middleware does not redirect `/`.
          server.middlewares.use((request, response, next) => {
            if (request.url?.startsWith("/_vercel/")) {
              response.writeHead(404).end();
              return;
            }
            if (request.url && !request.url.startsWith("/assets/"))
              request.url = "/assets" + request.url;
            next();
          });
        },
      },
      react(),
    ],
    resolve: {
      alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
      // Defense-in-depth: root pnpm overrides pin react/react-dom to 19.2.7.
      // Without dedupe, a nested peer (e.g. zustand under @zerospin/react) can
      // still prebundle a second React and break useLiveQuery's useCallback.
      dedupe: ["react", "react-dom"],
    },
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
      "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(
        process.env.NEXT_PUBLIC_API_URL ?? env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787",
      ),
    },
    optimizeDeps: {
      entries: [
        "app/main.tsx",
        "app/routes/*.tsx",
        "app/**/Dashboard.tsx",
        "app/**/UserLayout.tsx",
        "app/**/SiteLayout.tsx",
        "app/**/EditorLayout.tsx",
      ],
      include: [
        "react",
        "react-dom/client",
        "framer-motion",
        "zustand/react",
        // Same as shopping: DevTools lazy-imports react-router cookie deps.
        "@zerospin/devtools > react-router > cookie",
        "@zerospin/devtools > react-router > set-cookie-parser",
      ],
      force: process.env.COLD_DEV === "1",
    },
  };
});
