import { fileURLToPath, URL } from "node:url";

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const packageEnv = loadEnv(mode, packageRoot, "");
  const mapboxToken = packageEnv.PUBLIC_MAPBOX_TOKEN;

  if (mapboxToken === undefined || mapboxToken.length === 0) {
    throw new Error(`PUBLIC_MAPBOX_TOKEN is required in ${packageRoot}/.env.local`);
  }

  return {
    define: {
      "import.meta.env.PUBLIC_MAPBOX_TOKEN": JSON.stringify(mapboxToken),
    },
    plugins: [react()],
    build: {
      lib: {
        entry: "src/index.ts",
        formats: ["es"],
        fileName: "index",
      },
      rollupOptions: {
        external: [
          "@radix-ui/react-slot",
          "@unpic/react",
          "@zerospin/core/models/primitiveMaps",
          "@zerospin/core/models/primitives",
          "class-variance-authority",
          "clsx",
          "effect",
          "es-toolkit/object",
          "lucide-react",
          "mapbox-gl",
          "react",
          "react-activity-calendar",
          "react-dom",
          "react/jsx-runtime",
          "swr",
          "tailwind-merge",
        ],
      },
    },
  };
});
