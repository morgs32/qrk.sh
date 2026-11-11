# Brick delete confirmation focus

The menu trigger ref is live. Commit `4340ce1eab` introduced it on November 11,
2026, with the Brick actions menu. Choosing **Delete brick** closes the menu and
opens a single controlled confirmation in WallEditor. The menu item is transient,
so WallPlacement passes the persistent **Brick actions** button as the return
target. Cancel or Escape restores focus there if it is still connected. A
successful delete clears that target and moves focus to the Wall when the dialog
finishes closing. [WallPlacement](../../apps/app/components/WallEditor/WallPlacement.tsx#L22)
· [WallEditor](../../apps/app/components/WallEditor/WallEditor.tsx#L1372)
· [Base UI Menu](https://base-ui.com/react/components/menu)
· [WAI-ARIA dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/#keyboard-interaction)

## Why TypeScript rejects the ref

The installed Base UI 1.6.0 declaration combines
`RefAttributes<HTMLElement>` with props inherited from
`BaseUIComponentProps<'button', …>`. Its shared type uses
`ComponentPropsWithRef`, so the inherited props also carry the native
`HTMLButtonElement` ref type. QRK uses the default button and supplies no
`render` override. The ref at this call site can use the actual element type.
The downstream callback and dialog can still accept an `HTMLElement`.
[Base UI Menu Trigger](https://base-ui.com/react/components/menu#trigger)
· [Base UI Dialog Popup](https://base-ui.com/react/components/dialog#popup)

Local declarations examined under `apps/app/node_modules/@base-ui/react`
were `menu/trigger/MenuTrigger.d.ts` and `internals/types.d.ts`.

```tsx
const menuTrigger = useRef<HTMLButtonElement>(null);
```

The full App TypeScript check passed with that single substitution in memory.
The research changed no application code.

## Can the handoff go away?

Base UI's default dialog focus restoration uses the dialog's own trigger or the
previously focused element. The shared confirmation has no `Dialog.Trigger`,
and the previously focused element can be the disappearing menu item. The
explicit return target captures which Brick opened the confirmation. Keep that
handoff and narrow the local ref type. This preserves a predictable return path
without changing dialog ownership or the delete command.
[WallEditor](../../apps/app/components/WallEditor/WallEditor.tsx#L1372)
· [Base UI Dialog `finalFocus`](https://base-ui.com/react/components/dialog#popup)
