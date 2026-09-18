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
  compactVisibleLayout,
  visibleLayoutError,
} from "../../layout/resolveVisibleCollisions";
import { membershipModelV1 } from "../../models/membership/membershipModelV1";
import { placementModelV1 } from "../../models/placement/placementModelV1";
import { wallModelV1 } from "../../models/wall/wallModelV1";
import { compactLayoutAtBreakpoint } from "./compactLayoutAtBreakpoint";

const gridItemSchema = Schema.Struct({
  i: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
  w: Schema.Number,
  h: Schema.Number,
});

const compactLayoutAtBreakpointPayload = {
  wallId: primitives.foreignKey({ abbreviation: wallModelV1.abbreviation }),
  breakpoint: primitives.enum({
    values: ["sm", "md", "lg", "xl"],
  }),
  visibleLayout: primitives.json({
    schema: Schema.Array(gridItemSchema),
  }),
};

export const compactLayoutAtBreakpointContractV1 = makeContractVersion(
  compactLayoutAtBreakpoint,
  {
    payload: compactLayoutAtBreakpointPayload,
    models: {
      wall: wallModelV1,
      membership: membershipModelV1,
      placement: placementModelV1,
    },
    version: "1.0.0",
    guard: Effect.fn("compactLayoutAtBreakpoint.guard")(function* ({
      db,
      payload,
    }: {
      authentication: Readonly<Record<string, unknown>> | null;
      db: Readonly<Pick<IDb, "query">>;
      payload: InferCommandPayload<typeof compactLayoutAtBreakpointPayload>;
    }) {
      const wall = db.query.wall
        .findFirst({
          where: { id: { eq: payload.wallId } },
        })
        .sync();

      if (wall === undefined) {
        return yield* new ZerospinError({
          code: "compact-layout-wall-not-found",
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
      for (const item of payload.visibleLayout) {
        if (layoutIds.has(item.i)) {
          return yield* new ZerospinError({
            code: "compact-layout-duplicate-item",
            message: `visible layout item ${item.i} appears more than once`,
            status: 400,
          });
        }
        layoutIds.add(item.i);

        if (!membershipIds.has(item.i)) {
          return yield* new ZerospinError({
            code: "compact-layout-item-not-on-wall",
            message: `visible layout item ${item.i} is not a membership on wall ${payload.wallId}`,
            status: 400,
          });
        }

        if (!visibleMembershipIds.has(item.i)) {
          return yield* new ZerospinError({
            code: "compact-layout-item-not-visible",
            message: `visible layout item ${item.i} is not visible at breakpoint ${payload.breakpoint}`,
            status: 400,
          });
        }
      }

      if (layoutIds.size !== visibleMembershipIds.size) {
        return yield* new ZerospinError({
          code: "compact-layout-set-mismatch",
          message: `visibleLayout must include exactly the visible placements at breakpoint ${payload.breakpoint}`,
          status: 400,
        });
      }

      for (const membershipId of visibleMembershipIds) {
        if (!layoutIds.has(membershipId)) {
          return yield* new ZerospinError({
            code: "compact-layout-set-mismatch",
            message: `visibleLayout is missing visible membership ${membershipId}`,
            status: 400,
          });
        }
      }

      const layoutError = visibleLayoutError({
        layout: payload.visibleLayout,
        context: "compactLayoutAtBreakpoint",
      });
      if (layoutError !== null) {
        return yield* new ZerospinError({
          code: "compact-layout-invalid",
          message: layoutError,
          status: 400,
        });
      }
    }),
    program: ({ payload, models }) =>
      Effect.gen(function* () {
        const compacted = compactVisibleLayout(payload.visibleLayout);
        const mutations = [];
        for (const item of compacted) {
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
