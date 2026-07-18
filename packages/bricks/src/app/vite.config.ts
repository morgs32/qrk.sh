import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
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
  plugins: [tailwindcss(), tanstackStart({ srcDirectory: "." }), react()],
});
