import { existsSync } from "node:fs";
import { defineConfig, loadEnv } from "vite-plus";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const workerOrigin = (env.APP_WORKER_ORIGIN ?? "http://127.0.0.1:8787").replace(/\/$/, "");

  return {
    base: "/",
    appType: "spa",
    build: { outDir: "dist/client" },
    preview: {
      host: "127.0.0.1",
      port: Number(process.env.PORT ?? 10010),
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
        "^/assets(?:/|$)": {
          bypass: (request) => {
            const url = request.url ?? "/";
            const { pathname } = new URL(url, "http://localhost");
            return existsSync(new URL(`./dist/client${pathname}`, import.meta.url)) ? url : false;
          },
        },
      },
    },
  };
});
