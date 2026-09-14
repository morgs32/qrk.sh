import { fileURLToPath, URL } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite-plus";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const packageEnv = loadEnv(mode, packageRoot, "");
  const mapboxToken = packageEnv.PUBLIC_MAPBOX_TOKEN;

  if (mapboxToken === undefined || mapboxToken.length === 0) {
    throw new Error(`PUBLIC_MAPBOX_TOKEN is required in ${packageRoot}/.env.local`);
  }

  return {
    root: packageRoot,
    build: { outDir: "build" },
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
    plugins: [tailwindcss(), react(), cloudflare()],
  };
});
