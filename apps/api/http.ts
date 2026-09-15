import type { IApiEnv } from "./types";

export const ALLOWED_ORIGINS: readonly string[] = [
  "http://127.0.0.1:3001",
  "http://localhost:3001",
  "https://www.qrk.sh",
  "https://qrk.sh",
];

export function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  if (origin !== null && ALLOWED_ORIGINS.includes(origin)) {
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

export function jsonResponse(
  request: Request,
  body: unknown,
  status: number,
): Response {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

export function emptyCorsResponse(request: Request, status: number): Response {
  return new Response(null, { status, headers: corsHeaders(request) });
}

export function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("Authorization");
  if (authorization === null) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (match === null) {
    return null;
  }
  return match[1] ?? null;
}

export async function requireClerkUserId(
  request: Request,
  env: IApiEnv,
): Promise<string> {
  const { verifyToken } = await import("@clerk/backend");
  const sessionToken = getBearerToken(request);
  if (sessionToken === null) {
    throw new UploadHttpError(401, "missing-authorization", "Authorization Bearer token is required");
  }

  try {
    const verified = await verifyToken(sessionToken, {
      secretKey: env.CLERK_SECRET_KEY,
      authorizedParties: [env.CLERK_AUTHORIZED_PARTY],
    });
    if (typeof verified.sub !== "string" || verified.sub.length === 0) {
      throw new UploadHttpError(401, "invalid-token", "The Clerk session token is missing a subject");
    }
    return verified.sub;
  } catch (cause) {
    if (cause instanceof UploadHttpError) {
      throw cause;
    }
    throw new UploadHttpError(401, "invalid-token", "The Clerk session token could not be verified");
  }
}

export class UploadHttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "UploadHttpError";
    this.status = status;
    this.code = code;
  }
}
