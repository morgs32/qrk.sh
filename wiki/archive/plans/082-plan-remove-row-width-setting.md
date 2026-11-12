# 082 — Remove Row width setting

**Status:** Implemented. The user performs manual verification.

Rows size their Brick groups automatically from Placement width weights and Brick minimums. Saved Row preferred widths no longer affect sizing. Brick dividers and Row alignment remain available.

## Implementation

1. Remove the outer width grip, its gesture, draft, readout, command submission, and styles. Retain the editor session binding so previously staged commands can replay and finish.
2. Use automatic sizing for the editor, insertion previews, and Web WallViewer. Retain historical Row-width fields, commands, snapshot builders, and registered releases for replay.
3. Ignore only Row preferred-width differences when comparing saved and published Page content.
4. Update the layout conventions and glossary after implementation. Create an ADR only if the implemented decision is hard to reverse, surprising without context, and the result of a real trade-off.

```ts
// 1. A 480px Brick in a 720px Stack occupies 480px, even if the Row saved 600px.
// 2. Its Placement weight and minimum still govern its width in a narrower Stack.
// 3. Alignment positions the resulting group within the unused Stack space.
```

## Verification

1. Check single and multiple Brick allocation, narrower Stacks, minimums, legacy saved widths, insertion previews, divider resizing, and alignment.
2. Check width-only snapshot differences do not enable Publish Updates, while content and alignment changes do.
3. Run the App and Web builds and Zerospin tests through Nx. The user performs manual verification.

## Planned files

`+` creates a file and `~` modifies one. Focused tests or stories may also change.

```text
qrk.sh/
├── apps/
│   ├── app/
│   │   ├── components/WallEditor/~ {WallEditor.tsx, useWallResize.ts, makeWallLayoutView.ts}
│   │   ├── modules/~ bricks.css
│   │   ├── zerospin/~ userSessionDefinition.ts
│   │   └── app/[username]/site/[siteId]/page/[pageId]/(sidebar)/~ layout.tsx
│   ├── web/library/~ {WallViewer.tsx, WallViewer.stories.tsx}
│   └── zerospin/src/aggregates/user/layout/~ wallSizing.ts
└── wiki/
    ├── ~ {brick-layout-conventions.md, glossary.md}
    └── plans/+ 082-plan-remove-row-width-setting.md
```

## Remaining work

None. The user performs manual verification on their own time.

## Outcome

1. Zerospin tests passed, including the automatic Row allocation cases. The App build passed. The Web build passed through Nx with Webpack. Its default Turbopack build failed because its worker could not bind a port in this environment.
2. A focused check of the publish comparison passed for Row-width-only differences, alignment changes, and unrelated content. The Web Storybook fixture contains assertions for historical widths, but its play function was not run.
3. An additional App typecheck reported an existing mismatch between the in-progress Image Carousel model and the V5 snapshot builder. The App build passed without that typecheck.
4. The session retains the historical Row-width contract because removing it can prevent pending local commands from replaying. The editor no longer submits that command.
