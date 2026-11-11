import { corsHeaders, jsonResponse } from "./http";

const ASSETS_PREFIX = "/assets/";

function isR2AssetPath(pathname: string): boolean {
  return pathname.startsWith(ASSETS_PREFIX) && pathname.length > ASSETS_PREFIX.length;
}

export function makePublicObjectUrl(props: { publicBaseUrl: string; key: string }): string {
  const { publicBaseUrl, key } = props;
  return `${publicBaseUrl.replace(/\/$/, "")}/${key}`;
}

export async function handleR2Asset(props: {
  request: Request;
  bucket: R2Bucket;
}): Promise<Response | null> {
  const { request, bucket } = props;
  const url = new URL(request.url);
  if (!isR2AssetPath(url.pathname)) {
    return null;
  }

  if (request.method !== "GET") {
    return jsonResponse(
      request,
      { code: "method-not-allowed", message: "Use GET /assets/*" },
      405,
    );
  }

  const encodedKey = url.pathname.slice(ASSETS_PREFIX.length);
  let key: string;
  try {
    key = decodeURIComponent(encodedKey);
  } catch {
    return jsonResponse(
      request,
      { code: "invalid-asset-key", message: "Asset key could not be decoded" },
      400,
    );
  }

  if (key.length === 0 || key.includes("\0")) {
    return jsonResponse(
      request,
      { code: "invalid-asset-key", message: "Asset key is empty" },
      400,
    );
  }

  const object = await bucket.get(key);
  if (object === null) {
    return jsonResponse(request, { code: "not-found", message: "Not found" }, 404);
  }

  const headers = corsHeaders(request);
  headers.set("Content-Type", object.httpMetadata?.contentType ?? "application/octet-stream");
  if (object.httpEtag !== undefined && object.httpEtag.length > 0) {
    headers.set("ETag", object.httpEtag);
  }

  return new Response(object.body, {
    status: 200,
    headers,
  });
}
