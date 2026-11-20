import { verifyToken } from "@clerk/nextjs/server";
import { SecretKey } from "@zerospin/core/services/SecretKey";
import { getSystemApi } from "@zerospin/core/utils/getSystemApi/getSystemApi";
import { makeQueryDbVersion, ZerospinApiUrl } from "@zerospin/sdk";
import { userV1 } from "@qrk.sh/bricks/zerospin/models/user/UserV1";
import { assignUsernameResult } from "@qrk.sh/zerospin/src/services/users/AssignUsernameV1";
import { usersV1 } from "@qrk.sh/zerospin/src/services/users/usersV1";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

const db = makeQueryDbVersion({ models: { user: userV1 } });

export async function OPTIONS(request: Request) {
  const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://app.qrk.localhost")
    .origin;
  if (request.headers.get("origin") !== appOrigin) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": appOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Cache-Control": "no-store",
      Vary: "Origin",
    },
  });
}

export async function POST(request: Request) {
  const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://app.qrk.localhost")
    .origin;
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== appOrigin) return new Response(null, { status: 403 });
  const headers = {
    "Cache-Control": "no-store",
    Vary: "Origin",
    ...(origin === appOrigin ? { "Access-Control-Allow-Origin": appOrigin } : {}),
  };
  const match = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i);
  if (!match) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("Clerk authentication is not configured");
  let clerkUserId: string;
  try {
    clerkUserId = (await verifyToken(match[1], { secretKey, authorizedParties: [appOrigin] })).sub;
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  let input;
  try {
    input = Schema.decodeUnknownSync(Schema.Struct({ username: Schema.String }))(
      await request.json(),
      { onExcessProperty: "error" },
    );
  } catch {
    return Response.json({ error: "Expected a username" }, { status: 400, headers });
  }
  const endpoint = process.env.ZEROSPIN_API_URL;
  const secret = process.env.ZEROSPIN_SECRET_KEY;
  if (!endpoint || !secret) throw new Error("The Users System API is not configured");
  try {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const api = yield* getSystemApi();
        const owner = yield* api.executeAggregateQuery({
          aggregateName: "user",
          aggregateVersion: 1,
          aggregateId: clerkUserId,
          query: db.query.user.findFirst({ where: { clerkUserId: { eq: clerkUserId } } }),
        });
        if (owner === undefined) return null;
        return yield* api.executeServiceCommand(usersV1, {
          contractName: "assignUsername",
          payload: { userId: owner.id, aggregateId: clerkUserId, username: input.username },
        });
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(ZerospinApiUrl, endpoint),
            Layer.succeed(SecretKey, Redacted.make(secret)),
          ),
        ),
      ),
    );
    if (result === null)
      return Response.json(
        { error: "Open your account before assigning a username" },
        { status: 409, headers },
      );
    if (result.result._tag === "Failure")
      return Response.json({ error: "The assignment command failed" }, { status: 502, headers });
    const assignment = Schema.decodeUnknownSync(assignUsernameResult)(result.result.success);
    return Response.json(assignment, {
      status: assignment.status === "assigned" ? 200 : 409,
      headers,
    });
  } catch {
    return Response.json(
      {
        error:
          "The assignment outcome is unavailable. Check your saved username before trying again.",
      },
      { status: 503, headers },
    );
  }
}
