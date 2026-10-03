import { handleR2Asset } from "@qrk.sh/r2-assets";
import { newWorkersRpcResponse } from "capnweb";

import { BackendRepo } from "./BackendRepo";
import {
  ALLOWED_ORIGINS,
  emptyCorsResponse,
  jsonResponse,
  requireClerkUserId,
  UploadHttpError,
} from "./http";
import { handleUpload } from "./handleUpload";
import { FigmaBackend } from "./modules/figmaThumbnail/FigmaBackend";
import { BrowserHost } from "./modules/instagram/BrowserHost";
import { InstagramBackend } from "./modules/instagram/InstagramBackend";
import { LibraryApi } from "./modules/LibraryApi";
import { LinkBackend } from "./modules/link/LinkBackend";
import { GooglePlacesBackend } from "./modules/mapPlace/GooglePlacesBackend";
import { StreamlineBackend } from "./modules/swatchAndIcon/StreamlineBackend";

export {
  BackendRepo,
  BrowserHost,
  FigmaBackend,
  GooglePlacesBackend,
  InstagramBackend,
  LinkBackend,
  StreamlineBackend,
};

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return emptyCorsResponse(request, 204);
  }

  if (url.pathname === "/rpc") {
    return newWorkersRpcResponse(request, new LibraryApi(env));
  }

  const assetResponse = await handleR2Asset({
    request,
    bucket: url.pathname.startsWith("/assets/library/") ? env.ASSETS : env.QRKSH,
    allowedOrigins: ALLOWED_ORIGINS,
  });
  if (assetResponse !== null) {
    return assetResponse;
  }

  if (url.pathname !== "/upload") {
    return jsonResponse(request, { code: "not-found", message: "Not found" }, 404);
  }

  if (request.method !== "POST") {
    return jsonResponse(request, { code: "method-not-allowed", message: "Use POST /upload" }, 405);
  }

  try {
    const clerkUserId = await requireClerkUserId(request, env);
    const result = await handleUpload(request, env, clerkUserId);
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
