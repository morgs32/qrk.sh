import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const packageEnv = loadEnv(mode, packageRoot, "");
  const scraperUrl = packageEnv.SCRAPER_URL;
  const mapboxToken = packageEnv.PUBLIC_MAPBOX_TOKEN;

  if (scraperUrl === undefined || scraperUrl.length === 0) {
    throw new Error(`SCRAPER_URL is required in ${packageRoot}/.env.local`);
  }

  if (mapboxToken === undefined || mapboxToken.length === 0) {
    throw new Error(`PUBLIC_MAPBOX_TOKEN is required in ${packageRoot}/.env.local`);
  }

  return {
    root: packageRoot,
    envDir: packageRoot,
    define: {
      "import.meta.env.PUBLIC_MAPBOX_TOKEN": JSON.stringify(mapboxToken),
    },
    resolve: {
      alias: [
        {
          find: "@qrk.sh/bricks/styles.css",
          replacement: fileURLToPath(new URL("./src/styles.css", import.meta.url)),
        },
        {
          find: "@qrk.sh/bricks",
          replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
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
    plugins: [tailwindcss(), reactRouter()],
  };
});
