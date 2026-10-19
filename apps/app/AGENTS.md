# App

App uses TanStack Start in SPA mode. File routes live in `routes/`;
`router.tsx` registers their generated tree. `vite.config.ts` owns development
and build configuration, and `vite.preview.config.ts` serves the static
`dist/client` output without the Start server plugin. Storybook has its own
Vite configuration.

App owns `app.qrk.sh` and `app.qrk.localhost`, with application and
asset paths rooted at `/`. Web remains the Next.js owner of public and
authentication routes. The username and page layouts retain the session and
editor across drawer navigation; drawer state comes from matched route IDs.

Follow the repository root instructions and the [App README](./README.md).
