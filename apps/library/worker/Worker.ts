import { handleR2Asset } from "@qrk.sh/r2-assets";
import { newWorkersRpcResponse } from "capnweb";

import { BrowserHost } from "./BrowserHost";
import { FigmaBackend } from "../modules/figmaThumbnail/FigmaBackend";
import { GitHubBackend } from "../modules/githubProfile/GitHubBackend";
import { GooglePlacesBackend } from "../modules/mapPlace/GooglePlacesBackend";
import { InstagramBackend } from "../modules/instagram/InstagramBackend";
import { LinkBackend } from "../modules/link/LinkBackend";
import { handleLibraryUpload, LibraryUploadHttpError } from "./handleLibraryUpload";
import { LibraryApi } from "./LibraryApi";
import { StreamlineBackend } from "../modules/swatchAndIcon/StreamlineBackend";
import type { IScraperEnv } from "./types";

export {
  BrowserHost,
  FigmaBackend,
  GitHubBackend,
  GooglePlacesBackend,
  InstagramBackend,
  LinkBackend,
  StreamlineBackend,
};

const LIBRARY_ALLOWED_ORIGINS: readonly string[] = [
  "http://127.0.0.1:4100",
  "http://localhost:4100",
];

function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  if (origin !== null && LIBRARY_ALLOWED_ORIGINS.includes(origin)) {
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

function jsonResponse(request: Request, body: unknown, status: number): Response {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

async function handleRequest(request: Request, env: IScraperEnv): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const assetResponse = await handleR2Asset({
    request,
    bucket: env.ASSETS,
    allowedOrigins: LIBRARY_ALLOWED_ORIGINS,
  });
  if (assetResponse !== null) {
    return assetResponse;
  }

  if (url.pathname === "/upload") {
    if (request.method !== "POST") {
      return jsonResponse(
        request,
        { code: "method-not-allowed", message: "Use POST /upload" },
        405,
      );
    }
    try {
      const result = await handleLibraryUpload(request, env);
      return jsonResponse(request, result, 200);
    } catch (cause) {
      if (cause instanceof LibraryUploadHttpError) {
        return jsonResponse(
          request,
          { code: cause.code, message: cause.message },
          cause.status,
        );
      }
      return jsonResponse(
        request,
        { code: "internal-error", message: "Upload failed" },
        500,
      );
    }
  }

  return newWorkersRpcResponse(request, new LibraryApi(env));
}

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoint.
export default {
  fetch(request: Request, env: IScraperEnv): Promise<Response> {
    return handleRequest(request, env);
  },
} satisfies ExportedHandler<IScraperEnv>;
