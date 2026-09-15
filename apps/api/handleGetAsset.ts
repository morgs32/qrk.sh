import { corsHeaders, jsonResponse } from "./http";
import type { IApiEnv } from "./types";

const ASSETS_PREFIX = "/assets/";

export function isAssetPath(pathname: string): boolean {
  return pathname.startsWith(ASSETS_PREFIX) && pathname.length > ASSETS_PREFIX.length;
}

export async function handleGetAsset(
  request: Request,
  env: IApiEnv,
): Promise<Response> {
  const url = new URL(request.url);
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

  const object = await env.QRKSH.get(key);
  if (object === null) {
    return jsonResponse(request, { code: "not-found", message: "Not found" }, 404);
  }

  const headers = corsHeaders(request);
  headers.set(
    "Content-Type",
    object.httpMetadata?.contentType ?? "application/octet-stream",
  );
  if (object.httpEtag !== undefined && object.httpEtag.length > 0) {
    headers.set("ETag", object.httpEtag);
  }

  return new Response(object.body, {
    status: 200,
    headers,
  });
}
