# Flush preview borders

Researched 2026-10-28 against the current QRK source, live browser measurements supplied by the parent investigation, Tailwind's official documentation, and CSS specifications. The investigation itself changed no application code or runtime state. The user subsequently accepted the content-width decision below; implementation verification is tracked separately at the end.

## Original finding

The widths agreed, but the visible left/right step came from mixing an **outside ring** on the browser bar with **inside borders** on the navbar, Wall, and footer. `PreviewSection` centered each section at the same authored width. `BrowserChrome` added `ring-1`, whereas the other sections added `border-x`. [PreviewSection](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/PreviewSection.tsx:5), [BrowserChrome](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/BrowserChrome.tsx:10), [navbar](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/SiteHeader.tsx:19), [Wall and footer](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/wall/WallEditor.tsx:367).

At the measured 1708px viewport, all four section border boxes start at x=134 and are 1440px wide. The browser bar had zero side-border width and a 1px outer ring; its painted edge began at x=133. The other three had 1px side borders and painted within x=134…1574. Their client width was 1438px; the browser bar's was 1440px. All four used `box-sizing: border-box` and visible overflow. These are recorded live DOM/computed-style observations before the repair, not inferred from the screenshot alone.

Tailwind defines `ring-<number>` as a solid box shadow. CSS specifies that an outer shadow paints outside the border edge; `border-box` sizing includes real borders within the declared width. Equal bounding rectangles therefore do not prove equal painted edges. [Tailwind rings](https://tailwindcss.com/docs/box-shadow#adding-a-ring), [CSS shadow geometry](https://www.w3.org/TR/css-backgrounds-3/#shadow-shape), [CSS border-box sizing](https://www.w3.org/TR/css-sizing-3/#box-sizing).

## Settled decision: exact page content widths

The accepted meaning of `BREAKPOINTS.previewWidth` is **page content width**, not
outer border-box width. A nominal 720px preview must provide 720px before
section-local padding, with 1px borders outside that area: 722px total. The same
rule gives 362/722/1082/1442px total widths for the four nominal previews.
Container-query thresholds stay unchanged; the repair must not make a nominal
720px page become a 718px content/query area. [Breakpoint definitions and border allowance](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/breakpoints.ts:2),
[CSS container width](https://www.w3.org/TR/css-contain-3/#width),
[CSS border-box sizing](https://www.w3.org/TR/css-sizing-3/#box-sizing).

1. The existing `PreviewSection` solely owns shared real 1px zinc side borders.
   Its border-box width is the nominal content width plus
   `2 * PREVIEW_BORDER_WIDTH`, where `PREVIEW_BORDER_WIDTH` is the 1px constant
   exported by `modules/lib/breakpoints.ts`. PagePreview and the story expose
   it through `--wall-preview-border-width`. It remains one
   centered element, without max-width clamping or clipping. Its callers no
   longer repeat side-border declarations.
2. `BrowserChrome` replaces its outside ring with its own real top border,
   retaining its bottom divider and 48px total height. Navbar and footer retain
   their local horizontal separators and 64px heights. Do not restore a
   full-frame outline or ring.
3. `useBreakpointGuard` measures available **content** width once as
   `max(0, element.clientWidth - 2 * PREVIEW_BORDER_WIDTH)`. The existing viewport
   store, largest-fitting selection, current-breakpoint check, ValidBreakpoint
   render/insufficient-space checks, and toolbar disabled checks all use this
   same value. Using `clientWidth` excludes a real vertical scrollbar. The
   minimum-space message explains that 360px content needs 362px total; labels
   continue to display nominal content widths. [Guard](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/page/[pageId]/useBreakpointGuard.ts:17),
   [render guard](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/page/[pageId]/ValidBreakpoint.tsx:9),
   [toolbar availability](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/Toolbars/BreakpointsToolbar.tsx:34).
4. Keep existing measurement ownership, ResizeObserver updates, and cleanup to
   null. Keep PageLayout's full-width scroll owner. The browser bar and optional
   navbar stay separate sticky siblings at offsets 0 and 48px; section edges
   move with their respective sections. [Scroll owner](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/page/[pageId]/layout.tsx:165),
   [CSS sticky positioning](https://www.w3.org/TR/css-position-3/#sticky-pos).
5. Storybook uses the same exact content-plus-borders sizing. Its frame minimum
   width is the selected nominal width plus both borders, so its existing scroll
   owner scrolls oversized selections horizontally rather than shrinking them.
   Labels remain nominal widths. [Story frame](/Users/morgs32/GitHub/qrk.sh/apps/app/components/WallEditor.stories.tsx:199).
6. Module catalog/detail previews retain their nominal content-width caps.
   No new responsive thresholds, fitting helper, state owner, wrapper, or type
   is needed.

The earlier outer-width recommendation is not the accepted decision. Treating
720px as an outer width would provide only 718px inside and shift responsive
behavior. A zero-layout per-section overlay was also considered; uniform real
borders plus explicit border allowance provide exact content widths without
pseudo-element paint-layer machinery. Do not use `box-content` indiscriminately:
Chrome/footer padding would then expand their outer width beyond the common
border allowance. [Existing section](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/PreviewSection.tsx:5),
[Chrome padding](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/BrowserChrome.tsx:12).

## Verification results

The implementation owner completed these checks against the running App and
actual rendered Storybook iframe on 2026-10-28:

- TypeScript passed.
- At the odd 1709px viewport, browser bar, navbar, Wall body, and footer aligned
  at each selected width. Their outer widths were 362/722/1082/1442px, with
  matching left coordinates 673.5/493.5/313.5/133.5px; the unpadded client widths
  were exactly 360/720/1080/1440px. Shared fractional centering stayed aligned.
- Navbar padding was 16px at `sm` and 30px at `md` and above. The nominal 720px
  query boundary therefore retained its larger-padding branch. This is direct
  navbar evidence; Article content was not independently changed by the repair.
- Availability changed at each complete frame boundary: `sm` at 361/362px,
  `md` at 721/722px, `lg` at 1081/1082px, and `xl` at 1441/1442px. Each smaller
  width disabled that choice, and each exact fitting width enabled it. The
  insufficient-space UI used the exact 362px minimum message.
- Width growth retained valid `sm`/`md`/`lg` selections; shrinking selected a
  fitting fallback instead of clamping the selected page content.
- A temporary 16px test scrollbar at 722px total width reduced the scroll
  element's `clientWidth` to 706px and disabled `md`. Restoring normal scrollbar
  styling restored client width to 722px and enabled `md` again. The test-only
  scrollbar override was removed.
- With the drawer open and `scrollTop=250`, the frame top was -218px while the
  browser bar stayed at y=32px with height 48px, and the navbar stayed directly
  below it at y=80px with height 64px. The full-frame `::after` content remained
  `none`; no detached outline was reintroduced.
- The actual Storybook iframe on local port 10020, at a 1280px viewport with
  `xl` selected, rendered a 1442px frame and 1442px sections with 1440px client
  widths. Its scrolling main element had `scrollWidth=1506` and
  `clientWidth=1280`, confirming horizontal scrolling instead of shrinking.

- Hovering the first Wall Placement kept its content stationary: `transform`
  and `box-shadow` were `none`; its `::after` border was 5px solid black with
  opacity 1. All three relevant ancestors retained visible overflow.
- The original user tab showed flush edges in the final screenshot. Its URL
  and open drawer were preserved.
- TypeScript, targeted formatting, and diff checks passed.

These are observed DOM/computed-style and command results supplied by the
implementation owner. They are not inferred solely from matching class names.

## Remaining work

None.
