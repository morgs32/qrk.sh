import { verifyToken } from "@clerk/nextjs/server";
import { SecretKey } from "@zerospin/core/services/SecretKey";
import { getSystemApi } from "@zerospin/core/utils/getSystemApi/getSystemApi";
import { makeQueryDbVersion, ZerospinApiUrl } from "@zerospin/sdk";
import { usernameV1 } from "@qrk.sh/zerospin/src/services/users/UsernameV1";
import { Effect, Layer, Redacted } from "effect";

const db = makeQueryDbVersion({ models: { username: usernameV1 } });

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://app.qrk.localhost")
    .origin;
  if (origin !== appOrigin) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": appOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization",
      "Cache-Control": "no-store",
      Vary: "Origin",
    },
  });
}

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://app.qrk.localhost")
    .origin;
  if (origin !== null && origin !== appOrigin) return new Response(null, { status: 403 });
  const headers = {
    "Cache-Control": "no-store",
    Vary: "Origin",
    ...(origin === appOrigin ? { "Access-Control-Allow-Origin": appOrigin } : {}),
  };
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer (\S+)$/i);
  if (match === undefined || match === null)
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const clerkSecret = process.env.CLERK_SECRET_KEY;
  if (!clerkSecret) throw new Error("Clerk authentication is not configured");
  let userId: string;
  try {
    const claims = await verifyToken(match[1], {
      secretKey: clerkSecret,
      authorizedParties: [appOrigin],
    });
    userId = claims.sub;
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  const username = new URL(request.url).searchParams.get("username");
  if (username === null || !/^[a-z0-9]{1,56}$/.test(username)) {
    return Response.json({ error: "Invalid username" }, { status: 400, headers });
  }
  const secret = process.env.ZEROSPIN_SECRET_KEY;
  const endpoint = process.env.ZEROSPIN_API_URL;
  if (!secret || !endpoint) throw new Error("The Users System API is not configured");
  const available = await Effect.runPromise(
    Effect.gen(function* () {
      const api = yield* getSystemApi();
      const spec = yield* api.makeSystemSpec();
      const owner = spec.services.users;
      const release = owner?.releases[String(owner.canonical)];
      if (owner === undefined || release?.models.username !== usernameV1.version) {
        throw new Error("The canonical Users model does not match the availability reader");
      }
      const existing = yield* api.executeServiceQuery({
        serviceName: "users",
        serviceVersion: owner.canonical,
        query: db.query.username.findFirst({
          columns: { aggregateId: true },
          where: { username: { eq: username } },
        }),
      });
      return existing === undefined || existing.aggregateId === userId;
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(ZerospinApiUrl, endpoint),
          Layer.succeed(SecretKey, Redacted.make(secret)),
        ),
      ),
    ),
  );
  return Response.json({ available }, { headers });
}
