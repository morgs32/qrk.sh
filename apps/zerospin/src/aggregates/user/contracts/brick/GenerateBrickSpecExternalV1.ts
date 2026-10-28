import { makeAggregateExternalContractRelease, findFirst } from "@zerospin/sdk";
import { makeZerospinError } from "@zerospin/error";
import { newHttpBatchRpcSession } from "capnweb";
import { Effect, Schema } from "effect";

import { backendLibrary as library } from "../../../../modules/backendLibrary";
import { makeModuleSpecDocumentSchema } from "../../../../modules/make/makeModuleSpecDocumentSchema";
import { makePlacementId } from "../../../../modules/lib/makePlacementId";
import { brickV1 as brick } from "../../models/brick/BrickV1";
import { placementV1 as placement } from "../../models/placement/PlacementV1";
import { wallV1 as wall } from "../../models/wall/WallV1";

import {
  generateBrickSpecExternalDefinitionV1,
  libraryGenerateSpecResponse,
} from "./GenerateBrickSpecExternalDefinitionV1";

export const generateBrickSpecExternalV1 = makeAggregateExternalContractRelease(
  generateBrickSpecExternalDefinitionV1,
  {
    models: { brick, placement, wall },
    operations: { updatePlacement: placement.operations.update },
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
            message: "Set QRK_LIBRARY_API_URL to an absolute HTTP(S) LibraryApi RPC URL.",
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
              message: "Brick spec generation could not reach LibraryApi. Try again.",
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
                message: "Brick spec generation could not reach LibraryApi. Try again.",
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
            message: "LibraryApi returned an invalid spec generation response. Try again.",
          }),
        ),
      );
    }),
    program: Effect.fn("generateBrickSpecExternal.program")(function* (props) {
      const { db, payload, externalOutcome, operations } = props;
      const brickRow = yield* findFirst({
        db,
        model: db.models.brick,
        where: { id: { eq: payload.brickId } },
      });
      const placementRow = yield* findFirst({
        db,
        model: db.models.placement,
        where: { id: { eq: makePlacementId(payload.brickId, payload.breakpoint) } },
      });
      const generation = placementRow?.generation;
      if (
        brickRow === undefined ||
        placementRow === undefined ||
        generation?.status !== "generating" ||
        brickRow.moduleId !== payload.moduleId ||
        brickRow.stateRevision !== payload.baseStateRevision ||
        placementRow.specRevision !== payload.baseSpecRevision ||
        generation.requestId !== payload.requestId ||
        generation.prompt !== payload.prompt ||
        generation.baseStateRevision !== payload.baseStateRevision ||
        generation.baseSpecRevision !== payload.baseSpecRevision
      )
        return;
      const wallEntry = yield* findFirst({
        db,
        model: db.models.wall,
        where: { id: { eq: placementRow.wallId } },
      });
      if (
        placementRow.brickId !== brickRow.id ||
        wallEntry === undefined ||
        wallEntry.breakpoint !== payload.breakpoint ||
        wallEntry.pageId !== brickRow.pageId ||
        !wallEntry.layout.sections.some((section) =>
          section.stacks.some((stack) =>
            stack.rows.some((row) => row.placementIds.includes(placementRow.id)),
          ),
        )
      )
        return;
      if (externalOutcome._tag === "Failure") {
        yield* operations.updatePlacement({
          resourceId: placementRow.id,
          attributes: {
            generation: {
              ...generation,
              status: "failed",
              error: {
                code: externalOutcome.failure.code,
                message: externalOutcome.failure.message,
                retryable: true,
              },
            },
          },
        });
        return;
      }
      if (externalOutcome.success._tag === "Left") {
        const { code, message, retryable } = externalOutcome.success.left;
        yield* operations.updatePlacement({
          resourceId: placementRow.id,
          attributes: {
            generation: {
              ...generation,
              status: "failed",
              error: { code, message, retryable: retryable ?? false },
            },
          },
        });
        return;
      }
      const decoded = Schema.decodeUnknownResult(
        makeModuleSpecDocumentSchema(library[brickRow.moduleId].components),
      )(externalOutcome.success.right);
      if (decoded._tag === "Failure") {
        yield* operations.updatePlacement({
          resourceId: placementRow.id,
          attributes: {
            generation: {
              ...generation,
              status: "failed",
              error: {
                code: "generated-spec-invalid",
                message: "The generated spec did not match this module. Try again.",
                retryable: true,
              },
            },
          },
        });
        return;
      }
      yield* operations.updatePlacement({
        resourceId: placementRow.id,
        attributes: {
          spec: structuredClone(decoded.success),
          specRevision: placementRow.specRevision + 1,
          generation: { ...generation, status: "ready", error: null },
        },
      });
    }),
  },
);
