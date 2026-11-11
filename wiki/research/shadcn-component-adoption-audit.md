# shadcn Base UI adoption across QRK

Source audit of the 2026-11-11 checkout, including the working-tree changes.
It covers the authored components and their reachable UI in Bricks, App, Web,
and the Admin shell, with Storybook examples identified separately. The scan
covered React source, primitive imports, native interactive JSX, registry
configuration, and the callers of local wrappers. It found no authored Radix
imports in these four surfaces and no Radix package entry in the current
lockfile. This was a source review. Visual parity and runtime interactions
still need verification for any future migration.

A locally copied or adapted registry component counts as shadcn adoption.
Direct Base UI composition already gets the primitive's interaction behavior.
The remaining question in those cases is whether adopting the registry shell
would remove meaningful local markup or styling. Plain labels, links, and
layout are normal in registry components too. App and Web still declare
`style: "new-york"`, so their configuration alone is insufficient to identify
which base a checked-in component actually uses. [shadcn registry structure](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/README.md) · [Component index](https://ui.shadcn.com/docs/components) · [App config](../../apps/app/components.json) · [Web config](../../apps/web/components.json) · [Lockfile](../../pnpm-lock.yaml)

## Bricks

1. **Shared Button and InputGroupButton.** The shared button uses Base UI's
   `useRender` with native button props and an `asChild` shim. The input action
   composes that wrapper and hard-codes a 24px size. The Base UI registry
   versions fit both. Plan 069 already inventories the three 24px input
   actions and the App Wall drag handle. [Button](../../apps/bricks/src/react/button.tsx#L35) · [InputGroupButton](../../apps/bricks/src/react/input-group.tsx#L59) · [Plan 069](../plans/069-plan-bricks-shadcn-buttons.md) · [shadcn Button source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/button.tsx) · [shadcn Input Group source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/input-group.tsx)
2. **Shared Input.** Bricks renders a native input with local styles, 28px
   dimensions, and explicit autocomplete/password-manager settings. The Base UI
   registry's Input uses `@base-ui/react/input` and is the closest shared
   replacement. It reaches `TextInput` and input-group controls, and is a
   Bricks package export. Verify text, file, and search inputs plus ref/prop
   composition in the numeric field and Map Place before standardizing it.
   [Bricks Input](../../apps/bricks/src/react/Input.tsx#L5) · [TextInput](../../apps/bricks/src/react/TextInput.tsx#L40) · [InputGroupInput](../../apps/bricks/src/react/input-group.tsx#L23) · [Bricks exports](../../apps/bricks/package.json) · [shadcn Input source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/input.tsx)
3. **Fit, Map Place, Align, and Image Zoom already use the right primitives.**
   Fit has Base UI Select with indicators and scroll arrows. Map Place uses
   Base UI Combobox with the shared input group and provider-filtered results.
   Align uses Base UI Radio Group and Radio with icon segments. Image Zoom uses
   Base UI Slider, inside a crop editor composed from Base UI Dialog and Tabs.
   Registry parts can replace generic chrome where they remove duplication.
   Preserve Fit's alignment, Map Place's asynchronous lookup and attribution,
   Align's segment design, and the crop editor's state and upload behavior.
   The old audit predates these changes. [Fit](../../apps/bricks/src/react/DropdownInput.tsx#L20) · [Map Place](../../apps/bricks/src/mapPlace/react/GooglePlaceLookup.tsx#L165) · [Align](../../apps/bricks/src/react/ButtonGroupInput.tsx#L25) · [Image editor](../../apps/bricks/src/react/ImageUploadInput.tsx#L103) · [Image Zoom](../../apps/bricks/src/react/ImageUploadInput.tsx#L262) · [Plan 066](../plans/066-plan-brick-input-patterns.md) · [shadcn Select](https://ui.shadcn.com/docs/components/base/select) · [Combobox](https://ui.shadcn.com/docs/components/base/combobox) · [Radio Group](https://ui.shadcn.com/docs/components/base/radio-group) · [Dialog](https://ui.shadcn.com/docs/components/base/dialog) · [Slider](https://ui.shadcn.com/docs/components/base/slider)
4. **Several Bricks controls already follow the registry composition.** Field,
   Input Group, Popover, Tabs, and Skeleton are compact local adaptations.
   The current NumberInput work shares Field and InputGroup while Base UI
   Number Field handles numeric editing and stepping. Shadow already uses
   FieldError. The shadcn index has no first-party Number Field, hex picker,
   paired coordinate input, or compound shadow/radius editor. Their controls
   can reuse the registry parts without replacing the editor logic.
   [Field](../../apps/bricks/src/react/field.tsx) · [Input Group](../../apps/bricks/src/react/input-group.tsx) · [Popover](../../apps/bricks/src/react/popover.tsx) · [Tabs](../../apps/bricks/src/react/tabs.tsx) · [Skeleton](../../apps/bricks/src/react/skeleton.tsx) · [NumberInput](../../apps/bricks/src/react/NumberInput.tsx) · [ShadowInput](../../apps/bricks/src/react/ShadowInput.tsx) · [Base UI Number Field](https://base-ui.com/react/components/number-field) · [shadcn component index](https://ui.shadcn.com/docs/components)
5. **GitHub Profile avatar and Article save feedback have direct matches.**
   The avatar manages its own failed-image state and initials fallback.
   shadcn Avatar already provides image and fallback parts. Check the
   existing Unpic image behavior and accessible name if adopting it. The
   Article save failure could use Alert for its heading and message while
   retaining the editor's Retry and dismiss actions. Article title and
   subtitle use native textareas for borderless, autoresizing document
   editing. The registry Textarea is an optional styling fit there.
   [GitHub Profile avatar](../../apps/bricks/src/githubProfile/react/GitHubProfile/components/AvatarAndUsername.tsx#L11-L33) · [Article feedback and textareas](../../apps/bricks/src/article/react/ArticleEditor.tsx#L209-L260) · [Editor CSS](../../apps/bricks/src/article/react/article-editor.css#L126-L159) · [Avatar](https://ui.shadcn.com/docs/components/base/avatar) · [Alert](https://ui.shadcn.com/docs/components/base/alert) · [Textarea](https://ui.shadcn.com/docs/components/base/textarea)
6. **Lower-priority and Storybook-only matches.** The module preview's Cards
   checkbox and spec generation failure can use Checkbox and Alert.
   Native dividers, loading glyphs, and the missing-module state have
   Separator, Spinner, and Empty equivalents. Fit, Align, and the compound
   dimension editors currently mount in the Catalog, Docs, and scripted
   stories. Image crop, Map Place, and the swatch/hex picker have live forms.
   [Cards checkbox](../../apps/bricks/.storybook/BrickStory.tsx#L83-L90) · [Spec error](../../apps/bricks/.storybook/BrickStory.tsx#L238-L244) · [Sidebar divider](../../apps/bricks/src/react/StudioSidebar.tsx#L44) · [Lookup loading](../../apps/bricks/src/mapPlace/react/GooglePlaceLookup.tsx#L200) · [Missing-module state](../../apps/bricks/src/react/makeModuleView.tsx#L139-L149) · [Image form](../../apps/bricks/src/image/react/ImageForm.tsx#L68) · [Swatch form](../../apps/bricks/src/swatchAndIcon/react/SwatchAndIconForm.tsx#L55) · [Checkbox](https://ui.shadcn.com/docs/components/base/checkbox) · [Separator](https://ui.shadcn.com/docs/components/base/separator) · [Spinner](https://ui.shadcn.com/docs/components/base/spinner) · [Empty](https://ui.shadcn.com/docs/components/base/empty)
7. **Product compositions own their interaction.** The inspector sidebar
   lays out editor fields. The Brick details trigger arbitrates nested links,
   controls, editor activation, and published rendering. Provider tiles,
   the Meowdown editor, map, crop surface, icon grid and pagination, and
   the JSON Render layout contract have product-specific responsibilities.
   Use registry controls within them where a part fits.
   [StudioSidebar](../../apps/bricks/src/react/StudioSidebar.tsx#L17-L52) · [BrickDetailsTrigger](../../apps/bricks/src/react/BrickDetailsTrigger.tsx#L12-L55) · [Layout conventions](../brick-layout-conventions.md) · [shadcn Sidebar](https://ui.shadcn.com/docs/components/base/sidebar)

## App

1. **Wall action menus.** Brick actions, Stack insertion, and Row alignment
   each assemble Base UI Menu directly and use App's compact menu CSS.
   shadcn Dropdown Menu covers ordinary and radio items on the same
   primitive. A migration must preserve the Wall's positioner stacking
   layer, alignment, disabled insertion state, radio state, focus return,
   and command callbacks. The registry's default positioner uses `z-50`
   while the Wall uses `z-[90]`. [Brick actions](../../apps/app/components/WallEditor/WallPlacement.tsx#L37-L63) · [Stack insertion](../../apps/app/components/WallEditor/WallEditor.tsx#L956-L1023) · [Row alignment](../../apps/app/components/WallEditor/WallEditor.tsx#L1290) · [Menu CSS](../../apps/app/modules/bricks.css#L229) · [shadcn Dropdown Menu source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/dropdown-menu.tsx)
2. **Delete Brick confirmation.** The Wall uses direct Base UI Dialog with
   its own backdrop and popup. shadcn Alert Dialog fits the destructive
   confirmation. Preserve its current stacking, the focus fallback when
   deletion removes the trigger, and closure after accepted deletion.
   [Delete confirmation](../../apps/app/components/WallEditor/WallEditor.tsx#L1403) · [shadcn Alert Dialog source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/alert-dialog.tsx)
3. **Site Settings and Publish Site controls.** Brick gap uses a native
   range input and fits Slider with the current 0–12 range, unit step, and
   pixel readout. Sticky navbar uses a native checkbox and fits Checkbox
   or the existing Switch used for Cards on the same screen. The Publish
   Site page picker uses a native checkbox inside its custom SiteTree.
   Use Checkbox for the selection control while preserving row labels,
   disabled root selection, and the tree structure. Hidden file inputs
   already sit behind App Buttons and own native picker behavior.
   [Site Settings controls](<../../apps/app/app/[username]/site/[siteId]/page/[pageId]/SiteSettings/SiteSettings.tsx#L199-L245>) · [SiteTree checkbox](../../apps/app/components/SiteTree.tsx#L137) · [Publish Site caller](<../../apps/app/app/[username]/site/[siteId]/page/[pageId]/PublishSiteDialog.tsx#L159>) · [Slider](https://ui.shadcn.com/docs/components/base/slider) · [Checkbox](https://ui.shadcn.com/docs/components/base/checkbox) · [Switch](https://ui.shadcn.com/docs/components/base/switch)
4. **Settings and creation field layout.** App has shared Input, Textarea,
   Label, and InputGroup. Its shared Input is an older shadcn-derived native
   input, so it has the same Base UI Input adoption opportunity as Bricks.
   Site Settings, Page Settings, and the dashboard
   Create Site dialog still compose parts of their labels, help, and errors
   individually. App's `FieldLabel` renders a help paragraph without
   associating it with its control. shadcn Field gives these forms a common
   layout. Preserve existing associations such as the Create Site slug's
   description and wire each help or error message to its control.
   [App Input](../../apps/app/components/ui/input.tsx#L5) · [FieldLabel](../../apps/app/components/ui/field-label.tsx#L9) · [Create Site](<../../apps/app/app/[username]/(dashboard)/page.tsx#L184-L249>) · [Page Settings](<../../apps/app/app/[username]/site/[siteId]/page/[pageId]/PageSettings/PageSettings.tsx>) · [shadcn Field](https://ui.shadcn.com/docs/components/base/field)
5. **App Button and toolbar actions.** App owns a separate shadcn-derived
   Button with the same `useRender`/native wrapper pattern as Bricks. Plan
   069 only switches the Bricks implementation. App's ToolbarButton also
   has independent native action-button branches and styles, with shared
   Tooltip and real TanStack links for navigation. A follow-up can share
   Button for actions and apply button variant styles to the links. Wall
   Preview Toolbar declares `role="toolbar"` while relying on normal Tab
   navigation. If it is meant to behave as a composite toolbar, Base UI
   Toolbar supplies arrow-key navigation. shadcn Button Group is a visual
   grouping component. [App Button](../../apps/app/components/ui/button.tsx#L37) · [ToolbarButton](<../../apps/app/app/[username]/site/[siteId]/Toolbars/ToolbarButton.tsx#L64-L85>) · [WallPreviewToolbar](<../../apps/app/app/[username]/site/[siteId]/Toolbars/WallPreviewToolbar.tsx#L15>) · [Base UI Button](https://base-ui.com/react/components/button) · [Base UI Toolbar](https://base-ui.com/react/components/toolbar) · [shadcn Button Group](https://ui.shadcn.com/docs/components/base/button-group)
6. **Existing wrappers, dormant copies, and isolated screens.** Dashboard
   Create Site and Publish Site already use App Dialog. App Select, Switch,
   Tooltip, and the local Input, Textarea, Card, Skeleton, and Sonner
   wrappers already follow the registry pattern. App's InputGroupButton
   already has the four registry-style sizes and has no authored caller.
   The older module-local Card, Sonner, Switch, Toggle, Toggle Group, and
   Tooltip copies had no
   outside caller in the authored source scan. The standalone recovery
   screen's native disclosure and action buttons, decorative toolbar
   divider, and Storybook fixture controls are lower-priority matches for
   Collapsible, Button, Separator, Checkbox, or Slider. WorkspaceSidebar
   is a route-owned editor region and handles focus restoration. Wall
   resizing, drop indicators, and the preview filmstrip own QRK layout
   interactions.
   [App UI](../../apps/app/components/ui) · [App InputGroupButton](../../apps/app/components/ui/input-group.tsx#L82-L109) · [Module-local UI](../../apps/app/modules/components/ui) · [Recovery screen](../../apps/app/app/error.tsx#L108-L180) · [WorkspaceSidebar](<../../apps/app/app/[username]/site/[siteId]/page/[pageId]/WorkspaceSidebar.tsx>) · [Collapsible](https://ui.shadcn.com/docs/components/base/collapsible) · [Separator](https://ui.shadcn.com/docs/components/base/separator)

## Web

1. **Web Button is a Storybook-only migration candidate.** The local
   shadcn-derived Button uses `useRender` and `asChild`; all current callers
   are Button Links examples. Those links need native anchor semantics.
   A refresh can apply the upstream `buttonVariants` to Next Link. The
   branded `UnderlinedLink` is already a separate anchor pattern in live
   Home, legal pages, and the App dashboard.
   [Web Button](../../apps/web/components/ui/button.tsx#L37-L55) · [Button Links story](../../apps/web/components/ui/button.stories.tsx#L6-L43) · [UnderlinedLink](../../apps/web/components/UnderlinedLink.tsx#L7-L37) · [Base UI link guidance](https://base-ui.com/react/components/button#rendering-links-as-buttons)
2. **Live Web UI is mostly links, branded content, and vendor components.**
   Clerk owns sign-in and sign-up. OrderedOutline is document hash navigation.
   The development sign-in handler serves standalone HTML with a Retry
   button. The marketing pixel wordmark generates focusable links all
   pointing to `#`. That is a semantics issue to address in the wordmark
   itself. [Clerk sign-in route](<../../apps/web/app/sign-in/[[...sign-in]]/page.tsx>) · [Clerk SignIn](https://clerk.com/docs/nextjs/reference/components/authentication/sign-in) · [OrderedOutline](../../apps/web/library/OrderedOutline.tsx#L27-L70) · [Development sign-in](../../apps/web/dev/handleDevelopmentSignIn.ts#L47-L75) · [Home pixel grid](<../../apps/web/app/(home)/page.tsx#L125-L136>)

## Admin

The local shell renders `SystemDiagrams` from `@zerospin/system-diagrams`
and maps the current route to its selected section. The shell has no local
form, dialog, menu, or button implementation. Any diagram controls belong
to the upstream package. [Admin entrypoint](../../apps/admin/src/main.tsx#L1) · [Admin dependencies](../../apps/admin/package.json)

## Follow-up order

1. Finish the shared Bricks buttons in [Plan 069](../plans/069-plan-bricks-shadcn-buttons.md).
   Follow with [Plan 071 — Bricks Input](../plans/071-plan-bricks-base-ui-input.md),
   [Plan 072 — Bricks editor controls](../plans/072-plan-bricks-registry-editor-controls.md),
   and [Plan 073 — Bricks feedback and display](../plans/073-plan-bricks-feedback-and-display-components.md).
   The three plans list the files and callers affected by each change.
2. In App, use [Plan 074 — Wall overlays](../plans/074-plan-app-wall-shadcn-overlays.md)
   for the menus and delete confirmation, [Plan 075 — Settings fields](../plans/075-plan-app-settings-shadcn-fields.md)
   for forms and publish selection, and [Plan 076 — App Button and toolbars](../plans/076-plan-app-shadcn-buttons-and-toolbars.md)
   for the separate App Button and toolbar semantics.
3. Reconcile file paths with Plan 068 if its source move lands first.
   Where plans share a file, apply the earlier numbered change first and
   preserve its behavior in the later change.
4. Before adding another shared control, check the existing host and Bricks
   exports, then the official Base UI registry. Record the reason at the
   call site or in its plan when a local composition is needed. The repo
   already requires this order. [QRK UI rule](../../AGENTS.md#L56) · [shadcn Base UI registry](https://github.com/shadcn-ui/ui/tree/main/apps/v4/registry/bases/base/ui)
