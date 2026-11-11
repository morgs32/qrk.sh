# Keyboard controls libraries

Research date: 2026-11-01. Scope: shadcn/ui and Atlassian keyboard support, using Escape-to-close on the Brick detail drawer as the concrete example. No runtime changes or dependencies were added.

## Findings

### shadcn/ui

shadcn supplies keyboard-aware components rather than a documented general-purpose hotkey manager. Its **Sheet** extends Dialog, and its Radix variant explicitly delegates its API to Radix Dialog. Radix handles Escape dismissal, controlled open state, modal or non-modal operation, and focus return to its trigger. The modal variant also traps focus. Therefore an existing Sheet/Dialog can provide Escape without adding a shortcut library. Sources: [shadcn Sheet](https://ui.shadcn.com/docs/components/radix/sheet), [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog).

**Command** is a search/action menu built on `cmdk`; it is useful for a command palette. **Kbd** displays keys. Neither component's documentation presents it as an application-wide shortcut registration and precedence system. Sources: [shadcn Command](https://ui.shadcn.com/docs/components/radix/command), [shadcn Kbd](https://ui.shadcn.com/docs/components/radix/kbd). This distinction is an interpretation of their documented roles, not a claim that no third-party shadcn registry offers hotkeys.

shadcn also documents a Base UI Sheet variant. Base UI Dialog supports non-modal operation, configurable pointer dismissal, and an `escape-key` reason in its controlled open-change callback. These are alternative primitive implementations, not a reason to introduce another primitive into QRK. Sources: [shadcn Base UI Sheet](https://ui.shadcn.com/docs/components/base/sheet), [Base UI Dialog](https://base-ui.com/react/components/dialog).

### Atlassian

Atlassian does have a keyboard shortcuts facility in its AUI documentation: `AJS.whenIType(...)` supports sequences and actions. However, the official page says it moved to the **atlassian-keyboard-shortcuts plugin**, identifies an Atlassian web-resource and AMD module, and marks the old AUI resource alias deprecated. That documents an Atlassian plugin integration, not a current standalone React hotkey package for QRK. Source: [AUI keyboard shortcuts](https://aui.atlassian.com/aui/latest/docs/keyboard-shortcuts.html).

Current Atlassian Design System components own their specific keyboard behavior. Modal Dialog calls its close callback on Escape; the option for disabling that behavior is deprecated. Navigation System offers its own optional sidebar shortcut and suppresses it while ADS modal dialogs are open. Tooltip can display shortcut keys but does not bind their action. Sources: [Modal Dialog API](https://atlassian.design/components/modal-dialog/code), [Navigation System API](https://atlassian.design/components/navigation-system/layout/code), [Tooltip API](https://atlassian.design/components/tooltip/code).

I did not establish an officially supported, general-purpose Atlaskit React shortcut manager from these public sources. This is a bounded finding; it does not establish that Atlassian has no internal keyboard infrastructure. No maintenance or deprecation claim is made about the moved plugin itself beyond what AUI documents.

### Dedicated React shortcut options

**TanStack Hotkeys** provides `@tanstack/react-hotkeys`, with `useHotkey`, chords, sequences, component-lifetime registration, and element targets. Its documented default input handling skips text-producing shortcuts while typing but allows Escape and Control/Meta commands. Sources: [React hotkeys guide](https://tanstack.com/hotkeys/latest/docs/framework/react/guides/hotkeys), [input defaults](https://tanstack.com/hotkeys/latest/docs/guides/sensible-defaults).

Its scoped providers address nested keyboard ownership: nested scopes take precedence; otherwise the most recently activated scope wins. Exclusive scopes suspend others, and scopes follow the React tree through portals. These mechanisms are relevant if the editor eventually needs coordinated drawer, palette, and canvas shortcuts. The documentation currently labels the library **v0**; evaluate the exact release before adoption. Source: [providers and scopes](https://tanstack.com/hotkeys/latest/docs/framework/react/guides/hotkeys-provider-and-scopes).

## QRK application

The current [Drawer](../../apps/app/components/Drawer/Drawer.tsx) is a custom animated surface with `role="dialog"` and manual return-focus tracking. It has no Escape handler and allows interaction with the editor behind it. The application already has a Radix-backed [Dialog](../../apps/app/components/ui/dialog.tsx). Local source inspection establishes these facts; the drawer's ARIA role alone does not install primitive behavior.

For this one dismissal behavior, a new application-wide hotkey dependency is not necessary. Preserve the non-modal interaction and connect Escape to the same route transition as the existing Close control. If adopting a dialog primitive later, explicitly preserve non-modal operation and outside-interaction behavior rather than accepting modal defaults. This is a recommendation, not an approved implementation.

Before implementation, define nested ownership: Escape should first dismiss an open child menu/popover, and a subsequent Escape should close Brick detail; typing in a form must not prevent dismissal. A general shortcut library can coordinate registered scopes, but it does not automatically coordinate arbitrary existing listeners or third-party overlays. Verify focus return, child-overlay precedence, route/search preservation, and unsaved-edit behavior in the actual editor.
