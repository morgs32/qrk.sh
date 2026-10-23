# Handoff: Drawer-to-Wall drag and drop

**Date:** 2026-10-23  
**Focus:** Review the phase-two New Section prototype on main; accurately resolve the terminal-directory issue. Keep New Stack for phase three.

## Goal

Continue in `/Users/morgs32/GitHub/qrk.sh` on `main`. Phase two is a prototype of a temporary full-width Section insertion band. Do not advance to New Stack or treat the prototype as an approved production design.

## Done

1. Phase one implemented drawer-template copying, Brick left/right insertion, Row above/below insertion, and empty-container bootstrap. Its behavior and source citations are in the linked conventions and research; consult those instead of reconstructing the design from this handoff.
2. Feature commit `fd883944e67acdd540b6fa477e4346091feb5466` was created in a worktree. At the user's request, PR #17 was closed and the work, including a shared WallEditor extraction and Storybook follow-up, was brought onto local main **as staged changes**, not committed to main. Main HEAD is `b80209beecc39f9d6bfccdbea4899c68a4d84c21`.
3. `codex/drawer-wall-insertion` was deleted locally and remotely. Its old managed checkout remains at `/Users/morgs32/.codex/worktrees/drawer-wall-insertion/qrk.sh`, detached at `fd883944e`, with dirty files. It was not removed. Do not resume feature work there.
4. Phase two is **unstaged over the staged phase-one baseline** in four files: `WallEditor.tsx`, `WallEditor.stories.tsx`, the module README, and layout conventions. The optional `prototypeNewSection` prop defaults false; only the separate prototype story enables it. Production and default stories retain phase-one targeting.
5. The prototype uses existing `addBrick` Wall insertion targets and stable `beforeSectionId` anchors. There are no new backend schemas, commands, or New Stack targets. Its mock fixture has three Sections, six Bricks, and two existing Stacks in the middle Section at md/lg/xl.
6. Native Storybook checks passed for Section insertion before the first, between existing Sections, and at the end; outside drops created nothing and cleared feedback. At md, lane width matched the full 720px Wall alongside two existing Stacks. The default story still had no Section lanes and accepted ordinary Row insertion. These are **local mock-session** checks, not authenticated backend delivery evidence.
7. The final App build passed through `pnpm nx run @qrk.sh/app:build`; formatting and `git diff --check` passed. App `tsc --noEmit` still reported six existing branded-siteId errors in unchanged module/BrickDetail/Modules routes, plus an `aggregateSessions` option error in unchanged `zerospin/node.worker.ts`. Dependencies were being updated to Zerospin 32.0.1 by other work; do not fix that integration incidentally. Earlier phase-one verification passed the existing four SDK-harness backend tests. An extra method-level test was removed; do not resurrect the test-policy approval discussion.

## Remaining

1. Review the current prototype with the user. Its narrow 24px boundary lanes are always visible **in the prototype**; hovering during a drag expands the selected lane to 96px in flow. Originally hidden lanes shifted geometry when revealed, causing fast drops to select a Row. Keeping stable lanes fixed the observed targeting issue, but the user has not approved permanent prototype lanes or the band height. Hover appearance was not captured as a verified screenshot; the saved image shows the resting lanes.
2. Preserve the deliberate index/working-tree distinction. The index has 15 changed paths representing phase one and its follow-up. Phase-two edits are unstaged. Other unstaged work includes startup timing, dependency/lockfile changes, README changes, and an untracked admin app. Do not reset, stash, broadly stage, commit, or push unrelated work. The user's last implementation request did not authorize a phase-two commit or PR.
3. Resolve the terminal issue from actual evidence. `list_threads` reports this chat's cwd as the primary checkout already, and that checkout is on main. A separate detached worktree attachment still exists. **An attachment is not proof of the chat's current cwd or the terminal's cwd.** `read_thread_terminal` most recently reported no attached app terminal, so no default-directory repair has been confirmed.
4. Earlier advice to find **Hand off → Local** was wrong for the user's visible UI; they could not find that control. Do not repeat it as a verified fix. The handoff tool cannot move its calling chat, and computer use of `com.openai.codex` is blocked. `open_in_codex` terminal requests returned `queued`; subsequent reads still found no terminal. The actual terminal-opening target remains unresolved. Do not change shell startup files, rewrite app state, or move code again to mask this UI issue.
5. Keep New Stack column redistribution deferred until the user explicitly advances to phase three. The user rejected archive-based cleanup and repeated questions about cosmetic leftovers. Make scoped decisions; ask only about material behavior that genuinely needs their choice.

## Suggested skills

1. `$prototype` — continue the existing Section-band exploration without adding unrelated variants or production features.
2. `$implement` — use if the user approves integration or requests further implementation.
3. `$use-morgs32-wiki-patterns` — follow local TypeScript, React, and ownership constraints.
4. `$nx-workspace` and `$nx-run-tasks` — inspect current targets and run scoped checks through Nx.
5. `$openai-docs` — if continuing app/terminal troubleshooting; verify the user's actual interface instead of assuming documentation matches it.

Before edits, run installed Intent discovery and load applicable local skills. The latest catalog contained SDK/browser/React 32.0.1 guidance. Use the existing mock session; do not require sign-in for this prototype. Avoid held raw-CDP drag gestures: one stalled for roughly 1,000 seconds. Atomic native `tab.drag` worked.

## Pointers

1. [Root instructions](../../AGENTS.md)
2. [App instructions](../../apps/app/AGENTS.md)
3. [WallEditor](../../apps/app/modules/lib/wall/WallEditor.tsx)
4. [Wall Editor stories](../../apps/app/components/WallEditor.stories.tsx)
5. [Module documentation](../../apps/app/modules/README.md)
6. [Layout conventions](../brick-layout-conventions.md)
7. [Pragmatic research](../research/pragmatic-tree-drop-behavior.md)
8. [Existing insertion schema](../../apps/zerospin/src/aggregates/user/layout/wallTargetSchemas.ts)
9. [Closed QRK PR #17](https://github.com/morgs32/qrk.sh/pull/17)
10. [Related Zerospin PR #59](https://github.com/morgs32/zerospin/pull/59)
11. [Running prototype](http://127.0.0.1:10044/iframe.html?id=app-studio-wall-editor--new-section-prototype&viewMode=story)
12. [Resting prototype screenshot](/private/tmp/qrk-new-section-prototype.jpg)

## Open decisions

1. Whether the user wants to retain visible insertion lanes, change their activation, or adjust the temporary band's height/appearance. The agent's geometry workaround is not a settled product decision.
2. Whether and when to integrate phase two into ordinary editor behavior. Prototype scope alone does not authorize enabling it in production.
3. How to correct the user's terminal-opening target. The repository is already on main; the app's actual terminal state has not been established.
