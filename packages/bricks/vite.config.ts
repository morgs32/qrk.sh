import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
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
        "class-variance-authority",
        "clsx",
        "es-toolkit/object",
        "lucide-react",
        "react",
        "react-activity-calendar",
        "react-dom",
        "react/jsx-runtime",
        "swr",
        "tailwind-merge",
      ],
    },
  },
});
