# Calculating grid item heights on the server

Researched 2026-10-19 against Pretext main at [`0d102a5`](https://github.com/chenglou/pretext/tree/0d102a5cd933611e86a7e60bda7b4baa5995c6b0), QRK's installed Pretext 0.0.9, and Satori [0.62.0](https://github.com/vercel/satori/releases/tag/0.62.0). This is research; no application code, dependencies, or persisted layouts changed. No runtime deployment or browser-parity experiment was performed.

## Answer

**Yes, at a known item width, font, and style.** Producing the pixel height is the substantive problem; converting that height to an RGL row span is ordinary arithmetic. Pretext predicts text wrapping from supplied font measurements. Satori can calculate a JSX tree's automatic height on the server. Neither result is a universal guarantee that the existing browser-rendered content will occupy the same height. [Pretext layout](https://github.com/chenglou/pretext/blob/0d102a5cd933611e86a7e60bda7b4baa5995c6b0/src/layout.ts#L144-L153), [Satori automatic root height](https://github.com/vercel/satori/blob/0.62.0/src/satori.ts#L209-L241), [Satori browser differences](https://github.com/vercel/satori/blob/0.62.0/README.md#html-elements).

For measured content height plus the item's vertical padding, borders, and other chrome, the derived RGL conversion remains:

```js
const requiredHeight = contentHeight + verticalChrome;
const h = Math.max(
  1,
  Math.ceil((requiredHeight + marginY) / (rowHeight + marginY)),
);
```

Use the actual content width for wrapping, not the entire grid width. The prior [RGL research](./react-grid-layout-content-height.md#rounding-up-to-the-next-row) covers margins and fractional-pixel rounding. [Owning RGL geometry](https://github.com/react-grid-layout/react-grid-layout/blob/2.3.0/src/core/calculate.ts#L38-L59).

## Pretext

`prepare(text, font, options)` measures text segments; `layout(prepared, contentWidth, lineHeight)` counts wrapped lines and returns `lineCount * lineHeight`. Reusing the prepared handle makes subsequent width calculations arithmetic rather than repeated font measurements. [Layout implementation](https://github.com/chenglou/pretext/blob/0d102a5cd933611e86a7e60bda7b4baa5995c6b0/src/layout.ts#L144-L153), [API](https://github.com/chenglou/pretext/blob/0d102a5cd933611e86a7e60bda7b4baa5995c6b0/README.md#api).

**It still needs a font-measurement engine.** Current source creates an `OffscreenCanvas` or DOM canvas and throws if neither yields a 2D context. The current README explicitly permits an outside-browser adapter: define global `OffscreenCanvas` before preparation, returning a context with writable `font` and `measureText(text).width`. It describes browser/native results using those supplied widths as estimates; results are exact for a renderer that paints Pretext's calculated lines. Node without a canvas backend therefore cannot prepare text directly. Cloudflare deployment would likewise need a suitable measurement backend when Canvas is unavailable; that integration was not validated. [Context creation](https://github.com/chenglou/pretext/blob/0d102a5cd933611e86a7e60bda7b4baa5995c6b0/src/measurement.ts#L1359-L1365), [outside-browser contract](https://github.com/chenglou/pretext/blob/0d102a5cd933611e86a7e60bda7b4baa5995c6b0/README.md#L240-L241).

Pretext takes text and explicit typography, not an HTML document plus CSS. Its rich-inline API accepts styled runs and known-width boxes, but the caller owns block spacing and vertical sizing. The Markdown demo constructs a separate block model and painter; unknown-size images, embeds, and math still require measurement after mount. [Rich-inline API](https://github.com/chenglou/pretext/blob/0d102a5cd933611e86a7e60bda7b4baa5995c6b0/README.md#L111-L133), [Markdown block model](https://github.com/chenglou/pretext/blob/0d102a5cd933611e86a7e60bda7b4baa5995c6b0/pages/demos/markdown-chat.md#L12-L26), [remaining measurement cases](https://github.com/chenglou/pretext/blob/0d102a5cd933611e86a7e60bda7b4baa5995c6b0/pages/demos/markdown-chat.md#L57-L62).

Matching the browser requires matching the fonts actually loaded, content width, line height, letter spacing, wrapping rules, and language. System fonts and missing-glyph fallback can differ. Pretext documents unsupported CSS font settings and browser-specific gaps, so equal input text alone does not establish browser-equivalent height. Its deterministic fake-canvas unit checks explicitly defer browser correctness to its browser harness. [Typography caveats](https://github.com/chenglou/pretext/blob/0d102a5cd933611e86a7e60bda7b4baa5995c6b0/README.md#caveats), [test scope](https://github.com/chenglou/pretext/blob/0d102a5cd933611e86a7e60bda7b4baa5995c6b0/src/layout.test.ts#L6-L11).

## Satori

Satori accepts width without height, sets the root height to automatic, and generates SVG at the computed dimensions. Its `onNodeDetected` callback receives each laid-out node's `width`, `height`, and original props, so a marked wrapper can supply the item height without parsing SVG text. The public function still returns an SVG string; this is a rendering pass with layout callbacks rather than a dedicated measurement-only API. [Public options and return](https://github.com/vercel/satori/blob/0.62.0/src/satori.ts#L78-L112), [root sizing](https://github.com/vercel/satori/blob/0.62.0/src/satori.ts#L209-L241), [callback data](https://github.com/vercel/satori/blob/0.62.0/src/layout.ts#L197-L207), [callback invocation](https://github.com/vercel/satori/blob/0.62.0/src/layout.ts#L870-L905).

Version 0.62.0 uses Taffy for flex, grid, and block layout plus its own inline engine. It supports a subset of browser HTML/CSS and does not guarantee identical rendering. Pure/stateless JSX can describe the measurement tree; an existing hook/DOM-dependent React component cannot simply be passed through. Fonts must be supplied as data; CSS `@font-face` and `@import` do not load them. Current source supports WOFF2 decoding. [Layout/CSS/JSX limits](https://github.com/vercel/satori/blob/0.62.0/README.md#css), [fonts and stylesheets](https://github.com/vercel/satori/blob/0.62.0/README.md#fonts), [WOFF2 decoder](https://github.com/vercel/satori/blob/0.62.0/src/layout-engine/index.ts#L256-L273).

Satori documents Node and Worker support, with manual layout WASM initialization through `satori/standalone` for constrained environments such as Cloudflare Workers. Rendering also initializes HarfBuzz, so deployment must validate the complete WASM/font setup. No claim of a working QRK Worker deployment follows from the documented API. [Runtime guidance](https://github.com/vercel/satori/blob/0.62.0/README.md#runtime-support), [HarfBuzz initialization](https://github.com/vercel/satori/blob/0.62.0/src/harfbuzz.ts#L45-L64).

## QRK implication

QRK has four canonical grid widths: **360, 720, 1080, and 1440px**, so a server calculation can target each breakpoint and chosen item width. Card style also changes grid gaps. This makes per-breakpoint precomputation feasible once typography and content dimensions are explicit. [Breakpoints](../../apps/library/lib/breakpoints.ts#L2-L7), [wall geometry](../../apps/library/lib/BrickWall.tsx#L207-L211).

Pretext **0.0.9 is already installed** and used in `LinkCopy`, where browser-computed styles, dimensions, and font-loading events drive a font-size search within the available height. This integration does not choose grid height. Its installed version also requires Canvas measurement. [Locked version](../../pnpm-lock.yaml#L938), [current integration](../../apps/library/modules/link/LinkCopy.tsx#L19-L83), [0.0.9 canvas requirement](https://github.com/chenglou/pretext/blob/v0.0.9/src/measurement.ts#L30-L43).

For simple text bricks, a shared explicit typography model plus Pretext is the smaller conceptual fit. For a deliberately constrained card/tree, Satori can own server layout. For the current rich Article, both require reproducing its layout: `MarkdownView` currently mounts only in the browser, and its body uses Spectral while its surrounding readonly typography uses system-font fallbacks. Measuring the actual page in server-hosted Chromium is the more direct way to retain that renderer; it measures that browser's output, not every user's device. Cloudflare offers remote Playwright access, and Playwright exposes element bounds. These are proposed options, not implementation decisions. [Article mount](../../apps/library/modules/article/ArticleBrickContent.tsx#L23-L54), [body typography](../../apps/library/modules/article/article-editor.css#L14-L17), [readonly typography](../../apps/library/modules/article/article-editor.css#L164-L176), [Cloudflare browser access](https://developers.cloudflare.com/browser-run/playwright/), [element bounds](https://playwright.dev/docs/api/class-locator#locator-bounding-box).
