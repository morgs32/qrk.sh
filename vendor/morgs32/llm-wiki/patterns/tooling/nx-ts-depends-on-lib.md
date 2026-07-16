# Nx `ts` depends on `lib`

Emit packages need local `dist/*.d.ts` before `tsc -p tsconfig.etc.json`. Configure once in workspace `targetDefaults.ts`:

```json
"dependsOn": ["lib", "^lib"]
```

**Bad:** Per-package override with only upstream emit — drops local `lib` and specs typecheck against stale declarations:

```json
"ts": {
  "dependsOn": ["^lib"]
}
```

**Good:** Inherit defaults, or explicitly list both when customizing:

```json
"ts": {
  "dependsOn": ["lib", "^lib"]
}
```

Lib-only packages with no specs use **`lib` only** and omit a `ts` script.
