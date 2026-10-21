# Optional card styling for page bricks

Researched 2026-10-14 against the current checkout and official React documentation. The approved live local spike uses a boolean Context to switch shared borders and cards with uniform 16px interior and perimeter gutters. No Site/Page setting is persisted. This is an exploration note, not a production implementation plan.

## Current model and settings ownership

The QRK user aggregate declares `site`, `page`, and the Library models, plus the existing `updateSiteSettings` and `updatePageSettings` contracts. The persisted appearance choice would belong beside those existing QRK declarations; Library can consume a resolved rendering value without knowing the Site/Page models. [UserV1.ts, lines 18–33](../../apps/zerospin/src/aggregates/user/UserV1.ts#L18-L33).

`SiteV1` currently contains the owner reference, slug, name, description, logo, and favicons. `PageV1` contains references to its site and Library wall, plus slug, title, and description. Neither declares an appearance field. A Site boolean would apply to all pages in that site; a Page boolean would allow pages in the same site to differ. This scope choice is a proposal, not something determined by the current schema. [SiteV1.ts, lines 7–40](../../apps/zerospin/src/aggregates/user/models/site/SiteV1.ts#L7-L40), [PageV1.ts, lines 8–31](../../apps/zerospin/src/aggregates/user/models/page/PageV1.ts#L8-L31).

Studio seeds separate Site/Page Zustand drafts from the current records when the route changes. The settings drawers compare those drafts with a baseline, stage the corresponding aggregate command on Save, and update the baseline after successful staging. The contracts guard owner identity and update explicit model attributes. Adding persistence later therefore touches the selected model, its settings contract, draft shape/seeding, and settings Save/Cancel behavior. [SiteLayout.tsx, lines 58–108](../../apps/app/app/[username]/site/[siteId]/SiteLayout.tsx#L58-L108), [siteStore.ts, lines 3–43](../../apps/app/app/[username]/site/[siteId]/siteStore.ts#L3-L43), [pageStore.ts, lines 3–31](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/pageStore.ts#L3-L31), [SiteSettings.tsx, lines 186–259](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/SiteSettings/SiteSettings.tsx#L186-L259), [PageSettings.tsx, lines 95–134](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/PageSettings/PageSettings.tsx#L95-L134), [UpdateSiteSettingsV1.ts, lines 46–94](../../apps/zerospin/src/aggregates/user/contracts/updateSiteSettings/UpdateSiteSettingsV1.ts#L46-L94), [UpdatePageSettingsV1.ts, lines 38–99](../../apps/zerospin/src/aggregates/user/contracts/updatePageSettings/UpdatePageSettingsV1.ts#L38-L99).

There is also a separate `sitePageDraftStore` containing seeded title/description/layout data in browser localStorage, keyed by owner/site/page. It is not the settings command persistence path described above. Its presence does not establish a new appearance setting's storage owner. [sitePageDraftStore.ts, lines 7–44 and 86–91](../../apps/app/app/[username]/site/[siteId]/sitePageDraftStore.ts#L7-L44), [localStorage persistence, lines 259–279](../../apps/app/app/[username]/site/[siteId]/sitePageDraftStore.ts#L259-L279).

## Current rendering entry points

Studio's client `PagePreview` renders responsive breakpoint panes, the site header, and App's `WallEditor`. The editor reads `UserUI` directly for the saved Wall rows and commands, and composes shared `WallSection`, `WallStack`, `WallRow`, and `WallPlacement` presentation. App and Storybook use this same session-backed editor. Appearance settings enter its rendering subtree from the containing application. [PagePreview](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/PagePreview.tsx), [WallEditor](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/WallEditor.tsx).

The current standalone `/bricks/[brickId]` route is the module Form drawer, while the surrounding Library layout renders the wall. It does not load a QRK Site/Page record. [brick detail page, lines 24–79](../../apps/library/app/bricks/[brickId]/page.tsx#L24-L79), [Library wall](../../apps/library/app/LibraryLayout.tsx#L399).

Every rendered placed brick passes through `BrickWrapper` immediately outside `BrickComponent`; fixed-size `GridItemPreview` previews also use it. `BrickShell` is a layout primitive whose catalog has no props and whose registry entry forwards children only. It is not the universal placed-brick boundary. [BrickWall.tsx, lines 535–539](../../apps/library/lib/BrickWall.tsx#L535-L539), [GridItemPreview.tsx, lines 27–37](../../apps/library/lib/GridItemPreview.tsx#L27-L37), [layoutComponents.ts, lines 20–26](../../apps/library/lib/jsonRender/layoutComponents.ts#L20-L26), [layoutRegistryComponents.tsx, line 61](../../apps/library/lib/jsonRender/layoutRegistryComponents.tsx#L61).

Link, Map, and Swatch roots instead render their own surface elements; GitHub registries add white backgrounds to their Shell roots. Consequently a Shell-only change would miss modules, and removing internal backgrounds/padding would be a separate module-owned change. [LinkCard.tsx, line 8](../../apps/library/modules/link/LinkCard.tsx#L8), [MapCanvas.tsx, line 53](../../apps/library/modules/mapPlace/MapCanvas.tsx#L53), [SwatchAndIconColor.tsx, line 8](../../apps/library/modules/swatchAndIcon/SwatchAndIcon/components/SwatchAndIconColor.tsx#L8), [GitHubRepoJsonRenderRegistry.tsx, line 16](../../apps/library/modules/githubRepo/generator/GitHubRepoJsonRenderRegistry.tsx#L16), [GitHubProfileJsonRenderRegistry.tsx, line 18](../../apps/library/modules/githubProfile/generator/GitHubProfileJsonRenderRegistry.tsx#L18), [GitHubActivityJsonRenderRegistry.tsx, line 14](../../apps/library/modules/githubActivity/generator/GitHubActivityJsonRenderRegistry.tsx#L14).

No published Site/Page wall renderer was found under the current `apps/web/app` routes or in searches of `apps/web` for `BrickWall`, Site/Page models, or Site/Page queries. The inspected home route is a landing page; Site Settings constructs a published URL but its Publish button has no handler. This finding is limited to this checkout: there is no verified published rendering call site to wire today. [web home route, lines 87–149](<../../apps/web/app/(home)/page.tsx#L87-L149>), [SiteSettings.tsx, lines 158–165 and 265–267](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/SiteSettings/SiteSettings.tsx#L158-L165).

## Props, Context, and server/client boundaries

React recommends trying explicit props or composition before Context. Context fits values consumed across a subtree, including visual themes; intermediate components need not forward it. Consumers use the nearest provider. [React: Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context#before-you-use-context), [Context use cases](https://react.dev/learn/passing-data-deeply-with-context#use-cases-for-context).

Context transports a value; the Context object does not store the durable choice. Its default is a static fallback when no provider exists. The live spike assigns `false` to the default shared-border mode and `true` to cards with gutters. [React: createContext](https://react.dev/reference/react/createContext#parameters), [BrickCardStyleContext.ts](../../apps/library/lib/BrickCardStyleContext.ts#L14).

React classifies `createContext` and `useContext` as client APIs for React Server Components. A boolean is serializable across a Server-to-Client prop boundary, so a future server-loaded setting can be passed to a client provider or client wall. Current Studio PagePreview and standalone Library rendering are already client code. [React: client APIs](https://react.dev/reference/rsc/use-client#using-third-party-libraries), [Serializable props](https://react.dev/reference/rsc/use-client#serializable-types-returned-by-server-components), [PagePreview.tsx, line 1](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/PagePreview.tsx#L1), [GridItemPreview.tsx, line 1](../../apps/library/lib/GridItemPreview.tsx#L1).

## Rendering ownership

RGL owns card-mode wall spacing; the outer placement/preview element owns decoration and `BrickWrapper` keeps module content clipped. The containing application supplies a local boolean through Context around the wall and previews. A future Site/Page field would change the source of that value, not the module registry contracts. Context avoids adding this environmental setting to every module registry/catalog. [Wall outer element](../../apps/library/lib/BrickWall.tsx#L492-L508), [fixed preview root](../../apps/library/lib/GridItemPreview.tsx#L27-L39), [React Context](https://react.dev/learn/passing-data-deeply-with-context).

If “card” also changes module-internal padding, media crops, or footer placement, that is additional behavior inside the owning modules. Applying outer chrome alone does not establish those layout rules. Keep that visual decision separate from whether the persisted preference applies per page or per site.

Default mode retains zero grid margins/padding. Card mode uses native `margin: [16, 16]` and `containerPadding: [16, 16]`; each card surface fills its positioned slot. No additional per-card inset or intrinsic-preview decorative padding contributes another gap. [BrickWall](../../apps/library/lib/BrickWall.tsx), [GridItemPreview](../../apps/library/lib/GridItemPreview.tsx), [shared styles](../../apps/library/bricks.css).

## Shared gutters and default borders

The user corrected the original half-inset geometry: insetting every touching item by 8px produces 16px between neighbors but only 8px at the wall perimeter. The approved correction uses native RGL spacing, with **one 16px gap both between cards and at the perimeter**. RGL's `margin` is the total inter-item gap, while `containerPadding` independently controls the exterior. The card surface fills its RGL slot; adding another 8px inset would double the interior gap. [RGL 2.2.3 GridConfig](https://github.com/react-grid-layout/react-grid-layout/blob/2.2.3/README.md#gridconfig), [CSS positioned-box sizing](https://www.w3.org/TR/css-position-3/#abspos-insets).

For full wall width `W`, eight columns, and `G = 16`, square-cell geometry is:

```text
pitch = (W - G) / 8
rowHeight = pitch - G          // Same as RGL's column width.
left = G + x * pitch           // Likewise top = G + y * pitch.
visibleWidth = w * pitch - G   // Likewise visibleHeight = h * pitch - G.
wallHeight = rows * pitch + G  // RGL auto-size, before any viewport minimum.
```

These follow from RGL's column formula `(W - 7*G - 2*G) / 8`. RGL rounds positions and corrects settled widths/heights against the next rounded grid edge to retain the configured gap. Fixed standalone previews use `round(w * pitch - G)` and `round(h * pitch - G)`; fractional column positions can differ from that nominal standalone size by a pixel. Default mode uses `G = 0` and pitch `W / 8`. [RGL calculation source](https://github.com/react-grid-layout/react-grid-layout/blob/2.2.3/src/core/calculate.ts), [RGL auto-height source](https://github.com/react-grid-layout/react-grid-layout/blob/2.2.3/src/react/components/GridLayout.tsx).

| Wall width | Card pitch | Square unit card | Full-width card |
| ---------- | ---------- | ---------------- | --------------- |
| 360px      | 43px       | 27px             | 328px           |
| 720px      | 88px       | 72px             | 688px           |
| 1080px     | 133px      | 117px            | 1048px          |
| 1440px     | 178px      | 162px            | 1408px          |

Mixed spans and T junctions require no neighbor detection: an item's right edge is `G + (x+w)*pitch - G`, and its adjacent neighbor starts at `G + (x+w)*pitch`, leaving exactly `G`. The rejected boundary-aware inset alternative would preserve the old full-cell lattice but shrink perimeter cards more than interior cards, making dimensions depend on placement. Native spacing keeps a consistent span-size rule. These are geometric deductions from the RGL formulas.

Default false mode retains the opaque overlapping 1px shared-border geometry in [react-grid-layout-shared-borders.md](./react-grid-layout-shared-borders.md). Its right/bottom perimeter strokes stay inside their boxes; card mode does not draw that shared rule. [Shared styles](../../apps/library/bricks.css).

## Live local spike

The host owns `useState(false)` and its setter; `BrickCardStyleContext` remains `createContext(false)`. The **Cards** button is in standalone Library's existing grid toolbar and Studio's upper-right corner, with `aria-pressed` reflecting the mode. Both providers cover the wall and drawer subtree, including module/detail/catalog previews. The flag remains local to the mounted layout; no Site/Page field or localStorage entry is introduced. [Library host](../../apps/library/app/LibraryLayout.tsx#L349), [Studio host](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/EditorLayout.tsx#L57).

```tsx
// (3) Host-owned local flag; the Context transports only the boolean.
const [cardStyle, setCardStyle] = useState(false);
<BrickCardStyleContext value={cardStyle}>
  {/* Existing wall and drawer contents, retaining their other providers. */}
  <Button aria-pressed={cardStyle} onClick={() => setCardStyle((current) => !current)}>
    Cards
  </Button>
</BrickCardStyleContext>;
```

1. **Default borders:** false mode draws a 1px opaque `#282824` rectangle using the outer surface's `::before`; existing hover/drag `::after` feedback and resize-control layers remain separate. [Shared styles](../../apps/library/bricks.css).
2. **Card gutters:** true mode sets native 16px margins and padding, applies the square row-height formula, and lets the card root fill the slot. Radius remains 8px, with a white background and shadow. Module content retains its own padding, media behavior, and backgrounds. Fixed previews use the same native span-size formula; intrinsic decoration adds no exterior padding. [BrickWall](../../apps/library/lib/BrickWall.tsx), [GridItemPreview](../../apps/library/lib/GridItemPreview.tsx), [MeasuredBrickWrapper](../../apps/library/components/brick/MeasuredBrickWrapper.tsx).
3. **Local Context:** the wall and both preview wrappers consume the defining Library Context object, shared through the public package entry. No registry/catalog appearance prop is added. [Context definition](../../apps/library/lib/BrickCardStyleContext.ts), [package export](../../apps/library/package.json#L45-L48), [Vite entry](../../apps/library/vite.lib.config.ts#L34).

Stored logical `x/y/w/h`, existing minimum-unit conversion, and measurement callbacks remain unchanged; card mode changes their rendered pixel geometry. Intrinsic probes still report undecorated content dimensions. Guaranteeing capacity for a required dimension `D` would require at least `ceil((D + G) / pitch)` units, allowing for rounding; that sizing change is outside this local spike. Existing fixed-size content can clip in the smaller slot. Drag hit targets, selection outlines, and resize handles follow the native positioned card slot. [Sizing conversion](../../apps/library/lib/breakpoints.ts#L9-L12), [measurement root](../../apps/library/components/brick/MeasuredBrickWrapper.tsx), [wall controls](../../apps/library/lib/BrickWall.tsx).

## Verification

Library and Studio typechecking/lint passed for the native-spacing correction, including the required Library build. Scoped formatting and whitespace checks passed. Direct inspection of installed RGL position calculations at all four breakpoint widths produced 16px left/top/right/bottom spacing and 16px horizontal/vertical separation for mixed spans in card mode; false mode retained zero gaps. At 360px the calculated card widths were 27px, 156px, and 328px for one-, four-, and eight-unit spans. Static React rendering of built fixed previews under both Context values matched those native span dimensions at all four breakpoints. These checks establish calculation and rendered-markup parity, not browser paint or interaction behavior. Library tests are prohibited by repository instructions and were not run.

The Cards button handlers still only update local React state. Source review found no new persistence call or card-mode dependency in layout normalization; runtime confirmation of command-free toggling remains part of the manual check.

## Remaining work

1. Manually verify 16px interior/perimeter gaps at all four breakpoints, fixed/intrinsic preview behavior, drag/resize alignment, unchanged false-mode shared borders, and that toggling stages no command. Browser observation was previously blocked by the browser URL security policy; visual verification remains pending while that access limitation persists. No current visual pass is claimed.
