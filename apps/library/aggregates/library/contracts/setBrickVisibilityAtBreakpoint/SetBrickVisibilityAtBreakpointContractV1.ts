import type { IDb } from "@zerospin/core/drizzle/types";
import { makeContractVersion } from "@zerospin/core/contracts/makeVersion";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { ZerospinError } from "@zerospin/error";
import {
  primitives,
  type InferDecodedRow,
  type InferIdFromAbbreviation,
} from "@zerospin/schema";
import { Effect, Schema } from "effect";

import { placementIdFor } from "../../layout/placementIdFor";
import {
  cloneLayoutItem,
  resolveVisibleCollisions,
  visibleLayoutError,
} from "../../layout/resolveVisibleCollisions";
import { membershipModelV1 } from "../../models/membership/membershipModelV1";
import { placementModelV1 } from "../../models/placement/placementModelV1";
import { setBrickVisibilityAtBreakpoint } from "./setBrickVisibilityAtBreakpoint";

const gridItemSchema = Schema.Struct({
  i: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
  w: Schema.Number,
  h: Schema.Number,
});

const setBrickVisibilityAtBreakpointPayload = {
  membershipId: primitives.foreignKey({
    abbreviation: membershipModelV1.abbreviation,
  }),
  breakpoint: primitives.enum({
    values: ["sm", "md", "lg", "xl"],
  }),
  isVisible: primitives.boolean(),
  currentlyVisible: primitives.boolean(),
  savedGridItem: primitives.json({ schema: gridItemSchema }),
  otherVisibleLayout: primitives.json({
    schema: Schema.Array(gridItemSchema),
  }),
};

export const setBrickVisibilityAtBreakpointContractV1 = makeContractVersion(
  setBrickVisibilityAtBreakpoint,
  {
    payload: setBrickVisibilityAtBreakpointPayload,
    models: {
      membership: membershipModelV1,
      placement: placementModelV1,
    },
    version: "1.0.0",
    guard: Effect.fn("setBrickVisibilityAtBreakpoint.guard")(function* ({
      db,
      payload,
    }: {
      authentication: Readonly<Record<string, unknown>> | null;
      db: Readonly<Pick<IDb, "query">>;
      payload: InferCommandPayload<typeof setBrickVisibilityAtBreakpointPayload>;
    }) {
      const membership = db.query.membership
        .findFirst({
          where: { id: { eq: payload.membershipId } },
        })
        .sync();

      if (membership === undefined) {
        return yield* new ZerospinError({
          code: "set-brick-visibility-membership-not-found",
          message: `membership ${payload.membershipId} was not found`,
          status: 404,
        });
      }

      const expectedPlacementId = placementIdFor(
        payload.membershipId,
        payload.breakpoint,
      );
      const placement = db.query.placement
        .findFirst({
          where: { id: { eq: expectedPlacementId } },
        })
        .sync();

      if (placement === undefined) {
        return yield* new ZerospinError({
          code: "set-brick-visibility-placement-not-found",
          message: `placement ${expectedPlacementId} was not found`,
          status: 404,
        });
      }

      if (placement.isVisible !== payload.currentlyVisible) {
        return yield* new ZerospinError({
          code: "set-brick-visibility-current-mismatch",
          message: `placement ${expectedPlacementId} currentlyVisible must be ${placement.isVisible}`,
          status: 409,
        });
      }

      if (payload.savedGridItem.i !== payload.membershipId) {
        return yield* new ZerospinError({
          code: "set-brick-visibility-saved-item-mismatch",
          message: `savedGridItem.i must equal membershipId ${payload.membershipId}`,
          status: 400,
        });
      }

      const otherIds = new Set<string>();
      for (const item of payload.otherVisibleLayout) {
        if (item.i === payload.membershipId) {
          return yield* new ZerospinError({
            code: "set-brick-visibility-other-includes-self",
            message: `otherVisibleLayout must not include membership ${payload.membershipId}`,
            status: 400,
          });
        }
        if (otherIds.has(item.i)) {
          return yield* new ZerospinError({
            code: "set-brick-visibility-duplicate-other-item",
            message: `otherVisibleLayout item ${item.i} appears more than once`,
            status: 400,
          });
        }
        otherIds.add(item.i);

        const otherMembership = db.query.membership
          .findFirst({
            where: { id: { eq: item.i } },
          })
          .sync();
        if (
          otherMembership === undefined ||
          otherMembership.wallId !== membership.wallId
        ) {
          return yield* new ZerospinError({
            code: "set-brick-visibility-other-not-on-wall",
            message: `otherVisibleLayout item ${item.i} is not a membership on the same wall`,
            status: 400,
          });
        }

        const otherPlacement = db.query.placement
          .findFirst({
            where: {
              id: { eq: placementIdFor(item.i, payload.breakpoint) },
            },
          })
          .sync();
        if (otherPlacement === undefined || !otherPlacement.isVisible) {
          return yield* new ZerospinError({
            code: "set-brick-visibility-other-not-visible",
            message: `otherVisibleLayout item ${item.i} is not visible at breakpoint ${payload.breakpoint}`,
            status: 400,
          });
        }
      }

      if (payload.isVisible && payload.currentlyVisible !== payload.isVisible) {
        const wallMemberships = db.query.membership
          .findMany({
            where: { wallId: { eq: membership.wallId } },
          })
          .sync();
        const expectedOtherVisibleIds = new Set<string>();
        for (const wallMembership of wallMemberships) {
          if (wallMembership.id === payload.membershipId) {
            continue;
          }
          const wallPlacement = db.query.placement
            .findFirst({
              where: {
                id: {
                  eq: placementIdFor(wallMembership.id, payload.breakpoint),
                },
              },
            })
            .sync();
          if (wallPlacement !== undefined && wallPlacement.isVisible) {
            expectedOtherVisibleIds.add(wallMembership.id);
          }
        }

        if (otherIds.size !== expectedOtherVisibleIds.size) {
          return yield* new ZerospinError({
            code: "set-brick-visibility-other-set-mismatch",
            message: `otherVisibleLayout must include exactly the other visible placements at breakpoint ${payload.breakpoint}`,
            status: 400,
          });
        }
        for (const membershipId of expectedOtherVisibleIds) {
          if (!otherIds.has(membershipId)) {
            return yield* new ZerospinError({
              code: "set-brick-visibility-other-set-mismatch",
              message: `otherVisibleLayout is missing visible membership ${membershipId}`,
              status: 400,
            });
          }
        }

        const resolved = resolveVisibleCollisions({
          visibleLayout: payload.otherVisibleLayout,
          incoming: payload.savedGridItem,
        });
        const layoutError = visibleLayoutError({
          layout: resolved,
          context: "setBrickVisibilityAtBreakpoint",
        });
        if (layoutError !== null) {
          return yield* new ZerospinError({
            code: "set-brick-visibility-resolved-invalid",
            message: layoutError,
            status: 400,
          });
        }
      }
    }),
    program: ({ payload, models }) =>
      Effect.gen(function* () {
        if (payload.currentlyVisible === payload.isVisible) {
          return [];
        }

        if (!payload.isVisible) {
          return [
            yield* models.placement.update({
              resourceId: placementIdFor(
                payload.membershipId,
                payload.breakpoint,
              ) as InferIdFromAbbreviation<"plc">,
              attributes: {
                isVisible: false,
              },
            }),
          ];
        }

        const resolved = resolveVisibleCollisions({
          visibleLayout: payload.otherVisibleLayout,
          incoming: cloneLayoutItem(payload.savedGridItem),
        });
        const mutations = [];

        for (const item of resolved) {
          if (item.i === payload.membershipId) {
            mutations.push(
              yield* models.placement.update({
                resourceId: placementIdFor(
                  payload.membershipId,
                  payload.breakpoint,
                ) as InferIdFromAbbreviation<"plc">,
                attributes: {
                  isVisible: true,
                  gridItem: structuredClone(item),
                } as Partial<
                  InferDecodedRow<(typeof placementModelV1)["attributes"]>
                >,
              }),
            );
            continue;
          }

          mutations.push(
            yield* models.placement.update({
              resourceId: placementIdFor(
                item.i,
                payload.breakpoint,
              ) as InferIdFromAbbreviation<"plc">,
              attributes: {
                gridItem: structuredClone(item),
              } as Partial<
                InferDecodedRow<(typeof placementModelV1)["attributes"]>
              >,
            }),
          );
        }

        return mutations;
      }),
  },
);
