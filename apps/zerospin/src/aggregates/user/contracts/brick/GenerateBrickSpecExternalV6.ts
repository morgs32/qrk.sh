import { DownAdapterRefused, upgradeAggregateExternalContractRelease } from "@zerospin/sdk";
import { Effect, Schema } from "effect";
import { makeZerospinError } from "@zerospin/error";
import { newHttpBatchRpcSession } from "capnweb";
import { brickV4 as brick } from "../../models/brick/BrickV4";
import { libraryGenerateSpecResponse } from "./GenerateBrickSpecExternalDefinitionV1";
import { generateBrickSpecExternalV5 } from "./GenerateBrickSpecExternalV5";
import { generateBrickSpecExternalDefinitionV6 } from "./GenerateBrickSpecExternalDefinitionV6";

export const generateBrickSpecExternalV6 = upgradeAggregateExternalContractRelease(
  generateBrickSpecExternalV5,
  {
    definition: generateBrickSpecExternalDefinitionV6,
    models: { brick },
    request: Effect.fn("generateBrickSpecExternal.request")(function* (props) {
      const { payload } = props;
      const { env } = yield* Effect.promise(() => import("cloudflare:workers"));
      const { QRK_LIBRARY_API_URL } = yield* Schema.decodeUnknownEffect(
        Schema.Struct({
          QRK_LIBRARY_API_URL: Schema.String.check(
            Schema.makeFilter((value) => {
              if (!URL.canParse(value)) return false;
              const url = new URL(value);
              return url.protocol === "https:" || url.protocol === "http:";
            }),
          ),
        }),
      )(env).pipe(
        Effect.mapError(() =>
          makeZerospinError({
            code: "brick-spec-api-configuration-invalid",
            message: "Set QRK_LIBRARY_API_URL to an absolute HTTP(S) BricksApi RPC URL.",
          }),
        ),
      );
      const controller = new AbortController();
      const response = yield* Effect.acquireUseRelease(
        Effect.try({
          try: () =>
            newHttpBatchRpcSession<{
              generateSpec(
                moduleId: string,
                prompt: string,
                state: unknown,
                currentSpec: unknown,
              ): Promise<unknown>;
            }>(new Request(QRK_LIBRARY_API_URL, { signal: controller.signal })),
          catch: () =>
            makeZerospinError({
              code: "brick-spec-api-request-failed",
              message: "Brick spec generation could not reach BricksApi. Try again.",
            }),
        }),
        (api) =>
          Effect.tryPromise({
            try: async () =>
              await api.generateSpec(
                payload.moduleId,
                payload.prompt,
                payload.state,
                payload.currentSpec,
              ),
            catch: () =>
              makeZerospinError({
                code: "brick-spec-api-request-failed",
                message: "Brick spec generation could not reach BricksApi. Try again.",
              }),
          }),
        (api) =>
          Effect.sync(() => {
            controller.abort();
            api[Symbol.dispose]();
          }),
      );
      return yield* Schema.decodeUnknownEffect(libraryGenerateSpecResponse)(response).pipe(
        Effect.mapError(() =>
          makeZerospinError({
            code: "brick-spec-api-response-invalid",
            message: "BricksApi returned an invalid spec generation response. Try again.",
          }),
        ),
      );
    }),
    down: Effect.fn("generateBrickSpecExternalV6.down")(function* (props) {
      const { payload, externalOutcome } = props;
      if (payload.moduleId === "image-carousel")
        return DownAdapterRefused;
      return { payload: { ...payload, moduleId: payload.moduleId }, externalOutcome };
    }),
  },
);
