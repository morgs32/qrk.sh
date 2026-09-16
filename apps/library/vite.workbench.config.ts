import { fileURLToPath, URL } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
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
    envDir: packageRoot,
    define: {
      "import.meta.env.PUBLIC_MAPBOX_TOKEN": JSON.stringify(mapboxToken),
    },
    resolve: {
      alias: [
        {
          find: "@qrk.sh/library/bricks.css",
          replacement: fileURLToPath(new URL("./bricks.css", import.meta.url)),
        },
        {
          find: "@qrk.sh/library",
          replacement: fileURLToPath(new URL("./index.ts", import.meta.url)),
        },
      ],
    },
    plugins: [
      tailwindcss(),
      cloudflare({ viteEnvironment: { name: "ssr" } }),
      tanstackStart({ srcDirectory: "app" }),
      react(),
    ],
    server: {
      host: "127.0.0.1",
      port: 4100,
      strictPort: true,
    },
  };
});
