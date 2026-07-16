# Prisma schema updates (`db push`)

When migration history is not required, apply schema changes with `db push` — not `migrate dev`.

**Bad:** Creating migrations for routine schema edits (review churn without value).

```sh
pnpm exec prisma migrate dev
```

**Good:** Push the schema directly.

```sh
pnpm exec prisma db push
```
