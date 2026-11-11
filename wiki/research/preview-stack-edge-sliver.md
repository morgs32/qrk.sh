# Preview Stack edge sliver

Researched 2026-10-28 against the current QRK source, live DOM measurements
supplied by the parent investigation, and CSS specifications. This is a research
note records the original investigation and the subsequently accepted repair.
The investigation itself changed no application code or persisted content.

## Confirmed geometry before the repair

The screenshot was taken while Wall content passed underneath the sticky site
navbar. The current frame uses a 1440px authored page-content width with 1px
side borders: its outer box begins at x=133 and is 1442px wide; its content
begins at x=134. [Shared section geometry](/Users/morgs32/GitHub/qrk.sh/apps/app/components/PagePreview/PreviewSection.tsx:8).

At scrollTop=34, the sticky navbar spans y=80…144. The first Wall Brick spans
y=110…174 and therefore overlaps the navbar's vertical range from y=110…144.
The navbar's section had a transparent background and a 50%-opacity zinc border;
its nested header paints white at x=134 over the 1440px content width. These are
live DOM/computed-style observations supplied by the parent investigation.
The source assigns `bg-background` to that nested header, not to its sticky
bordered section. [Navbar markup](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/SiteHeader.tsx:19).

The Brick gap is 4px. The outer content wrapper's -2px margin moves its left edge
to x=132 and expands its width to 1444px. The Stack, Row, and Placement also
begin at x=132; the Placement's 2px padding puts the actual Brick content back
at x=134 with width 1440px. The -0.5px Row margin and +0.5px padding cancel too.
The measured Brick edge is therefore correctly flush with the page-content
edge; the gap compensation is not evidence of a four- or two-pixel layout
error. [Outer gap compensation](/Users/morgs32/GitHub/qrk.sh/apps/app/components/WallEditor/WallEditor.tsx:371),
[Row compensation](/Users/morgs32/GitHub/qrk.sh/apps/app/components/WallEditor/WallEditor.tsx:391),
[Placement inset](/Users/morgs32/GitHub/qrk.sh/apps/app/components/WallEditor/WallPlacement.tsx:19).

SwatchAndIcon's color surface is a full-width flex box with its authored color
as background; it adds no border or edge offset. StackAction is an absolute
label inset 1px from the Stack, not a white rule. [Swatch surface](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/swatchAndIcon/SwatchAndIcon/components/SwatchAndIconColor.tsx:8),
[Stack label](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/components/StackAction.tsx:6).

## Confirmed cause: border compositing

The original source exposed a specific compositing risk: the sticky section's
semi-transparent border has no opaque section background behind it. Its child
header paints only inside the section's side borders, so it does not back the
border strip. Scrolled Brick colors can therefore change the border's apparent
color even though all horizontal coordinates are correct. CSS backgrounds are
not inherited, their default is transparent, and the default background painting
area is the border box with the background behind the border. [CSS background
color](https://www.w3.org/TR/css-backgrounds-3/#background-color),
[CSS background painting area](https://www.w3.org/TR/css-backgrounds-3/#background-clip).

The parent investigation confirmed this with lossless PNGs at the same scroll
position. Before the temporary test, border pixel x=133 was RGB(206,206,211) at
y=90,100,109, then changed to RGB(176,161,159) at y=110,120,140,143 where the Wall
passed underneath the navbar. With only an opaque white background temporarily
added to the navbar section, that pixel stayed RGB(207,207,212) throughout
y=90…143. The navbar interior at x=134,y=120 remained white, and the Wall below
y=144 retained the same border/content pixels. Geometry did not change.

The apparent sliver is therefore changing border paint caused by transparent
navbar backing and overlapping translucent section borders, not misplaced Brick
content. The section-background test override was removed; its computed
background returned to transparent. The before/after screenshots were captured
as `/tmp/qrk-sliver-before.png` and `/tmp/qrk-sliver-after.png` for this run.

## Accepted repair: opaque zinc borders

The user chose the simpler repair: make the borders opaque instead of changing
background ownership. The application now uses solid `border-zinc-300` on
`PreviewSection`'s shared side borders. `BrowserChrome` uses the same solid
zinc-300 on its own top and bottom edges, replacing the previous top 50%-opacity
zinc and bottom 70%-opacity zinc. No background was moved; the navbar's nested
header retains `bg-background`. [Shared sides](/Users/morgs32/GitHub/qrk.sh/apps/app/components/PagePreview/PreviewSection.tsx:10),
[browser edges](/Users/morgs32/GitHub/qrk.sh/apps/app/components/PagePreview/BrowserChrome.tsx:12),
[navbar background](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/SiteHeader.tsx:19).

Opaque border paint removes the dependency on whichever Wall color passes
underneath. The earlier alternative—moving `bg-background` onto the sticky
navbar section—was useful for isolating the cause in the A/B test, but is not
the accepted implementation.

This changes only color/painting. It preserves the authored 1440px content width,
1442px frame width, query-container width, navbar padding, sticky offsets,
Placement padding, touching drop targets, and visible overflow. No replacement
wrapper or border mechanism is needed. Sticky offsets remain relative to the
same nearest scrollport. [CSS sticky positioning](https://www.w3.org/TR/css-position-3/#sticky-pos).

Do not remove the negative gap compensation or add a compensating left padding
based on this screenshot. The measured margins already cancel; changing them
would move correctly aligned Brick content and alter the intended gap/drop
geometry. Do not clip the section to conceal the edge: editor controls and
borders intentionally remain free to paint into the gutter.

## Research verification

- Source and live geometry agree: the gap compensation cancels, with no
  horizontal gap between the navbar interior and actual Brick content.
- Identical-scroll lossless pixel comparison isolates the variable edge color
  to the sticky navbar's background backing. Interior and Wall pixels remain
  unchanged; no geometry or drop-target changes were needed for the comparison.
- The temporary background override was removed after the comparison. No
  application implementation, persisted content, or browser-storage changes
  were made by the research.

The opaque-border repair is implemented and verified in the running browser:

- All four sections compute to opaque `oklch(0.871 0.006 286.286)` borders,
  without an alpha component.
- Outer width remains 1442px and client width remains 1440px.
- At `scrollTop=56`, a lossless pixel sample of x=133 over y=80…143—the full
  64px navbar border—contains one color, RGB(212,212,216), including the part
  covering scrolled Wall content. The formerly changing strip is now constant.
- Targeted formatting for the two changed application files and the diff check
  pass.

## Remaining work

None.
