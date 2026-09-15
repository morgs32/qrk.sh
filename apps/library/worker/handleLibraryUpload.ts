import { makePublicObjectUrl } from "@qrk.sh/r2-assets";

import type { IScraperEnv } from "./types";

const MAX_BYTES = 5 * 1024 * 1024;

const CONTENT_TYPE_TO_EXT: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export class LibraryUploadHttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "LibraryUploadHttpError";
    this.status = status;
    this.code = code;
  }
}

export async function handleLibraryUpload(
  request: Request,
  env: IScraperEnv,
): Promise<{
  key: string;
  url: string;
  contentType: string;
}> {
  const contentTypeHeader = request.headers.get("Content-Type") ?? "";
  if (!contentTypeHeader.toLowerCase().includes("multipart/form-data")) {
    throw new LibraryUploadHttpError(
      400,
      "invalid-content-type",
      "Expected multipart/form-data",
    );
  }

  const formData = await request.formData();
  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    throw new LibraryUploadHttpError(
      400,
      "missing-file",
      'Multipart field "file" is required',
    );
  }

  if (fileEntry.size <= 0) {
    throw new LibraryUploadHttpError(400, "empty-file", "Uploaded file is empty");
  }

  if (fileEntry.size > MAX_BYTES) {
    throw new LibraryUploadHttpError(
      400,
      "file-too-large",
      "Uploaded file exceeds the 5 MiB limit",
    );
  }

  const contentType = fileEntry.type;
  const ext = CONTENT_TYPE_TO_EXT[contentType];
  if (ext === undefined) {
    throw new LibraryUploadHttpError(
      400,
      "unsupported-media-type",
      "Allowed types: image/png, image/jpeg, image/webp, image/svg+xml",
    );
  }

  const objectId = crypto.randomUUID();
  const key = `library/${objectId}.${ext}`;
  const bytes = await fileEntry.arrayBuffer();

  await env.ASSETS.put(key, bytes, {
    httpMetadata: {
      contentType,
    },
  });

  return {
    key,
    url: makePublicObjectUrl({
      request,
      publicBaseUrl: env.R2_PUBLIC_BASE_URL,
      key,
    }),
    contentType,
  };
}
