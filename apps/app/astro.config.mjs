import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import astrobook from "astrobook";

export default defineConfig({
  integrations: [
    react(),
    astrobook({
      css: ["./app/globals.css"],
      directory: ".",
      title: "QRK App",
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
