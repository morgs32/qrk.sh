import { BackendRepo } from "@qrk.sh/bricks/worker/BackendRepo";
import { BricksApi } from "@qrk.sh/bricks/worker/BricksApi";
import { FigmaBackend } from "@qrk.sh/bricks/worker/figmaThumbnail/FigmaBackend";
import { BrowserHost } from "@qrk.sh/bricks/worker/instagram/BrowserHost";
import { LinkBackend } from "@qrk.sh/bricks/worker/link/LinkBackend";
import { GooglePlacesBackend } from "@qrk.sh/bricks/worker/mapPlace/GooglePlacesBackend";
import { newWorkersRpcResponse } from "capnweb";

import { handleR2Asset } from "./assets";
import { emptyCorsResponse, jsonResponse, requireClerkUserId, UploadHttpError } from "./http";
import { handleUpload } from "./handleUpload";

export { BackendRepo, BrowserHost, FigmaBackend, GooglePlacesBackend, LinkBackend };

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return emptyCorsResponse(request, 204);
  }

  if (url.pathname === "/") {
    return newWorkersRpcResponse(request, new BricksApi(env));
  }

  const assetResponse = await handleR2Asset({
    request,
    bucket: url.pathname.startsWith("/assets/library/") ? env.ASSETS : env.QRKSH,
  });
  if (assetResponse !== null) {
    return assetResponse;
  }

  if (url.pathname !== "/upload" && url.pathname !== "/image/upload") {
    return jsonResponse(request, { code: "not-found", message: "Not found" }, 404);
  }

  if (request.method !== "POST") {
    return jsonResponse(
      request,
      { code: "method-not-allowed", message: `Use POST ${url.pathname}` },
      405,
    );
  }

  try {
    const ownerPrefix =
      url.pathname === "/image/upload" ? "image" : await requireClerkUserId(request, env);
    const result = await handleUpload(request, env, ownerPrefix);
    return jsonResponse(request, result, 200);
  } catch (cause) {
    if (cause instanceof UploadHttpError) {
      return jsonResponse(request, { code: cause.code, message: cause.message }, cause.status);
    }
    return jsonResponse(request, { code: "internal-error", message: "Upload failed" }, 500);
  }
}

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoint.
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
} satisfies ExportedHandler<Env>;
