---
name: scan
description: Sync the current llm-wiki and sibling consumers with their remotes, scan sibling Git repositories for llm-wiki subtrees under vendor/, compare each vendored copy with the current committed llm-wiki tree, and update stale clean repositories. Use when the user asks to scan sibling repositories, propagate llm-wiki additions, refresh vendored llm-wiki copies, or check which neighboring projects are behind this repository.
---

# Scan

Run from the `llm-wiki` repository root. Sync remote branches before comparing
trees. After syncing, treat the current committed source tree as the version to
propagate; include committed local additions when the source branch is ahead of
its upstream.

## Establish the source

1. Resolve the source root with `git rev-parse --show-toplevel`.
2. Require a named branch with a configured upstream.
3. Stop before scanning when the source has tracked or untracked changes.
   Uncommitted additions cannot be represented by a subtree update.
4. Run `git pull --ff-only` to fetch and fast-forward the source branch before
   discovering or comparing siblings.
5. Stop when the pull cannot fast-forward. Do not merge, rebase, reset, commit,
   or push the source repository.
6. Record the source `HEAD` after the pull. A source branch ahead of upstream is
   valid and its committed additions are included.

## Discover sibling consumers

Inspect only immediate child directories of the source repository's parent.
Exclude the source repository itself. A sibling is a candidate when it is a Git
worktree and contains a configured vendor at either:

1. `vendor/<name>`
2. `vendor/<owner>/<name>`

Do not recurse farther into vendor contents.

Treat a candidate as an llm-wiki subtree only when all of these are true:

1. Its vendor directory is tracked by the sibling repository.
2. Its `README.md` contains a `## Subrepo metadata` section with exactly one
   `Upstream` URL and one `Branch` value.
3. The normalized `Upstream` URL matches one of the source repository's remote
   URLs. Ignore a trailing `.git` and trailing slash when comparing URLs.
4. Git history contains a `git-subtree-dir: <prefix>` trailer for that prefix.

Do not infer consumers from directory names alone. Record malformed or
ambiguous metadata as a skipped candidate.

## Sync sibling remotes

Before comparing a confirmed consumer with the source:

1. Require a named sibling branch with a configured upstream.
2. If the sibling worktree is clean, run `git pull --ff-only` and record its
   resulting `HEAD` before comparison.
3. If the sibling is dirty, do not pull it. Record its changed paths and treat
   it as ineligible for an update.
4. If the pull cannot fast-forward, classify that consumer as failed and do not
   run a subtree operation in it. Do not merge, rebase, reset, change branches,
   commit, or push to resolve remote divergence.

Remote synchronization is part of the scan. Never compare or update a clean
consumer from a stale local branch.

## Compare

For every confirmed consumer:

1. Record the sibling's branch, synchronized `HEAD`, worktree status, prefix,
   vendor upstream, vendor branch, and sibling branch upstream.
2. Fetch the source branch from the local source repository into the sibling
   without changing the sibling's checked-out branch.
3. Compare the fetched source commit's complete tree with `HEAD:<prefix>`.
   Compare trees, not commit IDs: squash subtrees intentionally have different
   histories.
4. Classify the consumer as current, stale, dirty-stale, or failed.

The complete-tree comparison must detect additions, deletions, renames, and
content changes. Do not compare only files already present in the vendor.

## Update stale consumers

Update every stale consumer whose worktree is clean. Never stash, discard,
commit unrelated files, change branches, or push a sibling repository.

Before each update, show the sibling path, prefix, old `HEAD`, source commit,
and exact operation. Then run:

```bash
git subtree pull --prefix="$PREFIX" "$SOURCE_ROOT" "$SOURCE_BRANCH" --squash
```

Use the local source repository so committed additions that have not yet been
pushed are propagated. Process siblings independently; one dirty or failed
repository must not hide the status of the others.

After each pull:

1. Record the resulting squash commit.
2. Compare the resulting `HEAD:<prefix>` tree with the recorded source commit.
3. Mark the update successful only when the trees are identical and the
   sibling worktree is clean.
4. If the subtree pull conflicts or verification fails, stop modifying that
   sibling, preserve its exact state, and report the conflict or diff. Do not
   abort, reset, or invent a compatibility edit.

Do not update dirty-stale consumers. Report their status and changed paths so
the user can decide how to handle their WIP.

## Report

Return one row per sibling repository with:

1. Repository path
2. Detected prefix
3. Previous commit
4. Source commit
5. Initial classification
6. Resulting commit or skip/failure reason
7. Verification result

Explicitly list sibling repositories that are not consumers separately from
malformed or ambiguous candidates. State that changes are local and were not
pushed.
