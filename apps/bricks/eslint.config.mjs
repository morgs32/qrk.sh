import { plugin as shadcn } from "@shadcn/lint";
import parser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/**/*.stories.tsx", "src/**/*Example.tsx", "src/**/*Examples.tsx"],
    languageOptions: { parser },
    plugins: { shadcn },
    settings: { shadcn: { ui: "./src/components" } },
    rules: { "shadcn/require-static-classes": "error" },
  },
];
