# Plan 070 — Fold R2 assets into the API Worker

1. Move public asset serving and URL generation into `apps/api/assets.ts`. The API Worker is the sole consumer and owns routing, bucket selection, and CORS.
2. Preserve the asset route, response behavior, and object keys. Build upload and Instagram URLs from the configured absolute base and original key. Remove request-origin resolution and regenerate the Worker environment declaration.
3. Remove the workspace package and its dependency entries. Update the research note that references the package and reconcile the glossary with the implemented change.
4. Build the API Worker and check the Nx graph. Verify local reads from both buckets and the URLs returned by uploads and Instagram imports.

```ts
// Append the existing key to the configured public asset base.
makePublicObjectUrl({ publicBaseUrl, key });
```

1. `/assets/library/example.png` reads `library/example.png` from `ASSETS`.
2. `/assets/user_123/_/example.png` reads `user_123/_/example.png` from `QRKSH`.

## Files

`+` creates, `~` modifies, and `-` removes.

```text
qrk.sh/
├── apps/api/
│   ├── + assets.ts
│   ├── ~ Worker.ts
│   ├── ~ handleUpload.ts
│   ├── ~ package.json
│   ├── ~ worker-configuration.d.ts
│   └── modules/
│       ├── ~ LibraryApi.ts
│       └── instagram/
│           └── ~ getInstagramProfile.ts
├── packages/
│   └── - r2-assets/
├── ~ pnpm-lock.yaml
└── wiki/
    ├── plans/
    │   └── + 070-plan-fold-r2-assets-into-api.md
    └── research/
        └── ~ brick-workspace-package-exports.md
```

## Implementation and automated verification

1. Implemented on `main`. Plan 069 was already assigned to the Bricks shadcn buttons work.
2. `pnpm nx run @qrk.sh/api:types` regenerated the Worker declaration with both absolute bases. `pnpm nx run @qrk.sh/api:build` passed, including the Bricks import check.
3. The Nx graph contains no `@qrk.sh/r2-assets` project or dependency. The glossary requires no terminology changes.
4. The configured Portless HTTPS proxy was unavailable and requires administrator authentication to start. The agent dispatched requests using the configured `https://api.qrk.localhost` URL against the built Worker in Miniflare with isolated R2 fixtures. Both bucket routes returned the expected image bytes, Content-Type, CORS, and ETag. Encoded key, preflight, and error responses passed.
5. A multipart image upload returned the original key shape and a URL serving the uploaded bytes. Instagram RPC with mocked provider and image responses returned avatar and post URLs serving the bytes stored in `QRKSH`.

## Remaining work

None.
