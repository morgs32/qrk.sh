import { UploadHttpError } from "./http";
import type { IApiEnv } from "./types";

const MAX_BYTES = 5 * 1024 * 1024;

const CONTENT_TYPE_TO_EXT: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const SITE_ID_PATTERN = /^sit_[A-Za-z0-9_-]+$/;

export async function handleUpload(request: Request, env: IApiEnv, clerkUserId: string): Promise<{
  key: string;
  url: string;
  contentType: string;
}> {
  const contentTypeHeader = request.headers.get("Content-Type") ?? "";
  if (!contentTypeHeader.toLowerCase().includes("multipart/form-data")) {
    throw new UploadHttpError(
      400,
      "invalid-content-type",
      "Expected multipart/form-data",
    );
  }

  const formData = await request.formData();
  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    throw new UploadHttpError(400, "missing-file", 'Multipart field "file" is required');
  }

  if (fileEntry.size <= 0) {
    throw new UploadHttpError(400, "empty-file", "Uploaded file is empty");
  }

  if (fileEntry.size > MAX_BYTES) {
    throw new UploadHttpError(400, "file-too-large", "Uploaded file exceeds the 5 MiB limit");
  }

  const contentType = fileEntry.type;
  const ext = CONTENT_TYPE_TO_EXT[contentType];
  if (ext === undefined) {
    throw new UploadHttpError(
      400,
      "unsupported-media-type",
      "Allowed types: image/png, image/jpeg, image/webp, image/svg+xml",
    );
  }

  const siteIdRaw = formData.get("siteId");
  let siteIdSegment = "_";
  if (typeof siteIdRaw === "string" && siteIdRaw.length > 0) {
    if (!SITE_ID_PATTERN.test(siteIdRaw)) {
      throw new UploadHttpError(400, "invalid-site-id", "siteId must look like sit_…");
    }
    siteIdSegment = siteIdRaw;
  }

  const objectId = crypto.randomUUID();
  const key = `${clerkUserId}/${siteIdSegment}/${objectId}.${ext}`;
  const bytes = await fileEntry.arrayBuffer();

  await env.QRKSH.put(key, bytes, {
    httpMetadata: {
      contentType,
    },
  });

  return {
    key,
    url: makePublicObjectUrl(request, env, key),
    contentType,
  };
}

function makePublicObjectUrl(request: Request, env: IApiEnv, key: string): string {
  const base = env.R2_PUBLIC_BASE_URL.replace(/\/$/, "");
  if (base.startsWith("/")) {
    return `${new URL(request.url).origin}${base}/${key}`;
  }
  return `${base}/${key}`;
}
