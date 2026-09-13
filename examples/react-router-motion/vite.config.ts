import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [reactRouter()],
  optimizeDeps: {
    // Include the hydration entry and Motion before the first browser request.
    include: ["react-dom/client", "framer-motion"],
    force: process.env.COLD_DEV === "1",
  },
});
