import { makeAbbreviationIdSchema } from "@zerospin/core/models/makeIdSchema";
import { ApiKeyIdentityResolver } from "@zerospin/dispatch-worker/ApiKeyIdentityResolver";
import { makeDispatchRuntime } from "@zerospin/dispatch-worker/makeDispatchRuntime";
import { WorkerExportsSystemWorkerResolver } from "@zerospin/dispatch-worker/WorkerExportsSystemWorkerResolver";
import { ZerospinApis } from "@zerospin/dispatch-worker/ZerospinApis";
import { ZerospinError } from "@zerospin/error";
import { newWorkersRpcResponse } from "capnweb";
import { env, WorkerEntrypoint } from "cloudflare:workers";
import { Effect, Layer, Schema } from "effect";

// These named exports are the Durable Object classes referenced by
// apps/app/wrangler.jsonc. SystemWorker is a loopback Worker export, so this
// standalone development Worker does not use a dispatch namespace.
export { AccountBlockRepo } from "system-worker";
export { AccountRepo } from "system-worker";
export { ActorRepo } from "system-worker";
export { ActorBlockRepo } from "system-worker";
export { FrontendRepo } from "system-worker";
export { FrontendBlockRepo } from "system-worker";
export { AuthorizationRepo } from "system-worker";
export { SystemLogAgent } from "system-worker";
export { SystemLogRepo } from "system-worker";
export { ServiceRepo } from "system-worker";
export { ServiceBlockRepo } from "system-worker";
export { SystemRepo } from "system-worker";
export { SystemWorker } from "system-worker";

// Validate the configured id once without asserting the branded system-id type.
const qrkSystemId = Schema.decodeUnknownSync(makeAbbreviationIdSchema("sys"))(
  env.ZEROSPIN_SYSTEM_ID,
);

// QRK owns both local API key strings. The dispatch boundary accepts only an
// exact configured key; the user frontend then separately verifies the Clerk
// session token before it selects the QRK actor.
const qrkApis = new ZerospinApis({
  runtime: makeDispatchRuntime({
    systemWorkerResolver: WorkerExportsSystemWorkerResolver,
    apiKeyIdentityResolver: Layer.succeed(ApiKeyIdentityResolver, {
      resolve: ({ apiKey }) => {
        if (apiKey === env.NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY) {
          return Effect.succeed({
            organizationId: "org_qrk_sh_local",
            systemId: qrkSystemId,
            systemEnvironmentId: "dev",
            keyType: "publishable",
            keyPairName: "qrk-sh",
            clerkUserId: "qrk-sh-local",
          });
        }

        if (apiKey === env.ZEROSPIN_SECRET_KEY) {
          return Effect.succeed({
            organizationId: "org_qrk_sh_local",
            systemId: qrkSystemId,
            systemEnvironmentId: "dev",
            keyType: "secret",
            keyPairName: "qrk-sh",
            clerkUserId: "qrk-sh-local",
          });
        }

        return Effect.fail(
          new ZerospinError({
            code: "qrk-api-key-invalid",
            message: "The supplied API key does not match a configured QRK development key",
            status: 401,
          }),
        );
      },
    }),
  }),
});

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoints are default exports.
export default class QrkWorker extends WorkerEntrypoint {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Browser websocket subscriptions are regular Worker fetches rather than
    // Cap'n Web RPC calls. Forward the encoded Durable Object name unchanged
    // after removing the route's optional leading slash.
    if (url.pathname.startsWith("/ws-subscriber/")) {
      const encodedName = decodeURIComponent(url.pathname.slice("/ws-subscriber/".length));
      const name = encodedName.startsWith("/") ? encodedName.slice(1) : encodedName;
      return env.FRONTEND_BLOCK_REPO.getByName(name).fetch(request);
    }

    return newWorkersRpcResponse(request, qrkApis);
  }
}
