# shadcn Designer image selection and cropping

Checked 2026-11-11 against the supplied rendered dialog, shadcn's public docs,
and the browser bundle shipped with its public Image Generator demo. The
hash in the bundle URL identifies the build inspected. The package is
distributed through a licensed registry. [Image Generator demo](https://ds.shadcn.com/examples/image-generator), [public browser bundle](https://ds.shadcn.com/_next/static/chunks/fb08fc9a9c3b0cc0.js), [installation docs](https://ds.shadcn.com/docs/guides/installation#install-package).

## The image dialog

The supplied HTML shows **Browse** active, **Crop** and **Paste from URL**
inactive, and a search input followed by an Unsplash thumbnail grid and page
controls. The inactive panels are empty in that capture, so their behavior
comes from the published bundle. The Unsplash `crop` query parameter is part of
the thumbnail URL and is separate from the editor's Crop action. The v0.4.0
changelog documents when the plugin dialog and cropper were introduced. [Image Browser guide](https://ds.shadcn.com/docs/guides/image-browser), [v0.4.0 changelog](https://ds.shadcn.com/docs/v0#v040).

- **ActionImage** is the dialog shell for the selected image layer. The
  compact Image button shows a thumbnail when the layer has a source. Each
  plugin supplies an ID, label, description, and panel. The active plugin
  controls the dialog heading and description. [Actions reference](https://ds.shadcn.com/docs/reference/actions#actionimage), [public browser bundle](https://ds.shadcn.com/_next/static/chunks/fb08fc9a9c3b0cc0.js).
- **Browse** calls a caller-supplied API with search and pagination parameters.
  The documented response separates each result's full image URL from its
  thumbnail URL. The grid uses the thumbnail. By default, selecting a result
  sets the full URL on the selected layer, records history, and closes the
  dialog. A caller-supplied selection callback can take over that action. [Image Browser API example](https://ds.shadcn.com/docs/guides/image-browser#build-our-api-route), [public browser bundle](https://ds.shadcn.com/_next/static/chunks/fb08fc9a9c3b0cc0.js).
- **Paste from URL** starts with the selected image URL in a text area. Done
  assigns the supplied URL to the selected layers and closes. Cancel closes
  without applying the text. Browse and URL operate on image references. This
  tab set has no file input or file upload. [Actions reference](https://ds.shadcn.com/docs/reference/actions#actionimageurl), [public browser bundle](https://ds.shadcn.com/_next/static/chunks/fb08fc9a9c3b0cc0.js).

## What Crop saves

Crop is a non-destructive edit to the image layer. The original source remains
in the layer's `value`. The preview draws that source inside a fixed white
frame based on the layer dimensions, with a dark mask outside. Mouse drag
moves the image under the frame and the wheel changes its scale. The inspected
build clamps scale from 1 to a configurable `maxZoom` that defaults to 20.
The preview starts with the existing crop and uses the layer's object fit.
[Cropper changelog](https://ds.shadcn.com/docs/v0#image-cropper), [public browser bundle](https://ds.shadcn.com/_next/static/chunks/fb08fc9a9c3b0cc0.js).

During editing, translation and scale are a preview draft. **Crop** commits
`--content-translate-x`, `--content-translate-y`, and `--content-scale`
to the layer's style values, then closes. **Cancel** closes without committing
that draft. The layer renderer resolves content styles onto the original
`img`. The Crop handler creates no cropped file and sends no upload request.
Fit is separate and writes `--content-object-fit`. The public Image Generator
example also uses the cropper alone in a toolbar dialog. [Public browser bundle](https://ds.shadcn.com/_next/static/chunks/fb08fc9a9c3b0cc0.js), [Image Generator cropper example](https://ds.shadcn.com/docs/examples/image-generator#image-cropper).

Persisting a design is a separate caller operation. The Save to Database
example reads the layers and persists them through a server action. The public
bundle confirms the crop state update and renderer, while the supplied HTML
alone only establishes the visible Browse tab and its controls. [Save to Database example](https://ds.shadcn.com/docs/examples/save#actionsave-component).

## QRK comparison

Bricks' `ImageUploadInput` currently selects a local file, calls `onSelect`,
and closes. The catalog uses an object URL for the selected preview. The
production Image Brick form handles upload through its host-provided SWR
callback and puts the returned URL into its form draft. The Designer reference
is specifically useful for the crop interaction and for keeping image
selection, crop geometry, and persistence distinct. A cropped file would
require a separate pixel-export step. [Image upload input](../../apps/bricks/src/react/ImageUploadInput.tsx), [Form Inputs story](../../apps/bricks/src/react/FormInputs.stories.tsx), [Image Brick form](../../apps/bricks/src/image/react/ImageForm.tsx).
