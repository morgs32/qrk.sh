import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite-plus";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
      dedupe: ["react", "react-dom"],
    },
    define: { "process.env.PUBLIC_MAPBOX_TOKEN": JSON.stringify(env.PUBLIC_MAPBOX_TOKEN ?? "") },
  };
});
