import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/link",
              message: "Use Wordmark or UnderlinedLink instead.",
            },
          ],
        },
      ],
    },
    overrides: [
      {
        files: ["components/Wordmark.tsx", "components/UnderlinedLink.tsx"],
        rules: {
          "no-restricted-imports": "off",
        },
      },
    ],
  },
});
