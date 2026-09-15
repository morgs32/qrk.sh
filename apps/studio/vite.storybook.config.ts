import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
    dedupe: ["react", "react-dom"],
  },
});
