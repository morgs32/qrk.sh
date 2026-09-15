const ASSETS_PREFIX = "/assets/";

export function isR2AssetPath(pathname: string): boolean {
  return pathname.startsWith(ASSETS_PREFIX) && pathname.length > ASSETS_PREFIX.length;
}

export function makePublicObjectUrl(props: {
  request: Request;
  publicBaseUrl: string;
  key: string;
}): string {
  const base = props.publicBaseUrl.replace(/\/$/, "");
  if (base.startsWith("/")) {
    return `${new URL(props.request.url).origin}${base}/${props.key}`;
  }
  return `${base}/${props.key}`;
}

export async function handleR2Asset(props: {
  request: Request;
  bucket: R2Bucket;
  allowedOrigins: readonly string[];
}): Promise<Response | null> {
  const url = new URL(props.request.url);
  if (!isR2AssetPath(url.pathname)) {
    return null;
  }

  if (props.request.method !== "GET") {
    return jsonResponse(
      props.request,
      props.allowedOrigins,
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
      props.request,
      props.allowedOrigins,
      { code: "invalid-asset-key", message: "Asset key could not be decoded" },
      400,
    );
  }

  if (key.length === 0 || key.includes("\0")) {
    return jsonResponse(
      props.request,
      props.allowedOrigins,
      { code: "invalid-asset-key", message: "Asset key is empty" },
      400,
    );
  }

  const object = await props.bucket.get(key);
  if (object === null) {
    return jsonResponse(
      props.request,
      props.allowedOrigins,
      { code: "not-found", message: "Not found" },
      404,
    );
  }

  const headers = corsHeaders(props.request, props.allowedOrigins);
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

function corsHeaders(request: Request, allowedOrigins: readonly string[]): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  if (origin !== null && allowedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type",
  );
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function jsonResponse(
  request: Request,
  allowedOrigins: readonly string[],
  body: unknown,
  status: number,
): Response {
  const headers = corsHeaders(request, allowedOrigins);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}
