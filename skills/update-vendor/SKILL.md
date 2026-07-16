---
name: update-vendor
description: Pull or push the Git subtrees vendored under vendor/. Use when the user asks to update, sync, pull, push, publish, or inspect external vendors, including Effect and morgs32/llm-wiki.
---

# Update Vendor

Treat a path under `vendor/` as configured only when its `README.md` contains a
`## Subrepo metadata` or `## Zerospin subrepo metadata` section with exactly
one `Upstream` URL and one `Branch` value. Read those values; do not maintain a
second manifest.

Discovery:

1. Immediate children of `vendor/` (e.g. `vendor/effect`).
2. Immediate children of each `vendor/<org>/` directory (one nesting level for
   namespaced vendors such as `vendor/morgs32/llm-wiki`).

Do not recurse into vendored package trees (e.g. `vendor/effect/packages`).
`llm-wiki/` at the repository root is first-party and is never a vendor target.

## Safety checks

1. Run from the Zerospin repository root.
2. Stop if tracked or untracked worktree changes exist. Report them; never
   stash, discard, commit, or mix them into a subtree operation without explicit
   permission.
3. Verify every requested target is a discovered configured vendor path, has the
   required README metadata, and is tracked by Git.
4. Use `--squash` for every pull. Never force-push a subtree split.
5. Process targets sequentially and stop on the first conflict or failed
   command. Report completed and unprocessed targets.

## Pull

When invoked without an operation or targets, pull every configured vendor.
Also accept one named target or an explicit set of targets.

For each target, read `PREFIX`, `UPSTREAM`, and `BRANCH` from its directory and
retain the complete metadata section verbatim, then run the values directly in:

```bash
git subtree pull --prefix="$PREFIX" "$UPSTREAM" "$BRANCH" --squash
```

Before each pull, show the target, upstream, and branch. Afterward, report the
created squash commit or that no update was needed. An upstream README does not
necessarily contain Zerospin's metadata section. If the pull removes or changes
that section, restore the retained section exactly and commit only that README
restoration before processing the next target. Never reconstruct metadata from
memory.

## Push

Accept either one named target or explicit `all`. Never infer a push from a bare
invocation.

For each requested target:

1. Fetch its configured upstream branch.
2. Run `git subtree split --prefix="$PREFIX"` without `--rejoin` and retain the
   resulting split commit.
3. Show `git log --oneline` for commits reachable from the split commit but not
   the fetched upstream tip. If the upstream tip is not an ancestor of the
   split commit, stop and require a pull or manual reconciliation.
4. Show the exact `git subtree push` command for every target.
5. Ask one blocking confirmation covering the displayed targets and commits.
6. Only after confirmation, run each push sequentially:

```bash
git subtree push --prefix="$PREFIX" "$UPSTREAM" "$BRANCH"
```

If there are no outgoing commits for a target, report it and skip its push.

## Result

Report each vendor prefix, operation, upstream branch, resulting commit, any
metadata-restoration commit, and any conflict or skipped state.
