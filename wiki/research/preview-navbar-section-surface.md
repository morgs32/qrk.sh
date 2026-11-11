# Preview navbar section surface and padding

Researched 2026-10-28. Scope: the selected `xl` editor preview at
`https://app.qrk.localhost/morgs32/site/sit_NA0ULSNBH96xugXxGXebh/page/pag_wOVq74CZ2ouTKO-5b-ngz/modules?breakpoint=xl`.
This note records source research and read-only DOM observations supplied by
the parent investigation. No application code or persisted content was changed.

## Answer

The navbar's **section should own an opaque background**. Its content already
has padding; adding more padding is unnecessary for the observed surface gap.
The current sticky outer section is transparent while its nested header owns
the white surface and 30px horizontal inset. This is a split between border and
surface ownership, not missing content spacing.
[SiteHeader](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/SiteHeader.tsx:19),
[shared section](/Users/morgs32/GitHub/qrk.sh/apps/app/components/PagePreview/PreviewSection.tsx:8).

The colored content visible **above the simulated browser bar** is a separate
top-gap exposure. Moving the navbar's background does not cover that space.
The scroll owner starts at viewport y=0 with 32px top padding, while the sticky
browser bar starts at y=32 and the navbar at y=80. Wall content can remain
visible in the scrollport above the bar; the frame deliberately allows visible
overflow. These coordinates were measured on the current page by the parent
investigation; the source establishes the 32px gap, scroll ownership, and sticky
bar offsets.
[top-gap variable](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/bricks.css:3),
[scroll owner](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/page/[pageId]/layout.tsx:165),
[browser bar](/Users/morgs32/GitHub/qrk.sh/apps/app/components/PagePreview/BrowserChrome.tsx:10).

## Current ownership

- `PagePreview` renders BrowserChrome, SiteHeader, and WallEditor as consecutive
  siblings inside the preview frame. BrowserChrome is the browser UI; SiteHeader
  is the site's navigation bar displaying the site name.
  [composition](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/page/[pageId]/PagePreview.tsx:49).
- `PreviewSection` supplies the common centered border-box width, translucent
  side borders, and query container. It supplies no background or padding.
  [section definition](/Users/morgs32/GitHub/qrk.sh/apps/app/components/PagePreview/PreviewSection.tsx:8).
- BrowserChrome already has its own gray background, 12px horizontal padding,
  48px height, and sticky `top-0` position. Its address field has a separate
  translucent white surface.
  [browser chrome](/Users/morgs32/GitHub/qrk.sh/apps/app/components/PagePreview/BrowserChrome.tsx:10).
- SiteHeader's outer PreviewSection owns z-index 50 and optional sticky
  `top-12`. Its nested header owns the 64px height, bottom divider,
  `bg-background`, and responsive inline padding.
  [navbar](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/SiteHeader.tsx:19).
- The responsive inset is 16px by default and 30px when both the viewport and
  enclosing query container are at least 720px wide. The light theme's
  `background` token is white; the dark theme changes it, so `bg-background`
  preserves current theming while `bg-white` would enforce literal white.
  [insets](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/bricks.css:32),
  [token mapping](/Users/morgs32/GitHub/qrk.sh/apps/app/app/globals.css:16),
  [light token](/Users/morgs32/GitHub/qrk.sh/apps/app/app/globals.css:56),
  [dark token](/Users/morgs32/GitHub/qrk.sh/apps/app/app/globals.css:91).

## Live observations

The parent investigation measured the outer navbar at x=133, y=80, width=1442,
height=64, with transparent background and zero padding. Its inner header was
x=134, y=80, width=1440, height=64, with white `oklch(1 0 0)` background and
`0 30px` padding. These agree with the source ownership described above.
The frame began at y=-107 and had visible overflow; its scroll owner occupied
y=0…1314 with `32px 0 43px` padding and vertical scrolling.

The current screenshot showed the colored Brick above the browser bar at
approximately y=5…32. Hit-testing at x=850, y=5 and y=20 included the check-circle
image and its colored Swatch surface. BrowserChrome has `pointer-events-none`,
so hit-testing alone does not prove that Brick layers paint over the bar itself.
The observed exposure is in the space above it.
[pointer behavior](/Users/morgs32/GitHub/qrk.sh/apps/app/components/PagePreview/BrowserChrome.tsx:12).

## Recommended bounded change

Move the existing `bg-background` class from the nested header to SiteHeader's
PreviewSection. This gives the sticky bordered section its own opaque surface,
including behind its translucent side borders. CSS backgrounds default to
transparent, are not inherited, and paint to the border box by default.
[CSS backgrounds](https://www.w3.org/TR/css-backgrounds-3/#background-color),
[background painting area](https://www.w3.org/TR/css-backgrounds-3/#background-clip),
[change owner](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/SiteHeader.tsx:19).

Keep the existing responsive padding on the inner header for this repair.
Moving `qrk-responsive-insets` onto PreviewSection would change which container
its query evaluates against: query containers are selected from an element's
ancestors, not the element itself. Adding padding to the section would also
reduce its content box inside the fixed border-box width. That is a geometry
change requiring separate justification; it is unnecessary to make the navbar
section opaque.
[container query selection](https://www.w3.org/TR/css-contain-3/#container-rule),
[responsive rule](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/bricks.css:37),
[fixed section box](/Users/morgs32/GitHub/qrk.sh/apps/app/components/PagePreview/PreviewSection.tsx:10).

Treat the 32px top gap separately if the intent is to conceal scrolled page
content above the browser bar. Its masking or scroll-layout owner is the preview
host, not the navbar's content padding. Do not globally clip PreviewSection:
its documented purpose includes leaving editor controls visible in the gutter.
[host](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/page/[pageId]/layout.tsx:161),
[section overflow intent](/Users/morgs32/GitHub/qrk.sh/apps/app/components/PagePreview/PreviewSection.tsx:4).

## Verification limits

This is a recommendation, not an implemented or visually accepted change.
No temporary CSS override, automated test, or published-site verification was
performed for this note. The same production SiteHeader is used by the Wall
Editor Storybook story, so a future navbar change would affect both preview
surfaces; the app preview remains the decisive route for the reported top gap.
[story composition](/Users/morgs32/GitHub/qrk.sh/apps/app/components/WallEditor/WallEditor.stories.tsx:201).
