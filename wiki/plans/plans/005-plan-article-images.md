# Article image uploads, resizing, and alignment

## Goal

Insert an image upload placeholder from the article toolbar, upload through the existing authenticated API Worker into R2, and persist the resulting URL and block presentation in the existing article JSON. Positioning means left, center, or right alignment.

## Ordered implementation

1. Add the existing image icon and Tiptap button primitive to `ArticleToolbar`. Disable insertion in the required first heading and when the command cannot run. Register the existing upload node in `Article`.

   ```ts
   // The toolbar inserts a placeholder; choosing a file happens inside it.
   editor.chain().focus().setImageUploadNode().run();
   ```

2. Configure one PNG, JPEG, WebP, or SVG per placeholder, up to 5 MiB. Obtain a Clerk token and send multipart `file` and `siteId` to `${NEXT_PUBLIC_API_URL}/upload`. Use actual progress events, cancellation, and Effect Schema response decoding. Display failures and allow retry by removing the failed file. Abort on node removal/unmount and never replace a different node after a late completion.

   ```ts
   // Credentials and bytes exist only in the request, never article attributes.
   formData.set("file", file);
   formData.set("siteId", siteId);
   // Resolve the upload callback with the Worker's public URL.
   const { url } = Schema.decodeUnknownSync(Schema.Struct({ url: Schema.String }))(response);
   ```

3. Install `tiptap-extension-resize-image@1.4.7` in Studio and replace its plain Image extension. Keep the existing node name and block mode. Constrain rendered images to the article width without changing the stored size when the viewport narrows.

   ```ts
   // Existing article documents and upload output already use "image".
   ImageResize.extend({ name: "image" }).configure({ inline: false });
   ```

   ```ts
   // Example: the URL and presentation travel with this node through autosave.
   {
     type: "image",
     attrs: {
       src: uploadedUrl,
       width: 320,
       containerStyle: "width: 320px; margin: 0 auto;",
       wrapperStyle: "display: flex; margin: 0;"
     }
   }
   ```

4. Document upload configuration, formats, failure/retry behavior, and persistence in Studio's README. Preserve concurrent Next.js migration and vendor work.

## Verification

1. Run Studio typechecking and lint through Nx.
2. Check body cursor insertion and required-heading protection.
3. Check file input/drop, progress, cancellation/removal, invalid input, authentication failure, and retry.
4. Confirm Worker/R2 upload and retrieval.
5. Check resize, left/center/right alignment, move, undo/redo, and JSON reload persistence; existing images and narrow widths must render correctly.
6. Do not write or run library tests. Archive only after implementation and verification are complete.

## Defaults

Reuse existing API contracts and public R2 URLs; no database migration. Empty placeholders autosave but uploads do not resume on reload. Removing an image does not delete the R2 object. No captions, wrapping, free placement, or production deployment.

## Verification results

1. Implemented the toolbar, authenticated upload callback, resize/alignment extension, cancellation and retry handling, responsive container CSS, and README. Added the local public API URL to Studio's existing `.env.local`.
2. `pnpm nx run-many -t typecheck lint -p @qrk.sh/studio` ran. Typechecking reported seven existing contract guard errors in `apps/zerospin` (`queryDb` versus `db`), with no errors in the image changes. Lint reported existing Next.js link errors in `app/not-found.tsx` and `app/[username]/Header.tsx`. These unrelated files were not changed.
3. Scoped lint passed for all four changed TypeScript files. The five touched source/style files were formatted; image SCSS compiled successfully.
4. A temporary JSDOM integration harness mounted the actual Article, toolbar, upload node and resize extension, with Clerk/session persistence and XMLHttpRequest replaced at their boundaries. It passed required-heading protection, cursor insertion, MIME/empty/size validation, file selection and drop, progress callbacks, authentication/HTTP/malformed-response failures and retry, URL persistence, left/center/right controls, width resizing, undo/redo, JSON reload, cancellation, node deletion, late completion and unmount cancellation. This verifies application behavior with simulated network/authentication; it does not claim a live Clerk upload or browser geometry check. The existing duplicate Underline extension warning remains outside scope.
5. `pnpm nx run @qrk.sh/api:test:workerd` passed all five existing tests, including upload into the local R2 binding and byte-for-byte retrieval through the returned URL. Clerk token verification is mocked by that existing suite.
6. Live browser verification remains blocked: Chrome returned `ERR_BLOCKED_BY_CLIENT` for the local Studio preview. Actual authenticated browser upload, drag repositioning, full reload through Zerospin, and visual/narrow-screen checks remain unverified. Keep this plan active until those checks can run. No library tests were written or run.
