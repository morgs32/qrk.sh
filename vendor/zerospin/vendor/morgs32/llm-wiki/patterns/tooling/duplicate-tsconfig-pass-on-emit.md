# Emit packages: exclusive lib vs ts pass

Emit packages type product source in **`lib`** (`tsc -b tsconfig.json`). The **`ts`** target runs only `tsconfig.etc.json` and must not re-typecheck the same `src/**` files.

**Bad:**

```json
{
  "scripts": {
    "lib": "tsc -b tsconfig.json",
    "ts": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.etc.json --noEmit"
  }
}
```

**Good:**

```json
{
  "scripts": {
    "lib": "tsc -b tsconfig.json",
    "ts": "tsc -p tsconfig.etc.json --noEmit"
  }
}
```

Plain `tsconfig.json` owns product `src/**` only. `tsconfig.etc.json` references the local plain project so specs import from emitted declarations.

Do not put the same file in both `include` lists.
