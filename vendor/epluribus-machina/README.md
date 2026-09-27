# E Pluribus Machina Core

`epluribus-machina-0.0.1.tgz` contains the built Core package from maintained
source revision `979d96d2d7b744a5f05f33062013ab9e5e0f0999` of
`morgs32/epluribus-machina`. The published `0.0.1-alpha.0` predates this API.
Only Core is included; the Visualizer is not a dependency.

The artifact was built from `git archive` of that revision's `packages/core`,
using TypeScript 5.9.3 and Effect 4.0.0-rc.111, with
`tsc -p tsconfig.lib.json`, followed by `npm pack --ignore-scripts`.
The source checkout's uncommitted changes were excluded. The pnpm lockfile
records the artifact integrity. A clean Zerospin checkout can install without
a sibling checkout. Do not edit or fork the library's runtime here.

Before publishing Zerospin Core outside this workspace, replace this local
artifact dependency with a published package containing this maintained API;
a workspace-relative file dependency is not a registry distribution strategy.
