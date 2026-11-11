# Plan 074 — Adopt shadcn overlays for Wall actions

Use shadcn Base UI Dropdown Menu for the three Wall menus and Alert Dialog
for Delete Brick. Preserve QRK's overlay stacking, compact sizes, command
logic, and focus return. [Adoption audit](../research/shadcn-component-adoption-audit.md#app)

## Implementation and call sites

1. Adopt the shadcn Dropdown Menu parts in `components/ui/dropdown-menu.tsx`.
   Preserve the registry's default stack level and give Content an optional
   `positionerClassName` string so the Wall can set `z-[90]` on the
   positioner. Carry over the Wall menu's compact styling at the calls.
   Remove the old `.wall-action-menu` rules after all three callers move.
   [Registry source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/dropdown-menu.tsx) · [Wall styles](../../apps/app/modules/bricks.css)
2. Convert the [Brick action menu](../../apps/app/components/WallEditor/WallPlacement.tsx#L42-L70)
   to Dropdown Menu with bottom/end and zero offset. Keep the menu item
   that initiates deletion, trigger ref, and focus handoff to the confirmation.
3. Convert [Stack Insert left/right](../../apps/app/components/WallEditor/WallEditor.tsx#L970-L1032)
   to Dropdown Menu with bottom/start and zero offset. Keep both disabled
   insertion rules and the command payloads. Convert
   [Row alignment](../../apps/app/components/WallEditor/WallEditor.tsx#L1297-L1348)
   with the same positioning and the registry Radio Group and Radio Item,
   keeping the selected value, check indication, and alignment command.
4. Adopt shadcn Alert Dialog in `components/ui/alert-dialog.tsx` for
   [Delete Brick](../../apps/app/components/WallEditor/WallEditor.tsx#L1406-L1451).
   Keep the current controlled open state, title and description, backdrop
   and popup layers of 100 and 101, and final focus callback. Cancel or
   Escape dismisses. Use Alert Dialog's outside-press protection. Focus
   Cancel on open. Keep Delete as a plain destructive Button that only
   closes after the existing command accepts. If its trigger is removed,
   restore focus to the Wall after close as today.
   [Alert Dialog registry](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/alert-dialog.tsx)

```tsx
// Set the Wall overlay layer on the positioner around the menu popup.
<DropdownMenuContent side="bottom" align="end" sideOffset={0} positionerClassName="z-[90]">
  {/* The existing Brick action remains a DropdownMenuItem. */}
</DropdownMenuContent>
```

## Verification

1. Typecheck App and build its Storybook through Nx. Run the existing
   [Stack Insertion](../../apps/app/components/WallEditor/Scripted/StackInsertion.stories.tsx),
   [Sticky Actions](../../apps/app/components/WallEditor/Scripted/StickyActions.stories.tsx),
   and [Wall Placement](../../apps/app/components/WallEditor/Scripted/WallPlacement.stories.tsx)
   stories. Confirm menu triggers, insertion guards, and overlay visibility.
2. The user checks mouse and keyboard navigation in all three menus, Row
   alignment's selected item, and Delete Brick's Cancel, Escape, backdrop
   behavior, and focus return. Check that the dialog remains open on a
   rejected delete and closes on acceptance. Record results and archive
   after verification.

`+` means create and `~` means modify.

```text
qrk.sh/
├── apps/app/
│   ├── components/
│   │   ├── ui/
│   │   │   ├── + alert-dialog.tsx
│   │   │   └── + dropdown-menu.tsx
│   │   └── WallEditor/
│   │       ├── ~ WallEditor.tsx
│   │       └── ~ WallPlacement.tsx
│   └── modules/
│       └── ~ bricks.css
└── wiki/plans/
    └── ~ 074-plan-app-wall-shadcn-overlays.md
```

## Implementation status

App typecheck and Storybook build passed. Scripted Sticky Actions and Wall Placement passed. A headless probe verified the Delete Brick alert role, initial Cancel focus, layer order, Escape dismissal, and trigger focus return. Scripted Stack Insertion fails its existing 360px section overflow assertion (362px scroll width versus a 361px limit). An isolated comparison build with the previous Wall overlay code and both previous Button implementations reproduced the same values.

## Remaining work

1. User verification. Check the three menus and the Delete Brick backdrop, rejection and acceptance paths. Track the pre-existing Stack Insertion geometry failure separately before treating the whole check as green.
2. Archive after verification.
