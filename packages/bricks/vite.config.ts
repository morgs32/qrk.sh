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
        "@zerospin/core/models/primitiveMaps",
        "@zerospin/core/models/primitives",
        "class-variance-authority",
        "clsx",
        "effect",
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
