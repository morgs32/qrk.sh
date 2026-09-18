import type { IDb } from "@zerospin/core/drizzle/types";
import { makeContractVersion } from "@zerospin/core/contracts/makeVersion";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { ZerospinError } from "@zerospin/error";
import {
  primitives,
  type InferIdFromAbbreviation,
} from "@zerospin/schema";
import { Effect } from "effect";

import { figmaThumbnailModelV1 } from "../../../../modules/figmaThumbnail/figmaThumbnailModelV1";
import { githubActivityModelV1 } from "../../../../modules/githubActivity/githubActivityModelV1";
import { githubProfileModelV1 } from "../../../../modules/githubProfile/githubProfileModelV1";
import { githubRepoModelV1 } from "../../../../modules/githubRepo/githubRepoModelV1";
import { imageModelV1 } from "../../../../modules/image/imageModelV1";
import { instagramModelV1 } from "../../../../modules/instagram/instagramModelV1";
import { linkModelV1 } from "../../../../modules/link/linkModelV1";
import { mapPlaceModelV1 } from "../../../../modules/mapPlace/mapPlaceModelV1";
import { swatchAndIconModelV1 } from "../../../../modules/swatchAndIcon/swatchAndIconModelV1";
import { textModelV1 } from "../../../../modules/text/textModelV1";
import { placementIdFor } from "../../layout/placementIdFor";
import { membershipModelV1 } from "../../models/membership/membershipModelV1";
import { placementModelV1 } from "../../models/placement/placementModelV1";
import { wallModelV1 } from "../../models/wall/wallModelV1";
import { removeBrick } from "./removeBrick";

const removeBrickPayload = {
  membershipId: primitives.foreignKey({
    abbreviation: membershipModelV1.abbreviation,
  }),
  wallId: primitives.foreignKey({ abbreviation: wallModelV1.abbreviation }),
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
  moduleResourceId: primitives.text(),
};

export const removeBrickContractV1 = makeContractVersion(removeBrick, {
  payload: removeBrickPayload,
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
  guard: Effect.fn("removeBrick.guard")(function* ({
    db,
    payload,
  }: {
    authentication: Readonly<Record<string, unknown>> | null;
    db: Readonly<Pick<IDb, "query">>;
    payload: InferCommandPayload<typeof removeBrickPayload>;
  }) {
    const wall = db.query.wall
      .findFirst({
        where: { id: { eq: payload.wallId } },
      })
      .sync();

    if (wall === undefined) {
      return yield* new ZerospinError({
        code: "remove-brick-wall-not-found",
        message: `wall ${payload.wallId} was not found`,
        status: 404,
      });
    }

    const membership = db.query.membership
      .findFirst({
        where: { id: { eq: payload.membershipId } },
      })
      .sync();

    if (membership === undefined) {
      return yield* new ZerospinError({
        code: "remove-brick-membership-not-found",
        message: `membership ${payload.membershipId} was not found`,
        status: 404,
      });
    }

    if (membership.wallId !== payload.wallId) {
      return yield* new ZerospinError({
        code: "remove-brick-wall-mismatch",
        message: `membership ${payload.membershipId} does not belong to wall ${payload.wallId}`,
        status: 400,
      });
    }

    if (membership.moduleId !== payload.moduleId) {
      return yield* new ZerospinError({
        code: "remove-brick-module-id-mismatch",
        message: `membership ${payload.membershipId} moduleId is ${membership.moduleId}, not ${payload.moduleId}`,
        status: 400,
      });
    }

    if (membership.moduleResourceId !== payload.moduleResourceId) {
      return yield* new ZerospinError({
        code: "remove-brick-module-resource-mismatch",
        message: `membership ${payload.membershipId} moduleResourceId is ${membership.moduleResourceId}, not ${payload.moduleResourceId}`,
        status: 400,
      });
    }
  }),
  program: ({ payload, models }) =>
    Effect.gen(function* () {
      const mutations = [];

      for (const breakpoint of ["sm", "md", "lg", "xl"] as Array<
        "sm" | "md" | "lg" | "xl"
      >) {
        mutations.push(
          yield* models.placement.delete({
            resourceId: placementIdFor(
              payload.membershipId,
              breakpoint,
            ) as InferIdFromAbbreviation<"plc">,
          }),
        );
      }

      mutations.push(
        yield* models.membership.delete({
          resourceId: payload.membershipId as InferIdFromAbbreviation<"mem">,
        }),
      );

      if (payload.moduleId === "figma-thumbnail") {
        mutations.push(
          yield* models.figmaThumbnail.delete({
            resourceId:
              payload.moduleResourceId as InferIdFromAbbreviation<"fgt">,
          }),
        );
      } else if (payload.moduleId === "github-activity") {
        mutations.push(
          yield* models.githubActivity.delete({
            resourceId:
              payload.moduleResourceId as InferIdFromAbbreviation<"gha">,
          }),
        );
      } else if (payload.moduleId === "github-profile") {
        mutations.push(
          yield* models.githubProfile.delete({
            resourceId:
              payload.moduleResourceId as InferIdFromAbbreviation<"ghp">,
          }),
        );
      } else if (payload.moduleId === "github-repo") {
        mutations.push(
          yield* models.githubRepo.delete({
            resourceId:
              payload.moduleResourceId as InferIdFromAbbreviation<"ghr">,
          }),
        );
      } else if (payload.moduleId === "image") {
        mutations.push(
          yield* models.image.delete({
            resourceId:
              payload.moduleResourceId as InferIdFromAbbreviation<"img">,
          }),
        );
      } else if (payload.moduleId === "instagram") {
        mutations.push(
          yield* models.instagram.delete({
            resourceId:
              payload.moduleResourceId as InferIdFromAbbreviation<"ins">,
          }),
        );
      } else if (payload.moduleId === "link") {
        mutations.push(
          yield* models.link.delete({
            resourceId:
              payload.moduleResourceId as InferIdFromAbbreviation<"lnk">,
          }),
        );
      } else if (payload.moduleId === "map-place") {
        mutations.push(
          yield* models.mapPlace.delete({
            resourceId:
              payload.moduleResourceId as InferIdFromAbbreviation<"mpl">,
          }),
        );
      } else if (payload.moduleId === "swatch-and-icon") {
        mutations.push(
          yield* models.swatchAndIcon.delete({
            resourceId:
              payload.moduleResourceId as InferIdFromAbbreviation<"swi">,
          }),
        );
      } else {
        mutations.push(
          yield* models.text.delete({
            resourceId:
              payload.moduleResourceId as InferIdFromAbbreviation<"txt">,
          }),
        );
      }

      return mutations;
    }),
});
