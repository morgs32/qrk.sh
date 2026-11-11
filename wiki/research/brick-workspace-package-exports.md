# Brick workspace packages and runtime imports

Researched 2026-11-11.

## What QRK can share

The current Brick definitions already serve multiple runtimes. `linkV1` supplies the state schema, sizing, default spec, and JSON Render metadata. Zerospin's ordinary Add Brick command uses these facts to validate state and seed the Placement. App uses the same declaration for React rendering, API builds its spec-generation catalog from it, and Web's `WallViewer` reads the sizing. These files fit a runtime-neutral definitions library. Worker bindings and provider execution have distinct owners in Zerospin and API. [Link definition](../../apps/zerospin/src/modules/link/linkV1.ts#L40) · [Add Brick command](../../apps/zerospin/src/aggregates/user/contracts/wall/AddBrickContractV5.ts#L53) · [API generation](../../apps/api/modules/generateSpec.ts#L5) · [WallViewer](../../apps/web/library/WallViewer.tsx#L39) · [Worker continuation](../../apps/zerospin/src/aggregates/user/contracts/brick/GenerateBrickSpecExternalV2.ts#L21)

A second library can own the React components, registry bindings, and read-only Brick rendering. Web already has a `renderBrick` slot. App's current catalog also loads forms and editors, and those import App controls and assume host services such as `/rpc`. Extract display first so the shared renderer has no dependency on either host. The Image form already demonstrates a host seam through its injected uploader. [WallViewer interface](../../apps/web/library/WallViewer.tsx#L11) · [App catalog](../../apps/app/modules/modulesHash.ts) · [Link form](../../apps/app/modules/link/LinkForm.tsx#L64) · [Image upload seam](../../apps/app/modules/image/ImageForm.tsx#L22)

## Force the public import paths

An explicit `package.json#exports` map makes a bare package import resolve to the file the package names. It rejects an undeclared subpath. Map versioned definitions and React views directly to their defining files, with no broad `./src/*` entry. For a Link pilot, the two package manifests could expose these respective entries. The package names and proposed paths are illustrative. [Node package entry points](https://nodejs.org/api/packages.html#package-entry-points)

```jsonc
// @qrk.sh/brick-definitions
{
  "exports": {
    "./link/linkV1": "./src/link/linkV1.ts"
  }
}
```

```jsonc
// @qrk.sh/brick-react
{
  "exports": {
    "./link/LinkCard": "./src/link/LinkCard.tsx"
  }
}
```

If the convention should be identical for every Brick, subpath patterns can encode it. For example, `"./*/client": "./src/*/client.tsx"` and `"./*/server": "./src/*/server.ts"` pin those imports to the corresponding files. A string target resolves in every environment that honors the map. Runtime eligibility takes a conditional target or an import rule. The wildcard can include slashes, so prefer explicit mappings when the public surface is small or when the rule must match exactly one Brick directory. A more-specific `null` entry can exclude an internal subtree. [Node subpath patterns](https://nodejs.org/api/packages.html#subpath-patterns)

## Enforce runtime and dependency direction

- **Package resolution.** A Worker-specific entry can list `workerd` as its only condition, as in the example below. Wrangler tries `workerd`, and Vite's browser resolver includes `browser`. The active conditions depend on the tool and target. TypeScript can opt into host-specific conditions with `customConditions`. If emitting declarations, keep a Worker entry's `types` target inside the allowed condition so a top-level types match cannot bypass the restriction during typechecking. [Node conditional exports](https://nodejs.org/api/packages.html#conditional-exports) · [Wrangler bundling](https://developers.cloudflare.com/workers/wrangler/bundling/#conditional-exports) · [Vite resolve conditions](https://vite.dev/config/shared-options.html#resolve-conditions) · [TypeScript module resolution](https://www.typescriptlang.org/docs/handbook/modules/reference#packagejson-exports)
- **Repository imports.** Export maps govern package specifiers. Filesystem imports and aliases can reach files outside that map. Run Nx's module-boundary lint in CI and tag separate projects by role. Allow Brick React to depend on definitions and forbid definitions from depending on React, a host app, or Worker code. If the directories share one Nx project, use a file-scoped import rule for the internal split. QRK's current Nx config discovers projects from package manifests. The boundary lint still needs to be wired. [Node package encapsulation](https://nodejs.org/api/packages.html#package-entry-points) · [Nx boundary lint](https://nx.dev/docs/features/enforce-module-boundaries) · [QRK Nx configuration](../../nx.json)
- **Host builds.** Use Next's `server-only` and `client-only` markers or TanStack Start's file and specifier checks at their host seams. Start's defaults scope importers to its source directory and exclude `node_modules` targets from file checks. Verify the actual workspace-package paths in the App build. Storybook uses a separate Vite config and benefits from the same CI import rules. Next can prerender Client Components, so keep React rendering safe for SSR and isolate browser API access in the leaves that need it. [Next environment checks and prerendering](https://nextjs.org/docs/app/getting-started/server-and-client-components) · [TanStack import protection](https://tanstack.com/start/latest/docs/framework/react/guide/import-protection) · [Storybook Vite config](../../apps/app/vite.storybook.config.ts)

```json
{
  "exports": {
    "./link/worker/generate": {
      "workerd": "./src/link/worker/generate.ts"
    }
  }
}
```

This is an option for an actual Worker-only entry. The Link pilot can leave execution in its existing hosts and use ordinary source exports for shared definitions and views.

A temporary fixture resolved a shared pattern and rejected undeclared and private subpaths in Node 24.13.1. A `workerd`-only entry resolved when Node explicitly enabled that condition, and normal Node and QRK's installed Vite Plus 1.0.0 browser build rejected it. A separate entry with `"browser": null` and a valid `"default"` target was rejected by Node and TypeScript 6.0.2 when configured with the browser condition. The Vite browser build still bundled the default target. This is a reason to favor an allowlist with no fallback and test a deliberately forbidden import in each consumer build.

## Storybook and compilation

Start with private workspace packages exporting TypeScript source. App, Web, Workers, and Storybook can compile their own import graphs. QRK already uses source exports for `@qrk.sh/r2-assets`. Next supports local workspace transpilation and exposes `transpilePackages` when explicit configuration is needed. Add a separate library build when a consumer needs emitted JS or declarations, or when build measurements justify an independent artifact. [QRK source package](../../packages/r2-assets/package.json) · [Nx buildable libraries](https://nx.dev/docs/kb/buildable-and-publishable-libraries) · [Next transpilePackages](https://nextjs.org/docs/app/api-reference/config/next-config-js/transpilePackages)

Colocate render stories with the views and extend the existing Storybook story globs. Keep the host's RPC and upload proxy with the Storybook configuration. Register the new package sources in Tailwind and preserve the view CSS, fonts, and assets. A Storybook static build gives the team a standalone preview of the library. [QRK Storybook configuration](../../apps/app/.storybook/main.ts) · [Storybook configuration](https://storybook.js.org/docs/configure) · [Tailwind source detection](https://tailwindcss.com/docs/detecting-classes-in-source-files)

Link is a practical pilot. The split earns its keep if Zerospin and API can import its definition, App and Web can render the same spec, Storybook can show it without reaching into App, and CI rejects a deliberately forbidden import.
