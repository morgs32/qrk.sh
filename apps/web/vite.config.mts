import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    jsPlugins: ["./lint/nextLinkPlugin.mjs"],
    rules: {
      "qrk/next-link-composition": "error",
    },
    overrides: [
      {
        files: ["components/Wordmark.tsx", "components/UnderlinedLink.tsx"],
        rules: {
          "qrk/next-link-composition": "off",
        },
      },
    ],
  },
});
