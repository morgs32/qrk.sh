# Brick preview click dismissal

Researched 2026-11-10 for deselecting a Brick from empty preview space. The
preview scroll surface contains the Wall, preview chrome, and gray gutters.
The drawer and floating toolbar are DOM siblings. Brick Details selection
comes from the route, and the Close action navigates to the Page with the
current breakpoint and `resetScroll: false`. [Page layout](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/layout.tsx),
[PagePreview](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/PagePreview.tsx),
[drawer layout](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/%28drawer%29/layout.tsx).

## React and DOM delegation

Use an ordinary bubbling `onClick` on the existing preview scroll element.
Child click handlers run first and can stop propagation. A handler there
receives clicks on nested empty Rows and chrome as well as direct clicks on
the scroll element. `target === currentTarget` would cover only direct
clicks. React Flow offers a similar canvas interaction through `onPaneClick`
and handles its own selection in the Pane component. [React event propagation](https://react.dev/learn/responding-to-events#event-propagation),
[React Flow Pane API](https://reactflow.dev/api-reference/react-flow#pane-events),
[React Flow Pane source](https://github.com/xyflow/xyflow/blob/main/packages/react/src/container/Pane/index.tsx).

Check `currentTarget.contains(target)` before classifying the click. React
dispatches portal events through the React tree, and PagePreview already
portals Brick form content to the drawer. Use `target.closest(selector)` to
find a control or Brick surface around a clicked icon or nested element.
Native `composedPath()` exposes the browser's dispatch path and can help
when a component uses shadow DOM. For the current preview and portal
structure, DOM containment supplies the boundary. [React portals](https://react.dev/reference/react-dom/createPortal#caveats),
[DOM contains](https://dom.spec.whatwg.org/#dom-node-contains),
[DOM closest](https://dom.spec.whatwg.org/#dom-element-closest),
[DOM composedPath](https://dom.spec.whatwg.org/#dom-event-composedpath),
[PagePreview portal](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/PagePreview.tsx).

Use a completed `click` for dismissal. A `pointerdown` can begin a resize,
drag, or text-selection gesture. A completed click can still target the
common ancestor of different press and release targets when the pointer is
uncaptured. If that ancestor can look like empty space, use a scoped
`pointerdown` record to reject a gesture that started on a Brick or
control. If the browser dispatched the release under pointer capture, the
spec assigns the click to that captured target. [W3C click dispatch rules](https://www.w3.org/TR/pointerevents3/#event-dispatch),
[Floating UI drag guard](https://github.com/floating-ui/floating-ui/blob/master/packages/react/src/hooks/useDismiss.ts).

## Packages

- **`delegate-it`** provides native selector-based event delegation with a
  configurable base element and a matched `delegateTarget`. It fits when
  several descendants share a selector-based action. The preview has one
  React owner and a product-specific background predicate, so its existing
  `onClick` can express the same boundary directly. [delegate-it API](https://github.com/fregante/delegate-it#api),
  [React event propagation](https://react.dev/learn/responding-to-events#event-propagation).
- **`@floating-ui/react` `useDismiss`** supports an `outsidePress` predicate
  and completed clicks through `outsidePressEvent: "click"`. Its default is
  `pointerdown`. It can coordinate outside dismissal across a
  `FloatingTree`; that setting applies to registered floating elements.
  QRK would still supply the preview boundary and inert-target predicate.
  [Floating UI useDismiss](https://floating-ui.com/docs/usedismiss).
- **Radix DismissableLayer** tracks dismissible overlays, recognizes branch
  elements, and dispatches preventable pointer- and focus-outside events.
  Current upstream source also supports deferring a primary outside press
  to click. Use the behavior documented for the installed version when
  building on it. Radix `Slot` composes handlers on a single element with
  the child first. It addresses a different part of the problem than
  bubbling up a preview subtree. [DismissableLayer source](https://github.com/radix-ui/primitives/blob/main/packages/react/dismissable-layer/src/dismissable-layer.tsx),
  [Radix Popover API](https://www.radix-ui.com/primitives/docs/components/popover#content),
  [Radix Slot handler composition](https://www.radix-ui.com/primitives/docs/utilities/slot#event-handlers).
- **Base UI Drawer** is available in App's existing `@base-ui/react`
  dependency. It supports nonmodal operation, disabling pointer dismissal,
  and an `outside-press` reason with the original event and a cancel
  callback. Using it here would still require the preview target predicate
  and a migration of QRK's existing drawer focus and animation lifecycle.
  [Base UI Drawer API](https://base-ui.com/react/components/drawer#root),
  [App dependencies](../../apps/app/package.json),
  [QRK Drawer](../../apps/app/modules/lib/Drawer.tsx).
- **React Aria `useInteractOutside`** tracks the press origin and then checks
  the completed click. Its pointer-capable implementation uses capture
  listeners on the element's owner document and checks containment against
  a ref. **Mantine `useClickOutside`** accepts an event list and excluded
  nodes. Its defaults are `mousedown` and `touchstart`, and its
  implementation checks the native event path. Both give outside-ref
  detection and leave QRK's preview-area rule to the caller. [React Aria source](https://github.com/adobe/react-spectrum/blob/main/packages/react-aria/src/interactions/useInteractOutside.ts),
  [Mantine API](https://mantine.dev/hooks/use-click-outside/#api),
  [Mantine source](https://github.com/mantinedev/mantine/blob/master/packages/%40mantine/hooks/src/use-click-outside/use-click-outside.ts).

## Implications for the plan

Keep the click predicate at the preview boundary and reuse the route
transition used by Close. The predicate should use the inner
`.wall-placement-content` boundary so that the half-gap padding outside it
still deselects. Exempt the Stack tag, Row control, resize grips, and
interactive descendants. Preserve the existing Brick click conventions
for modified clicks, `defaultPrevented`, and text selection. Check the
press origin as well as the click target so a click retargeted to an empty
ancestor cannot dismiss after a press on a Brick or control. The
drawer and floating toolbar sit outside this boundary. [WallPlacement](../../apps/app/modules/lib/wall/WallPlacement.tsx),
[WallEditor](../../apps/app/modules/lib/wall/WallEditor.tsx),
[Page layout](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/layout.tsx),
[drawer close](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/%28drawer%29/layout.tsx),
[W3C click dispatch rules](https://www.w3.org/TR/pointerevents3/#event-dispatch).

An overlay's own outside-interaction behavior still applies. For example,
Base UI documents that a modal Menu disables pointer interactions outside
the menu. A click on a portaled menu item or modal backdrop remains outside
the preview DOM. A nonmodal overlay can let a real preview click through,
so a requirement to dismiss only the topmost overlay on that click would
need explicit coordination. Floating UI's nesting option coordinates
elements registered with its own tree. [Base UI Menu modal prop](https://base-ui.com/react/components/menu#root),
[Floating UI bubbling](https://floating-ui.com/docs/usedismiss#bubbles),
[React portal propagation](https://react.dev/reference/react-dom/createPortal#caveats).

This feature has one click boundary and an existing route action. A local
React handler is sufficient. A native listener in the drawer can call its
local Close handler directly, but would still need a physical preview
boundary and the same click predicate. [React event handling](https://react.dev/learn/responding-to-events),
[drawer layout](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/%28drawer%29/layout.tsx).
