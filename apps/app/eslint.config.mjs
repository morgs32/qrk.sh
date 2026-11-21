import { plugin as shadcn } from "@shadcn/lint";
import parser from "@typescript-eslint/parser";

export default [
  {
    files: ["{app,components,routes,modules}/**/*.tsx"],
    ignores: ["components/ui/**", "**/*.stories.tsx"],
    languageOptions: { parser },
    plugins: { shadcn },
    settings: { shadcn: { ui: "@qrk.sh/bricks/components" } },
    rules: { "shadcn/require-static-classes": "error" },
  },
];
