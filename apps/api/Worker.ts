import { emptyCorsResponse, jsonResponse, requireClerkUserId, UploadHttpError } from "./http";
import { handleUpload } from "./handleUpload";
import type { IApiEnv } from "./types";

async function handleRequest(request: Request, env: IApiEnv): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return emptyCorsResponse(request, 204);
  }

  if (url.pathname !== "/upload") {
    return jsonResponse(request, { code: "not-found", message: "Not found" }, 404);
  }

  if (request.method !== "POST") {
    return jsonResponse(
      request,
      { code: "method-not-allowed", message: "Use POST /upload" },
      405,
    );
  }

  try {
    const clerkUserId = await requireClerkUserId(request, env);
    const result = await handleUpload(request, env, clerkUserId);
    return jsonResponse(request, result, 200);
  } catch (cause) {
    if (cause instanceof UploadHttpError) {
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

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoint.
export default {
  fetch(request: Request, env: IApiEnv): Promise<Response> {
    return handleRequest(request, env);
  },
} satisfies ExportedHandler<IApiEnv>;
