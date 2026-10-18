import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  // Next normally replaces these build-time flags for next/link.
  define: {
    "process.env": "{}",
  },
  resolve: {
    dedupe: ["react", "react-dom"],
  },
});
