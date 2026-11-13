# Text Brick and Meowdown feasibility

Researched 2026-11-12 against the current QRK implementation, installed Meowdown packages, and ProseMirror/ProseKit primary sources. The approved Text Brick uses Meowdown core with a Text-owned toolbar and constraints.

## Existing editor

QRK's Article mounts `MeowdownEditor`, saves `getMarkdown()` as its body, and renders that Markdown through `MarkdownView`. Its current body uses a fixed serif family and base size; it does not provide the requested per-breakpoint font controls. [Article editor](../../apps/bricks/src/modules/article/react/ArticleEditor.tsx), [Article view](../../apps/bricks/src/modules/article/react/ArticleBrickContent.tsx), [Article CSS](../../apps/bricks/src/modules/article/react/article-editor.css).

Installed Meowdown's Markdown-oriented commands support bold, italic, strikethrough, highlight, headings, blockquote and links. Inline delimiters remain text with derived ProseMirror marks, rather than arbitrary rich style attributes. Its parser and renderer do not make per-range font sizes or font families durable through ordinary Markdown. [Meowdown core source](https://github.com/prosekit/meowdown/blob/master/packages/core/src/extensions/extension.ts), [inline marks](https://github.com/prosekit/meowdown/blob/master/packages/core/src/extensions/inline-marks.ts), [earlier QRK research](reflect-markdown-editors.md).

Meowdown's parser leaves `first\nsecond` in one paragraph while retaining the newline; a blank line creates another paragraph. The serializer may append a terminal newline. A one-block schema check alone is therefore insufficient. Meowdown's ready-made React editor also mounts a slash menu with additional block types, so the approved Text editor mounts the public core engine with its own toolbar. [ProseMirror schema](https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.ts), [ProseMirror transaction plugins](https://github.com/ProseMirror/prosemirror-state/blob/master/src/plugin.ts).

## Chosen tradeoffs

The user selected whole-block font family and size, with values independent per Placement/breakpoint. Inline styles remain shared with Markdown content. The user chose to reuse Meowdown and explicitly accepted that typed Markdown may apply formatting, rather than introducing a separate rich-text schema to make Markdown-looking text literal.

Text needs direct `@prosekit/core` and `@prosekit/pm` dependencies to own the editor and transaction filter; these packages are currently transitive. Filter invalid edits and normalize paste, but also validate state before every programmatic content replacement. Preserve input-method composition and undo; if that cannot be done reliably, report the editor boundary problem rather than masking it with additional machinery.

Per-breakpoint font settings fit the existing Placement spec ownership, but the current inline editor has neither a Placement spec input nor a manual spec-save command. The approved change adds a general command and shared editor wiring; Text owns the typography controls and component metadata. Manual spec edits must increment `specRevision` and supersede active generation so an older result cannot overwrite them. [Placement model](../../apps/zerospin/src/aggregates/user/models/placement/PlacementV1.ts), [generation continuation](../../apps/zerospin/src/aggregates/user/contracts/brick/GenerateBrickSpecExternalV2.ts), [Wall editor](../../apps/app/components/WallEditor/WallEditor.tsx).

## Implementation boundaries found

The existing component-spec schema accepts a `$state` reference in place of every component prop. A Text editor cannot reliably read and change its Placement's typography if those fields are references instead of literal values. Both manually saved and generated specs need to enforce the same module requirements; a guard in only one path would leave the other path open. [Component spec schema](../../apps/bricks/src/definition/makeComponentSpecSchema.ts), [module spec schema](../../apps/bricks/src/definition/makeModuleSpecDocumentSchema.ts), [generation continuation](../../apps/zerospin/src/aggregates/user/contracts/brick/GenerateBrickSpecExternalV2.ts).

The existing Add and Update Brick program factories are tied to earlier Brick model and catalog types. Adding Text exposes a type mismatch with the new release; changing the catalog to a string-keyed record would weaken its required-key guarantee. The next release needs a design that preserves both its own catalog and historical release behavior. [Add factory](../../apps/zerospin/src/aggregates/user/contracts/wall/AddBrickContractV11.ts), [Update factory](../../apps/zerospin/src/aggregates/user/contracts/brick/UpdateBrickV12.ts).
