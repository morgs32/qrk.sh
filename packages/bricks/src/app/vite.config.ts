import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ mode }) => {
  const packageEnv = loadEnv(mode, packageRoot, "");
  const scraperUrl = packageEnv.SCRAPER_URL;

  if (scraperUrl === undefined || scraperUrl.length === 0) {
    throw new Error(`SCRAPER_URL is required in ${packageRoot}/.env`);
  }

  return {
    root: fileURLToPath(new URL(".", import.meta.url)),
    envDir: packageRoot,
    resolve: {
      alias: [
        {
          find: "@qrk.sh/bricks/styles.css",
          replacement: fileURLToPath(new URL("../styles.css", import.meta.url)),
        },
        {
          find: "@qrk.sh/bricks",
          replacement: fileURLToPath(new URL("../index.ts", import.meta.url)),
        },
      ],
    },
    server: {
      proxy: {
        "/scraper-rpc": {
          target: scraperUrl,
          changeOrigin: true,
        },
      },
    },
    plugins: [tailwindcss(), tanstackStart({ srcDirectory: "." }), react()],
  };
});
