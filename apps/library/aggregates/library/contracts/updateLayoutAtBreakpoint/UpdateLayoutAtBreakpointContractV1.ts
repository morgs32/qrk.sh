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
import { visibleLayoutError } from "../../layout/resolveVisibleCollisions";
import { membershipModelV1 } from "../../models/membership/membershipModelV1";
import { placementModelV1 } from "../../models/placement/placementModelV1";
import { wallModelV1 } from "../../models/wall/wallModelV1";
import { updateLayoutAtBreakpoint } from "./updateLayoutAtBreakpoint";

const gridItemSchema = Schema.Struct({
  i: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
  w: Schema.Number,
  h: Schema.Number,
});

const updateLayoutAtBreakpointPayload = {
  wallId: primitives.foreignKey({ abbreviation: wallModelV1.abbreviation }),
  breakpoint: primitives.enum({
    values: ["sm", "md", "lg", "xl"],
  }),
  layout: primitives.json({
    schema: Schema.Array(gridItemSchema),
  }),
};

export const updateLayoutAtBreakpointContractV1 = makeContractVersion(
  updateLayoutAtBreakpoint,
  {
    payload: updateLayoutAtBreakpointPayload,
    models: {
      wall: wallModelV1,
      membership: membershipModelV1,
      placement: placementModelV1,
    },
    version: "1.0.0",
    guard: Effect.fn("updateLayoutAtBreakpoint.guard")(function* ({
      db,
      payload,
    }: {
      authentication: Readonly<Record<string, unknown>> | null;
      db: Readonly<Pick<IDb, "query">>;
      payload: InferCommandPayload<typeof updateLayoutAtBreakpointPayload>;
    }) {
      const wall = db.query.wall
        .findFirst({
          where: { id: { eq: payload.wallId } },
        })
        .sync();

      if (wall === undefined) {
        return yield* new ZerospinError({
          code: "update-layout-wall-not-found",
          message: `wall ${payload.wallId} was not found`,
          status: 404,
        });
      }

      const memberships = db.query.membership
        .findMany({
          where: { wallId: { eq: payload.wallId } },
        })
        .sync();
      const membershipIds = new Set(memberships.map(membership => membership.id));

      const visibleMembershipIds = new Set<string>();
      for (const membership of memberships) {
        const placement = db.query.placement
          .findFirst({
            where: {
              id: { eq: placementIdFor(membership.id, payload.breakpoint) },
            },
          })
          .sync();
        if (placement !== undefined && placement.isVisible) {
          visibleMembershipIds.add(membership.id);
        }
      }

      const layoutIds = new Set<string>();
      for (const item of payload.layout) {
        if (layoutIds.has(item.i)) {
          return yield* new ZerospinError({
            code: "update-layout-duplicate-item",
            message: `layout item ${item.i} appears more than once`,
            status: 400,
          });
        }
        layoutIds.add(item.i);

        if (!membershipIds.has(item.i)) {
          return yield* new ZerospinError({
            code: "update-layout-item-not-on-wall",
            message: `layout item ${item.i} is not a membership on wall ${payload.wallId}`,
            status: 400,
          });
        }

        if (!visibleMembershipIds.has(item.i)) {
          return yield* new ZerospinError({
            code: "update-layout-item-not-visible",
            message: `layout item ${item.i} is not visible at breakpoint ${payload.breakpoint}`,
            status: 400,
          });
        }
      }

      if (layoutIds.size !== visibleMembershipIds.size) {
        return yield* new ZerospinError({
          code: "update-layout-set-mismatch",
          message: `layout must include exactly the visible placements at breakpoint ${payload.breakpoint}`,
          status: 400,
        });
      }

      for (const membershipId of visibleMembershipIds) {
        if (!layoutIds.has(membershipId)) {
          return yield* new ZerospinError({
            code: "update-layout-set-mismatch",
            message: `layout is missing visible membership ${membershipId}`,
            status: 400,
          });
        }
      }

      const layoutError = visibleLayoutError({
        layout: payload.layout,
        context: "updateLayoutAtBreakpoint",
      });
      if (layoutError !== null) {
        return yield* new ZerospinError({
          code: "update-layout-invalid",
          message: layoutError,
          status: 400,
        });
      }
    }),
    program: ({ payload, models }) =>
      Effect.gen(function* () {
        const mutations = [];
        for (const item of payload.layout) {
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
