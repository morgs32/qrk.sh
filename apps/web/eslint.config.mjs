import { plugin as shadcn } from "@shadcn/lint";
import parser from "@typescript-eslint/parser";

export default [
  {
    files: ["app/{privacy,terms,sign-in,sign-up}/**/*.tsx"],
    languageOptions: { parser },
    plugins: { shadcn },
    rules: { "shadcn/no-raw-colors": "error" },
  },
];
