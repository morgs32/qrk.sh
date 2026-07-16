# Git operations and commit hygiene

## File operations

- Delete unused files only when you understand ownership and impact; ask before deleting to fix local type/lint failures.
- Never edit `.env` or credential files.
- Do not revert work you did not author unless explicitly requested.
- Never use destructive git operations (`git reset --hard`, `git restore` to old commits, `rm`) unless explicitly requested in writing.

## Commit hygiene

- Check `git status` before every commit.
- Keep commits atomic; commit only paths you touched.

Tracked files:

```sh
git commit -m "<scoped message>" -- path/to/file1 path/to/file2
```

New files:

```sh
git restore --staged :/ && git add "path/to/file1" && git commit -m "<scoped message>" -- path/to/file1
```

Quote paths containing brackets or parentheses. For rebase, avoid editors: `GIT_EDITOR=: GIT_SEQUENCE_EDITOR=: git rebase --no-edit …`. Never amend unless explicitly approved.

## Conventional Commits

```text
<type>(<scope>): <description>
```

Types: `fix`, `feat`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

- Use parentheses for scope: `fix(orders): …` — not square brackets.
- Description: imperative mood, concise (prefer ≤ 72 characters).
- Body and footer optional for context and breaking changes.

Examples:

```text
fix(profiler): correct ProcedureCall type inference
feat(client): add OPFSAdapter support
docs: update cleanup docs
```
