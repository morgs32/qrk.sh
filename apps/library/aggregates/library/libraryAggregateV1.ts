import { RoutePattern } from "@remix-run/route-pattern";
import { makeAggregateVersion } from "@zerospin/core/aggregate/makeVersion";
import { makeSelection } from "@zerospin/core/models/makeSelection";
import { Effect, Schema } from "effect";

import { figmaThumbnailContractV1 } from "../../modules/figmaThumbnail/figmaThumbnailContractV1";
import { figmaThumbnailModelV1 } from "../../modules/figmaThumbnail/figmaThumbnailModelV1";
import { githubActivityContractV1 } from "../../modules/githubActivity/githubActivityContractV1";
import { githubActivityModelV1 } from "../../modules/githubActivity/githubActivityModelV1";
import { githubProfileContractV1 } from "../../modules/githubProfile/githubProfileContractV1";
import { githubProfileModelV1 } from "../../modules/githubProfile/githubProfileModelV1";
import { githubRepoContractV1 } from "../../modules/githubRepo/githubRepoContractV1";
import { githubRepoModelV1 } from "../../modules/githubRepo/githubRepoModelV1";
import { imageContractV1 } from "../../modules/image/imageContractV1";
import { imageModelV1 } from "../../modules/image/imageModelV1";
import { instagramContractV1 } from "../../modules/instagram/instagramContractV1";
import { instagramModelV1 } from "../../modules/instagram/instagramModelV1";
import { linkContractV1 } from "../../modules/link/linkContractV1";
import { linkModelV1 } from "../../modules/link/linkModelV1";
import { mapPlaceContractV1 } from "../../modules/mapPlace/mapPlaceContractV1";
import { mapPlaceModelV1 } from "../../modules/mapPlace/mapPlaceModelV1";
import { swatchAndIconContractV1 } from "../../modules/swatchAndIcon/swatchAndIconContractV1";
import { swatchAndIconModelV1 } from "../../modules/swatchAndIcon/swatchAndIconModelV1";
import { textContractV1 } from "../../modules/text/textContractV1";
import { textModelV1 } from "../../modules/text/textModelV1";
import { library } from "./library";

const AggregateIdSchema = Schema.Struct({
  aggregateId: Schema.String,
});

export const libraryAggregateV1 = makeAggregateVersion(library, {
  version: "1.0.0",
  authentication: {
    signatureSchema: AggregateIdSchema,
    authenticationSchema: AggregateIdSchema,
    selectionSchema: AggregateIdSchema,
    pattern: RoutePattern.parse("/:aggregateId"),
    authenticate: Effect.fn("libraryAggregateV1.authenticate")(function* ({
      signature,
    }: {
      signature: { aggregateId: string };
    }) {
      return yield* Effect.succeed({ aggregateId: signature.aggregateId });
    }),
  },
  models: {
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
  contracts: {
    updateFigmaThumbnailState: { contract: figmaThumbnailContractV1 },
    updateGithubActivityState: { contract: githubActivityContractV1 },
    updateGithubProfileState: { contract: githubProfileContractV1 },
    updateGithubRepoState: { contract: githubRepoContractV1 },
    updateImageState: { contract: imageContractV1 },
    updateInstagramState: { contract: instagramContractV1 },
    updateLinkState: { contract: linkContractV1 },
    updateMapPlaceState: { contract: mapPlaceContractV1 },
    updateSwatchAndIconState: { contract: swatchAndIconContractV1 },
    updateTextState: { contract: textContractV1 },
  },
  selections: {
    figmaThumbnail: makeSelection({ model: figmaThumbnailModelV1 }),
    githubActivity: makeSelection({ model: githubActivityModelV1 }),
    githubProfile: makeSelection({ model: githubProfileModelV1 }),
    githubRepo: makeSelection({ model: githubRepoModelV1 }),
    image: makeSelection({ model: imageModelV1 }),
    instagram: makeSelection({ model: instagramModelV1 }),
    link: makeSelection({ model: linkModelV1 }),
    mapPlace: makeSelection({ model: mapPlaceModelV1 }),
    swatchAndIcon: makeSelection({ model: swatchAndIconModelV1 }),
    text: makeSelection({ model: textModelV1 }),
  },
});
