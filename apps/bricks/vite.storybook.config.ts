import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite-plus";

export default defineConfig(({ mode }) => {
  const { PUBLIC_MAPBOX_TOKEN } = loadEnv(mode, ".", "PUBLIC_MAPBOX_TOKEN");
  const appEnv = loadEnv(
    mode,
    fileURLToPath(new URL("../app", import.meta.url)),
    "PUBLIC_MAPBOX_TOKEN",
  );
  return {
    plugins: [tailwindcss(), react()],
    resolve: { dedupe: ["react", "react-dom"] },
    define: {
      "process.env.PUBLIC_MAPBOX_TOKEN": JSON.stringify(
        PUBLIC_MAPBOX_TOKEN ?? appEnv.PUBLIC_MAPBOX_TOKEN ?? "",
      ),
    },
  };
});
