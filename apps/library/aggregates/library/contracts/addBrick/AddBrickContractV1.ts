import type { IDb } from "@zerospin/core/drizzle/types";
import { makeContractVersion } from "@zerospin/core/contracts/makeVersion";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { mapParseError, ZerospinError } from "@zerospin/error";
import {
  makeAbbreviationIdSchema,
  makeEffectSchema,
  primitives,
  type InferDecodedRow,
  type InferIdFromAbbreviation,
} from "@zerospin/schema";
import { Effect, Schema } from "effect";

import { makeModuleSpecDocumentSchema } from "../../../../make/makeModuleSpecDocumentSchema";
import { figmaThumbnailModelV1 } from "../../../../modules/figmaThumbnail/figmaThumbnailModelV1";
import { figmaThumbnailV1 } from "../../../../modules/figmaThumbnail/figmaThumbnailV1";
import { githubActivityModelV1 } from "../../../../modules/githubActivity/githubActivityModelV1";
import { githubActivityV1 } from "../../../../modules/githubActivity/githubActivityV1";
import { githubProfileModelV1 } from "../../../../modules/githubProfile/githubProfileModelV1";
import { githubProfileV1 } from "../../../../modules/githubProfile/githubProfileV1";
import { githubRepoModelV1 } from "../../../../modules/githubRepo/githubRepoModelV1";
import { githubRepoV1 } from "../../../../modules/githubRepo/githubRepoV1";
import { imageModelV1 } from "../../../../modules/image/imageModelV1";
import { imageV1 } from "../../../../modules/image/imageV1";
import { instagramModelV1 } from "../../../../modules/instagram/instagramModelV1";
import { instagramV1 } from "../../../../modules/instagram/instagramV1";
import { linkModelV1 } from "../../../../modules/link/linkModelV1";
import { linkV1 } from "../../../../modules/link/linkV1";
import { mapPlaceModelV1 } from "../../../../modules/mapPlace/mapPlaceModelV1";
import { mapPlaceV1 } from "../../../../modules/mapPlace/mapPlaceV1";
import { swatchAndIconModelV1 } from "../../../../modules/swatchAndIcon/swatchAndIconModelV1";
import { swatchAndIconV1 } from "../../../../modules/swatchAndIcon/swatchAndIconV1";
import { textModelV1 } from "../../../../modules/text/textModelV1";
import { textV1 } from "../../../../modules/text/textV1";
import { placementIdFor } from "../../layout/placementIdFor";
import {
  cloneLayoutItem,
  resolveVisibleCollisions,
  visibleLayoutError,
} from "../../layout/resolveVisibleCollisions";
import { membershipModelV1 } from "../../models/membership/membershipModelV1";
import { placementModelV1 } from "../../models/placement/placementModelV1";
import { wallModelV1 } from "../../models/wall/wallModelV1";
import { addBrick } from "./addBrick";

const gridItemSchema = Schema.Struct({
  i: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
  w: Schema.Number,
  h: Schema.Number,
});

const structuralSpecSchema = Schema.Struct({
  root: Schema.String,
  elements: Schema.Record(Schema.String, Schema.Unknown),
  state: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});

const addBrickPayload = {
  wallId: primitives.foreignKey({ abbreviation: wallModelV1.abbreviation }),
  membershipId: primitives.foreignKey({
    abbreviation: membershipModelV1.abbreviation,
  }),
  moduleResourceId: primitives.text(),
  moduleId: primitives.enum({
    values: [
      "figma-thumbnail",
      "github-activity",
      "github-profile",
      "github-repo",
      "image",
      "instagram",
      "link",
      "map-place",
      "swatch-and-icon",
      "text",
    ],
  }),
  state: primitives.json({ schema: Schema.Unknown }),
  spec: primitives.json({ schema: structuralSpecSchema }),
  breakpoint: primitives.enum({
    values: ["sm", "md", "lg", "xl"],
  }),
  droppedItem: primitives.json({ schema: gridItemSchema }),
  resolvedActiveLayout: primitives.json({
    schema: Schema.Array(gridItemSchema),
  }),
  otherBreakpointVisibleLayouts: primitives.json({
    schema: Schema.Struct({
      sm: Schema.Array(gridItemSchema),
      md: Schema.Array(gridItemSchema),
      lg: Schema.Array(gridItemSchema),
      xl: Schema.Array(gridItemSchema),
    }),
  }),
};

export const addBrickContractV1 = makeContractVersion(addBrick, {
  payload: addBrickPayload,
  models: {
    wall: wallModelV1,
    membership: membershipModelV1,
    placement: placementModelV1,
    figmaThumbnail: figmaThumbnailModelV1,
    githubActivity: githubActivityModelV1,
    githubProfile: githubProfileModelV1,
    githubRepo: githubRepoModelV1,
    image: imageModelV1,
    instagram: instagramModelV1,
    link: linkModelV1,
    mapPlace: mapPlaceModelV1,
    swatchAndIcon: swatchAndIconModelV1,
    text: textModelV1,
  },
  version: "1.0.0",
  guard: Effect.fn("addBrick.guard")(function* ({
    db,
    payload,
  }: {
    authentication: Readonly<Record<string, unknown>> | null;
    db: Readonly<Pick<IDb, "query">>;
    payload: InferCommandPayload<typeof addBrickPayload>;
  }) {
    const wall = db.query.wall
      .findFirst({
        where: { id: { eq: payload.wallId } },
      })
      .sync();

    if (wall === undefined) {
      return yield* new ZerospinError({
        code: "add-brick-wall-not-found",
        message: `wall ${payload.wallId} was not found`,
        status: 404,
      });
    }

    const existingMembership = db.query.membership
      .findFirst({
        where: { id: { eq: payload.membershipId } },
      })
      .sync();
    if (existingMembership !== undefined) {
      return yield* new ZerospinError({
        code: "add-brick-membership-exists",
        message: `membership ${payload.membershipId} already exists`,
        status: 409,
      });
    }

    const existingModuleResource = (() => {
      if (payload.moduleId === "figma-thumbnail") {
        return db.query.figmaThumbnail
          .findFirst({
            where: { id: { eq: payload.moduleResourceId } },
          })
          .sync();
      }
      if (payload.moduleId === "github-activity") {
        return db.query.githubActivity
          .findFirst({
            where: { id: { eq: payload.moduleResourceId } },
          })
          .sync();
      }
      if (payload.moduleId === "github-profile") {
        return db.query.githubProfile
          .findFirst({
            where: { id: { eq: payload.moduleResourceId } },
          })
          .sync();
      }
      if (payload.moduleId === "github-repo") {
        return db.query.githubRepo
          .findFirst({
            where: { id: { eq: payload.moduleResourceId } },
          })
          .sync();
      }
      if (payload.moduleId === "image") {
        return db.query.image
          .findFirst({
            where: { id: { eq: payload.moduleResourceId } },
          })
          .sync();
      }
      if (payload.moduleId === "instagram") {
        return db.query.instagram
          .findFirst({
            where: { id: { eq: payload.moduleResourceId } },
          })
          .sync();
      }
      if (payload.moduleId === "link") {
        return db.query.link
          .findFirst({
            where: { id: { eq: payload.moduleResourceId } },
          })
          .sync();
      }
      if (payload.moduleId === "map-place") {
        return db.query.mapPlace
          .findFirst({
            where: { id: { eq: payload.moduleResourceId } },
          })
          .sync();
      }
      if (payload.moduleId === "swatch-and-icon") {
        return db.query.swatchAndIcon
          .findFirst({
            where: { id: { eq: payload.moduleResourceId } },
          })
          .sync();
      }
      return db.query.text
        .findFirst({
          where: { id: { eq: payload.moduleResourceId } },
        })
        .sync();
    })();
    if (existingModuleResource !== undefined) {
      return yield* new ZerospinError({
        code: "add-brick-module-resource-exists",
        message: `module resource ${payload.moduleResourceId} already exists`,
        status: 409,
      });
    }

    for (const breakpoint of ["sm", "md", "lg", "xl"] as Array<
      "sm" | "md" | "lg" | "xl"
    >) {
      const placementId = placementIdFor(payload.membershipId, breakpoint);
      const existingPlacement = db.query.placement
        .findFirst({
          where: { id: { eq: placementId } },
        })
        .sync();
      if (existingPlacement !== undefined) {
        return yield* new ZerospinError({
          code: "add-brick-placement-exists",
          message: `placement ${placementId} already exists`,
          status: 409,
        });
      }
    }

    if (payload.moduleId === "figma-thumbnail") {
      yield* Schema.decodeUnknownEffect(
        makeAbbreviationIdSchema(figmaThumbnailModelV1.abbreviation),
      )(payload.moduleResourceId).pipe(
        mapParseError({
          code: "add-brick-module-resource-id-prefix",
          prefix: `moduleResourceId must use abbreviation ${figmaThumbnailModelV1.abbreviation}`,
        }),
      );
      yield* Schema.decodeUnknownEffect(
        Schema.toType(makeEffectSchema(figmaThumbnailV1.stateShape)),
      )(payload.state, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-state",
          prefix: "addBrick state failed figma-thumbnail decode",
        }),
      );
      yield* Schema.decodeUnknownEffect(
        makeModuleSpecDocumentSchema(figmaThumbnailV1.components),
      )(payload.spec, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-spec",
          prefix: "addBrick spec failed figma-thumbnail decode",
        }),
      );
    } else if (payload.moduleId === "github-activity") {
      yield* Schema.decodeUnknownEffect(
        makeAbbreviationIdSchema(githubActivityModelV1.abbreviation),
      )(payload.moduleResourceId).pipe(
        mapParseError({
          code: "add-brick-module-resource-id-prefix",
          prefix: `moduleResourceId must use abbreviation ${githubActivityModelV1.abbreviation}`,
        }),
      );
      yield* Schema.decodeUnknownEffect(
        Schema.toType(makeEffectSchema(githubActivityV1.stateShape)),
      )(payload.state, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-state",
          prefix: "addBrick state failed github-activity decode",
        }),
      );
      yield* Schema.decodeUnknownEffect(
        makeModuleSpecDocumentSchema(githubActivityV1.components),
      )(payload.spec, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-spec",
          prefix: "addBrick spec failed github-activity decode",
        }),
      );
    } else if (payload.moduleId === "github-profile") {
      yield* Schema.decodeUnknownEffect(
        makeAbbreviationIdSchema(githubProfileModelV1.abbreviation),
      )(payload.moduleResourceId).pipe(
        mapParseError({
          code: "add-brick-module-resource-id-prefix",
          prefix: `moduleResourceId must use abbreviation ${githubProfileModelV1.abbreviation}`,
        }),
      );
      yield* Schema.decodeUnknownEffect(
        Schema.toType(makeEffectSchema(githubProfileV1.stateShape)),
      )(payload.state, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-state",
          prefix: "addBrick state failed github-profile decode",
        }),
      );
      yield* Schema.decodeUnknownEffect(
        makeModuleSpecDocumentSchema(githubProfileV1.components),
      )(payload.spec, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-spec",
          prefix: "addBrick spec failed github-profile decode",
        }),
      );
    } else if (payload.moduleId === "github-repo") {
      yield* Schema.decodeUnknownEffect(
        makeAbbreviationIdSchema(githubRepoModelV1.abbreviation),
      )(payload.moduleResourceId).pipe(
        mapParseError({
          code: "add-brick-module-resource-id-prefix",
          prefix: `moduleResourceId must use abbreviation ${githubRepoModelV1.abbreviation}`,
        }),
      );
      yield* Schema.decodeUnknownEffect(
        Schema.toType(makeEffectSchema(githubRepoV1.stateShape)),
      )(payload.state, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-state",
          prefix: "addBrick state failed github-repo decode",
        }),
      );
      yield* Schema.decodeUnknownEffect(
        makeModuleSpecDocumentSchema(githubRepoV1.components),
      )(payload.spec, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-spec",
          prefix: "addBrick spec failed github-repo decode",
        }),
      );
    } else if (payload.moduleId === "image") {
      yield* Schema.decodeUnknownEffect(
        makeAbbreviationIdSchema(imageModelV1.abbreviation),
      )(payload.moduleResourceId).pipe(
        mapParseError({
          code: "add-brick-module-resource-id-prefix",
          prefix: `moduleResourceId must use abbreviation ${imageModelV1.abbreviation}`,
        }),
      );
      yield* Schema.decodeUnknownEffect(
        Schema.toType(makeEffectSchema(imageV1.stateShape)),
      )(payload.state, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-state",
          prefix: "addBrick state failed image decode",
        }),
      );
      yield* Schema.decodeUnknownEffect(
        makeModuleSpecDocumentSchema(imageV1.components),
      )(payload.spec, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-spec",
          prefix: "addBrick spec failed image decode",
        }),
      );
    } else if (payload.moduleId === "instagram") {
      yield* Schema.decodeUnknownEffect(
        makeAbbreviationIdSchema(instagramModelV1.abbreviation),
      )(payload.moduleResourceId).pipe(
        mapParseError({
          code: "add-brick-module-resource-id-prefix",
          prefix: `moduleResourceId must use abbreviation ${instagramModelV1.abbreviation}`,
        }),
      );
      yield* Schema.decodeUnknownEffect(
        Schema.toType(makeEffectSchema(instagramV1.stateShape)),
      )(payload.state, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-state",
          prefix: "addBrick state failed instagram decode",
        }),
      );
      yield* Schema.decodeUnknownEffect(
        makeModuleSpecDocumentSchema(instagramV1.components),
      )(payload.spec, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-spec",
          prefix: "addBrick spec failed instagram decode",
        }),
      );
    } else if (payload.moduleId === "link") {
      yield* Schema.decodeUnknownEffect(
        makeAbbreviationIdSchema(linkModelV1.abbreviation),
      )(payload.moduleResourceId).pipe(
        mapParseError({
          code: "add-brick-module-resource-id-prefix",
          prefix: `moduleResourceId must use abbreviation ${linkModelV1.abbreviation}`,
        }),
      );
      yield* Schema.decodeUnknownEffect(
        Schema.toType(makeEffectSchema(linkV1.stateShape)),
      )(payload.state, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-state",
          prefix: "addBrick state failed link decode",
        }),
      );
      yield* Schema.decodeUnknownEffect(
        makeModuleSpecDocumentSchema(linkV1.components),
      )(payload.spec, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-spec",
          prefix: "addBrick spec failed link decode",
        }),
      );
    } else if (payload.moduleId === "map-place") {
      yield* Schema.decodeUnknownEffect(
        makeAbbreviationIdSchema(mapPlaceModelV1.abbreviation),
      )(payload.moduleResourceId).pipe(
        mapParseError({
          code: "add-brick-module-resource-id-prefix",
          prefix: `moduleResourceId must use abbreviation ${mapPlaceModelV1.abbreviation}`,
        }),
      );
      yield* Schema.decodeUnknownEffect(
        Schema.toType(makeEffectSchema(mapPlaceV1.stateShape)),
      )(payload.state, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-state",
          prefix: "addBrick state failed map-place decode",
        }),
      );
      yield* Schema.decodeUnknownEffect(
        makeModuleSpecDocumentSchema(mapPlaceV1.components),
      )(payload.spec, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-spec",
          prefix: "addBrick spec failed map-place decode",
        }),
      );
    } else if (payload.moduleId === "swatch-and-icon") {
      yield* Schema.decodeUnknownEffect(
        makeAbbreviationIdSchema(swatchAndIconModelV1.abbreviation),
      )(payload.moduleResourceId).pipe(
        mapParseError({
          code: "add-brick-module-resource-id-prefix",
          prefix: `moduleResourceId must use abbreviation ${swatchAndIconModelV1.abbreviation}`,
        }),
      );
      yield* Schema.decodeUnknownEffect(
        Schema.toType(makeEffectSchema(swatchAndIconV1.stateShape)),
      )(payload.state, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-state",
          prefix: "addBrick state failed swatch-and-icon decode",
        }),
      );
      yield* Schema.decodeUnknownEffect(
        makeModuleSpecDocumentSchema(swatchAndIconV1.components),
      )(payload.spec, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-spec",
          prefix: "addBrick spec failed swatch-and-icon decode",
        }),
      );
    } else {
      yield* Schema.decodeUnknownEffect(
        makeAbbreviationIdSchema(textModelV1.abbreviation),
      )(payload.moduleResourceId).pipe(
        mapParseError({
          code: "add-brick-module-resource-id-prefix",
          prefix: `moduleResourceId must use abbreviation ${textModelV1.abbreviation}`,
        }),
      );
      yield* Schema.decodeUnknownEffect(
        Schema.toType(makeEffectSchema(textV1.stateShape)),
      )(payload.state, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-state",
          prefix: "addBrick state failed text decode",
        }),
      );
      yield* Schema.decodeUnknownEffect(
        makeModuleSpecDocumentSchema(textV1.components),
      )(payload.spec, { onExcessProperty: "error" }).pipe(
        mapParseError({
          code: "add-brick-invalid-spec",
          prefix: "addBrick spec failed text decode",
        }),
      );
    }

    if (payload.droppedItem.i !== payload.membershipId) {
      return yield* new ZerospinError({
        code: "add-brick-dropped-item-mismatch",
        message: `droppedItem.i must equal membershipId ${payload.membershipId}`,
        status: 400,
      });
    }

    const activeLayoutError = visibleLayoutError({
      layout: payload.resolvedActiveLayout,
      context: "addBrick.resolvedActiveLayout",
    });
    if (activeLayoutError !== null) {
      return yield* new ZerospinError({
        code: "add-brick-resolved-active-invalid",
        message: activeLayoutError,
        status: 400,
      });
    }

    const resolvedIncludesMembership = payload.resolvedActiveLayout.some(
      item => item.i === payload.membershipId,
    );
    if (!resolvedIncludesMembership) {
      return yield* new ZerospinError({
        code: "add-brick-resolved-missing-membership",
        message: `resolvedActiveLayout must include membership ${payload.membershipId}`,
        status: 400,
      });
    }

    const wallMemberships = db.query.membership
      .findMany({
        where: { wallId: { eq: payload.wallId } },
      })
      .sync();

    for (const breakpoint of ["sm", "md", "lg", "xl"] as Array<
      "sm" | "md" | "lg" | "xl"
    >) {
      const visibleMembershipIds = new Set<string>();
      for (const membership of wallMemberships) {
        const placement = db.query.placement
          .findFirst({
            where: {
              id: { eq: placementIdFor(membership.id, breakpoint) },
            },
          })
          .sync();
        if (placement !== undefined && placement.isVisible) {
          visibleMembershipIds.add(membership.id);
        }
      }

      const preDropLayout = payload.otherBreakpointVisibleLayouts[breakpoint];
      const preDropIds = new Set<string>();
      for (const item of preDropLayout) {
        if (preDropIds.has(item.i)) {
          return yield* new ZerospinError({
            code: "add-brick-layout-duplicate-item",
            message: `otherBreakpointVisibleLayouts.${breakpoint} repeats item ${item.i}`,
            status: 400,
          });
        }
        preDropIds.add(item.i);

        if (item.i === payload.membershipId) {
          return yield* new ZerospinError({
            code: "add-brick-layout-includes-new-membership",
            message: `otherBreakpointVisibleLayouts.${breakpoint} must not include new membership ${payload.membershipId}`,
            status: 400,
          });
        }

        if (!visibleMembershipIds.has(item.i)) {
          return yield* new ZerospinError({
            code: "add-brick-layout-item-not-visible",
            message: `layout item ${item.i} is not a visible placement on wall ${payload.wallId} at ${breakpoint}`,
            status: 400,
          });
        }
      }

      if (preDropIds.size !== visibleMembershipIds.size) {
        return yield* new ZerospinError({
          code: "add-brick-layout-set-mismatch",
          message: `otherBreakpointVisibleLayouts.${breakpoint} must match the wall's current visible placements`,
          status: 400,
        });
      }

      for (const membershipId of visibleMembershipIds) {
        if (!preDropIds.has(membershipId)) {
          return yield* new ZerospinError({
            code: "add-brick-layout-set-mismatch",
            message: `otherBreakpointVisibleLayouts.${breakpoint} is missing visible membership ${membershipId}`,
            status: 400,
          });
        }
      }

      const otherLayoutError = visibleLayoutError({
        layout: preDropLayout,
        context: `addBrick.otherBreakpointVisibleLayouts.${breakpoint}`,
      });
      if (otherLayoutError !== null) {
        return yield* new ZerospinError({
          code: "add-brick-other-layout-invalid",
          message: otherLayoutError,
          status: 400,
        });
      }
    }

    const activeNeighborIds = new Set<string>();
    for (const item of payload.resolvedActiveLayout) {
      if (item.i === payload.membershipId) {
        continue;
      }
      if (activeNeighborIds.has(item.i)) {
        return yield* new ZerospinError({
          code: "add-brick-resolved-duplicate-neighbor",
          message: `resolvedActiveLayout repeats neighbor ${item.i}`,
          status: 400,
        });
      }
      activeNeighborIds.add(item.i);

      const neighborMembership = wallMemberships.find(
        membership => membership.id === item.i,
      );
      if (neighborMembership === undefined) {
        return yield* new ZerospinError({
          code: "add-brick-resolved-neighbor-not-on-wall",
          message: `resolvedActiveLayout neighbor ${item.i} is not a membership on wall ${payload.wallId}`,
          status: 400,
        });
      }

      const neighborPlacement = db.query.placement
        .findFirst({
          where: {
            id: {
              eq: placementIdFor(item.i, payload.breakpoint),
            },
          },
        })
        .sync();
      if (neighborPlacement === undefined || !neighborPlacement.isVisible) {
        return yield* new ZerospinError({
          code: "add-brick-resolved-neighbor-not-visible",
          message: `resolvedActiveLayout neighbor ${item.i} is not visible at breakpoint ${payload.breakpoint}`,
          status: 400,
        });
      }
    }

    const activeVisibleNeighborIds = new Set<string>();
    for (const membership of wallMemberships) {
      const placement = db.query.placement
        .findFirst({
          where: {
            id: {
              eq: placementIdFor(membership.id, payload.breakpoint),
            },
          },
        })
        .sync();
      if (placement !== undefined && placement.isVisible) {
        activeVisibleNeighborIds.add(membership.id);
      }
    }

    if (activeNeighborIds.size !== activeVisibleNeighborIds.size) {
      return yield* new ZerospinError({
        code: "add-brick-resolved-neighbor-set-mismatch",
        message: `resolvedActiveLayout neighbors must match current visible placements at ${payload.breakpoint}`,
        status: 400,
      });
    }

    for (const membershipId of activeVisibleNeighborIds) {
      if (!activeNeighborIds.has(membershipId)) {
        return yield* new ZerospinError({
          code: "add-brick-resolved-neighbor-set-mismatch",
          message: `resolvedActiveLayout is missing visible neighbor ${membershipId}`,
          status: 400,
        });
      }
    }
  }),
  program: ({ payload, models }) =>
    Effect.gen(function* () {
      const mutations = [];
      const clonedState = structuredClone(payload.state);
      const clonedSpec = structuredClone(payload.spec);

      if (payload.moduleId === "figma-thumbnail") {
        mutations.push(
          yield* models.figmaThumbnail.create({
            resourceId:
              payload.moduleResourceId as InferIdFromAbbreviation<"fgt">,
            attributes: {
              state: clonedState,
            } as InferDecodedRow<(typeof figmaThumbnailModelV1)["attributes"]>,
          }),
        );
      } else if (payload.moduleId === "github-activity") {
        mutations.push(
          yield* models.githubActivity.create({
            resourceId:
              payload.moduleResourceId as InferIdFromAbbreviation<"gha">,
            attributes: {
              state: clonedState,
            } as InferDecodedRow<(typeof githubActivityModelV1)["attributes"]>,
          }),
        );
      } else if (payload.moduleId === "github-profile") {
        mutations.push(
          yield* models.githubProfile.create({
            resourceId:
              payload.moduleResourceId as InferIdFromAbbreviation<"ghp">,
            attributes: {
              state: clonedState,
            } as InferDecodedRow<(typeof githubProfileModelV1)["attributes"]>,
          }),
        );
      } else if (payload.moduleId === "github-repo") {
        mutations.push(
          yield* models.githubRepo.create({
            resourceId:
              payload.moduleResourceId as InferIdFromAbbreviation<"ghr">,
            attributes: {
              state: clonedState,
            } as InferDecodedRow<(typeof githubRepoModelV1)["attributes"]>,
          }),
        );
      } else if (payload.moduleId === "image") {
        mutations.push(
          yield* models.image.create({
            resourceId:
              payload.moduleResourceId as InferIdFromAbbreviation<"img">,
            attributes: {
              state: clonedState,
            } as InferDecodedRow<(typeof imageModelV1)["attributes"]>,
          }),
        );
      } else if (payload.moduleId === "instagram") {
        mutations.push(
          yield* models.instagram.create({
            resourceId:
              payload.moduleResourceId as InferIdFromAbbreviation<"ins">,
            attributes: {
              state: clonedState,
            } as InferDecodedRow<(typeof instagramModelV1)["attributes"]>,
          }),
        );
      } else if (payload.moduleId === "link") {
        mutations.push(
          yield* models.link.create({
            resourceId:
              payload.moduleResourceId as InferIdFromAbbreviation<"lnk">,
            attributes: {
              state: clonedState,
            } as InferDecodedRow<(typeof linkModelV1)["attributes"]>,
          }),
        );
      } else if (payload.moduleId === "map-place") {
        mutations.push(
          yield* models.mapPlace.create({
            resourceId:
              payload.moduleResourceId as InferIdFromAbbreviation<"mpl">,
            attributes: {
              state: clonedState,
            } as InferDecodedRow<(typeof mapPlaceModelV1)["attributes"]>,
          }),
        );
      } else if (payload.moduleId === "swatch-and-icon") {
        mutations.push(
          yield* models.swatchAndIcon.create({
            resourceId:
              payload.moduleResourceId as InferIdFromAbbreviation<"swi">,
            attributes: {
              state: clonedState,
            } as InferDecodedRow<(typeof swatchAndIconModelV1)["attributes"]>,
          }),
        );
      } else {
        mutations.push(
          yield* models.text.create({
            resourceId:
              payload.moduleResourceId as InferIdFromAbbreviation<"txt">,
            attributes: {
              state: clonedState,
            } as InferDecodedRow<(typeof textModelV1)["attributes"]>,
          }),
        );
      }

      mutations.push(
        yield* models.membership.create({
          resourceId: payload.membershipId as InferIdFromAbbreviation<"mem">,
          attributes: {
            wallId: payload.wallId as InferIdFromAbbreviation<"wal">,
            moduleId: payload.moduleId,
            moduleResourceId: payload.moduleResourceId,
          },
        }),
      );

      for (const breakpoint of ["sm", "md", "lg", "xl"] as Array<
        "sm" | "md" | "lg" | "xl"
      >) {
        const layout =
          breakpoint === payload.breakpoint
            ? payload.resolvedActiveLayout
            : resolveVisibleCollisions({
                visibleLayout:
                  payload.otherBreakpointVisibleLayouts[breakpoint],
                incoming: cloneLayoutItem(payload.droppedItem),
              });

        for (const item of layout) {
          if (item.i === payload.membershipId) {
            mutations.push(
              yield* models.placement.create({
                resourceId: placementIdFor(
                  payload.membershipId,
                  breakpoint,
                ) as InferIdFromAbbreviation<"plc">,
                attributes: {
                  membershipId:
                    payload.membershipId as InferIdFromAbbreviation<"mem">,
                  breakpoint,
                  spec: structuredClone(clonedSpec),
                  gridItem: structuredClone(item),
                  isVisible: true,
                } as InferDecodedRow<(typeof placementModelV1)["attributes"]>,
              }),
            );
            continue;
          }

          mutations.push(
            yield* models.placement.update({
              resourceId: placementIdFor(
                item.i,
                breakpoint,
              ) as InferIdFromAbbreviation<"plc">,
              attributes: {
                gridItem: structuredClone(item),
              } as Partial<
                InferDecodedRow<(typeof placementModelV1)["attributes"]>
              >,
            }),
          );
        }
      }

      return mutations;
    }),
});
