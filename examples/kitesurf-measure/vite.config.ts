import { fileURLToPath, URL } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const libraryRoot = fileURLToPath(new URL("../../apps/library", import.meta.url));

export default defineConfig({
  root: packageRoot,
  plugins: [tailwindcss(), cloudflare(), react()],
  resolve: {
    alias: [
      {
        find: "@qrk.sh/library/bricks.css",
        replacement: `${libraryRoot}/bricks.css`,
      },
      {
        find: "@qrk.sh/library",
        replacement: `${libraryRoot}/lib/index.ts`,
      },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 4320,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4320,
    strictPort: true,
  },
});
