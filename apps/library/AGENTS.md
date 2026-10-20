# Library

Library is shared module/UI source and a Storybook workbench. Its standalone
application, file routes, router, and session are retired. Consumers compile source
exports directly; there is no separate package build or production preview.

Module playgrounds and component studies run through the existing Storybook target.
`vite.storybook.config.ts` owns its Vite/public Mapbox configuration;
`.storybook/main.ts` installs API/upload/asset proxies through `viteFinal`, after
Storybook replaces the base server configuration. `.storybook/preview.ts` imports
`storybook.css`.

App owns persisted editor models, its initialized user session, queries, and
command staging. Shared forms receive callbacks; module-specific validation,
rendering, and provider algorithms remain in their owning modules. Storybook uses
local fixtures and the existing API for explicit live actions.

Follow the repository root instructions and the [Library README](./README.md).
