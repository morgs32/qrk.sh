import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["scraper/**", "node_modules/**", "dist/**", "build/**"],
  },
});
