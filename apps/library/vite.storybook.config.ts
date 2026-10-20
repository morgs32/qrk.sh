import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite-plus";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [tailwindcss(), react()],
    resolve: { dedupe: ["react", "react-dom"] },
    define: { "process.env.PUBLIC_MAPBOX_TOKEN": JSON.stringify(env.PUBLIC_MAPBOX_TOKEN ?? "") },
  };
});
