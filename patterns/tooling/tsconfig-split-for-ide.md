# TypeScript tsconfig split for IDE performance

Keep each package's plain `tsconfig.json` as the narrow source-editing project. Put specs, root config files, generated framework types, and typecheck-only files in `tsconfig.etc.json`.

**Bad:** Broad plain config with `rootDir: "."`, Vitest globals, Next generated types, and specs in `include` — the editor loads the whole monorepo graph while editing ordinary `src` files.

**Good:** Plain config is source-only:

```json
{
  "compilerOptions": {
    "rootDir": "./src",
    "disableReferencedProjectLoad": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["**/*.spec.ts", "**/*.spec.tsx"]
}
```

**Good:** `tsconfig.etc.json` is the thorough project for specs and root config:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true,
    "types": ["node", "vitest/globals"]
  },
  "include": [
    "src/**/*.spec.ts",
    "vitest.config.ts",
    "next.config.ts",
    "*.d.ts"
  ],
  "references": [{ "path": "./tsconfig.json" }]
}
```

Do not rename this to `tsconfig.test.json` — it covers more than tests.
