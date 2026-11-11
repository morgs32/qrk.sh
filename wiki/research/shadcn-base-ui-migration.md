# Moving QRK’s shadcn components to Base UI

Checked 2026-11-11 against the QRK checkout, the shadcn CLI and registry
documentation, and the primitive libraries’ APIs.

## How shadcn selects a base

- Base UI has been the default for new shadcn projects since July 2026.
  Existing projects keep their configured base. The CLI’s `init --base base`
  selects Base UI during initialization. `migrate radix` consolidates individual
  Radix imports into `radix-ui`. shadcn publishes a separate migration skill for
  porting existing Radix wrappers and their consumers. [Base UI default
  announcement](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default),
  [CLI reference](https://ui.shadcn.com/docs/cli),
  [official migration skill](https://github.com/shadcn-ui/ui/blob/main/skills/migrate-radix-to-base/SKILL.md).
- QRK App and Web use the legacy `new-york` style. The official skill identifies
  no `base-new-york` registry counterpart. For legacy styles, port the owned
  files in place, preserving their classes and updating selectors that depend on
  Radix attributes. A supported style such as `base-vega` would select Base UI
  for future named installs and also select a modern visual preset. Review that
  config choice independently of the source migration. Bricks currently has no
  `components.json` and can use Base UI with source copied or adapted from the
  registry. [App config](../../apps/app/components.json),
  [Web config](../../apps/web/components.json),
  [legacy style guidance](https://github.com/shadcn-ui/ui/blob/main/skills/migrate-radix-to-base/SKILL.md),
  [components.json reference](https://ui.shadcn.com/docs/components-json).
- The CLI supports read-only inspection through `info --json` and
  `add --dry-run`, `--diff`, and `--view`. Use the upstream Base UI
  component and its Radix counterpart as references for each port. In QRK,
  a broad `init`, `apply`, or `add --all --overwrite` would put customized
  wrappers, theme CSS, or registry choices at risk. Preserve existing package
  ownership and compare one component at a time. [CLI reference](https://ui.shadcn.com/docs/cli),
  [official migration strategy](https://github.com/shadcn-ui/ui/blob/main/skills/migrate-radix-to-base/SKILL.md),
  [monorepo installation routing](https://ui.shadcn.com/docs/monorepo).

## Breakpoint Previews

The Base UI shadcn registry already provides `TabsList variant="line"` with the
same wrapper names. Its trigger uses Base UI’s `Tab` and styles selection with
`data-active`. Its content uses `Panel`. Adapt those primitive and state
changes to the existing QRK styles. The registry’s raw source also includes
style placeholders such as `cn-tabs`, so use a resolved registry variant or
keep QRK’s existing styling. [shadcn Tabs docs](https://ui.shadcn.com/docs/components/base/tabs),
[shadcn Base UI Tabs source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/tabs.tsx),
[QRK Tabs wrapper](../../apps/bricks/src/react/tabs.tsx).

1. Pass `activateOnFocus` to the preview’s list. Radix activates automatically
   on arrow-key focus by default. Base UI moves focus and waits for Enter or
   Space by default. [Radix Tabs API](https://www.radix-ui.com/primitives/docs/components/tabs#root),
   [Base UI Tabs List API](https://base-ui.com/react/components/tabs#list).
2. Replace `forceMount` with `keepMounted` on Configure and Generate Spec.
   Base UI handles the inactive panel’s visibility. Remove the old Radix
   inactive-state selector. Verify that the Configure form retains its
   draft and that inactive controls cannot receive focus.
   [Base UI Tabs Panel API](https://base-ui.com/react/components/tabs#panel),
   [Base UI Panel source](https://github.com/mui/base-ui/blob/master/packages/react/src/tabs/panel/TabsPanel.tsx),
   [QRK BrickStory](../../apps/bricks/.storybook/BrickStory.tsx).
3. Keep the preview’s existing initial tab selection and its 320px
   StudioSidebar layout. Check arrow keys, pointer selection, switching back to
   an unsaved Configure form, and Generate Spec as the sole tab when there is no
   form. [QRK BrickStory](../../apps/bricks/.storybook/BrickStory.tsx),
   [StudioSidebar](../../apps/bricks/src/react/StudioSidebar.tsx).

## QRK migration inventory

Before migration, the checkout had 21 authored Radix import sites across three
packages. This counts source files, regardless of production bundle reachability.

- **Bricks (7).** Tabs, ImageUploadInput (Dialog and Tabs), ButtonGroupInput
  (Toggle Group), DropdownInput (Select), RadiusInput and SwatchPopover
  (Popover), and the shared button (Slot). ImageUploadInput has in-progress
  crop work. Coordinate that file with its owner. Bricks already declares
  `@base-ui/react` as a dev dependency. [Bricks React sources](../../apps/bricks/src/react),
  [Bricks manifest](../../apps/bricks/package.json).
- **App (12).** Button, badge, dialog, label, popover, radio group, select,
  separator, switch, tooltip, and the module toggle and toggle-group wrappers.
  App already declares `@base-ui/react` as a dev dependency and uses Base UI
  in parts of the Wall editor and module controls. [App UI](../../apps/app/components/ui),
  [module UI](../../apps/app/modules/components/ui),
  [App manifest](../../apps/app/package.json).
- **Web (2).** The shared button and UnderlinedLink both use Radix Slot.
  Web has no direct Base UI dependency. [Web button](../../apps/web/components/ui/button.tsx),
  [UnderlinedLink](../../apps/web/components/UnderlinedLink.tsx),
  [Web manifest](../../apps/web/package.json).

## Implementation implications

1. Port shared primitives and their callers together. Use Base UI’s Button
   primitive for button composition, `render` where a primitive delegates
   rendering, and native elements for simple controls such as labels.
   Base UI expects a composed custom component to forward the received props
   and ref to its DOM element. Preserve link semantics when converting Slot.
   [shadcn primitive mappings](https://github.com/shadcn-ui/ui/blob/main/skills/migrate-radix-to-base/universal-patterns.md),
   [Base UI composition](https://base-ui.com/react/handbook/composition),
   [Base UI useRender](https://base-ui.com/react/utils/use-render).
2. Check behavior at consumer boundaries. For Select, use Base UI’s
   `Portal → Positioner → Popup` structure and turn off
   `alignItemWithTrigger` where the current popup sits beside its trigger.
   Base UI’s toggle group holds an array even for single selection. Verify
   popup positioning, Escape and focus return, keyboard navigation, selected
   labels, and existing single-selection behavior. [Base UI Select](https://base-ui.com/react/components/select#positioning),
   [Base UI Toggle Group](https://base-ui.com/react/components/toggle-group),
   [shadcn overlay migration reference](https://github.com/shadcn-ui/ui/blob/main/skills/migrate-radix-to-base/overlays.md).
3. Verify the authored source and direct dependency sweep independently of
   the transitive graph. Declare Base UI under runtime dependencies in packages
   whose shipped code imports it, and remove direct Radix packages once their
   final consumers are ported. Typecheck and build the affected packages and
   Storybooks, then use `pnpm -r why` for remaining Radix packages. The final
   transitive path ran from `@zerospin/cli` through `@zerospin/studio@43.1.2`
   to `@radix-ui/react-slot@1.5.0`. Zerospin `43.1.3` moved the Studio button
   to Base UI. QRK adopted that release and verified that its frozen lockfile
   and installed dependency graph have zero Radix packages.
   [Official migration verification](https://github.com/shadcn-ui/ui/blob/main/skills/migrate-radix-to-base/SKILL.md),
   [workspace lockfile](../../pnpm-lock.yaml).
