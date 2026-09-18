import { RoutePattern } from "@remix-run/route-pattern";
import { makeFrontendController } from "@zerospin/core/frontendController/makeFrontendController";
import { PublishableKey } from "@zerospin/core/services/PublishableKey";
import { ZerospinApiUrl } from "@zerospin/core/services/ZerospinApiUrl";
import { makeZerospinApp } from "@zerospin/react";
import { Layer, Redacted, Schema } from "effect";

import { figmaThumbnailContractV1 } from "../../modules/figmaThumbnail/figmaThumbnailContractV1";
import { figmaThumbnailModelV1 } from "../../modules/figmaThumbnail/figmaThumbnailModelV1";
import { figmaThumbnailSpecContractV1 } from "../../modules/figmaThumbnail/figmaThumbnailSpecContractV1";
import { githubActivityContractV1 } from "../../modules/githubActivity/githubActivityContractV1";
import { githubActivityModelV1 } from "../../modules/githubActivity/githubActivityModelV1";
import { githubActivitySpecContractV1 } from "../../modules/githubActivity/githubActivitySpecContractV1";
import { githubProfileContractV1 } from "../../modules/githubProfile/githubProfileContractV1";
import { githubProfileModelV1 } from "../../modules/githubProfile/githubProfileModelV1";
import { githubProfileSpecContractV1 } from "../../modules/githubProfile/githubProfileSpecContractV1";
import { githubRepoContractV1 } from "../../modules/githubRepo/githubRepoContractV1";
import { githubRepoModelV1 } from "../../modules/githubRepo/githubRepoModelV1";
import { githubRepoSpecContractV1 } from "../../modules/githubRepo/githubRepoSpecContractV1";
import { imageContractV1 } from "../../modules/image/imageContractV1";
import { imageModelV1 } from "../../modules/image/imageModelV1";
import { imageSpecContractV1 } from "../../modules/image/imageSpecContractV1";
import { instagramContractV1 } from "../../modules/instagram/instagramContractV1";
import { instagramModelV1 } from "../../modules/instagram/instagramModelV1";
import { instagramSpecContractV1 } from "../../modules/instagram/instagramSpecContractV1";
import { linkContractV1 } from "../../modules/link/linkContractV1";
import { linkModelV1 } from "../../modules/link/linkModelV1";
import { linkSpecContractV1 } from "../../modules/link/linkSpecContractV1";
import { mapPlaceContractV1 } from "../../modules/mapPlace/mapPlaceContractV1";
import { mapPlaceModelV1 } from "../../modules/mapPlace/mapPlaceModelV1";
import { mapPlaceSpecContractV1 } from "../../modules/mapPlace/mapPlaceSpecContractV1";
import { swatchAndIconContractV1 } from "../../modules/swatchAndIcon/swatchAndIconContractV1";
import { swatchAndIconModelV1 } from "../../modules/swatchAndIcon/swatchAndIconModelV1";
import { swatchAndIconSpecContractV1 } from "../../modules/swatchAndIcon/swatchAndIconSpecContractV1";
import { textContractV1 } from "../../modules/text/textContractV1";
import { textModelV1 } from "../../modules/text/textModelV1";
import { textSpecContractV1 } from "../../modules/text/textSpecContractV1";
import { addBrickContractV1 } from "./contracts/addBrick/AddBrickContractV1";
import { compactLayoutAtBreakpointContractV1 } from "./contracts/compactLayoutAtBreakpoint/CompactLayoutAtBreakpointContractV1";
import { removeBrickContractV1 } from "./contracts/removeBrick/RemoveBrickContractV1";
import { setBrickVisibilityAtBreakpointContractV1 } from "./contracts/setBrickVisibilityAtBreakpoint/SetBrickVisibilityAtBreakpointContractV1";
import { updateLayoutAtBreakpointContractV1 } from "./contracts/updateLayoutAtBreakpoint/UpdateLayoutAtBreakpointContractV1";
import type { librarySystem } from "./librarySystem";
import { membershipModelV1 } from "./models/membership/membershipModelV1";
import { placementModelV1 } from "./models/placement/placementModelV1";
import { wallModelV1 } from "./models/wall/wallModelV1";

const AggregateIdSchema = Schema.Struct({
  aggregateId: Schema.String,
});

const libraryFrontendController = makeFrontendController({
  authentication: {
    signatureSchema: AggregateIdSchema,
    authenticationSchema: AggregateIdSchema,
    selectionSchema: AggregateIdSchema,
    pattern: RoutePattern.parse("/:aggregateId"),
  },
  aggregateVersion: "1.0.0",
  aggregateName: "library",
  name: "library",
  systemName: "library",
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
  contracts: {
    addBrick: { contract: addBrickContractV1 },
    updateLayoutAtBreakpoint: { contract: updateLayoutAtBreakpointContractV1 },
    setBrickVisibilityAtBreakpoint: {
      contract: setBrickVisibilityAtBreakpointContractV1,
    },
    removeBrick: { contract: removeBrickContractV1 },
    compactLayoutAtBreakpoint: {
      contract: compactLayoutAtBreakpointContractV1,
    },
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
    updateFigmaThumbnailSpecAtBreakpoint: {
      contract: figmaThumbnailSpecContractV1,
    },
    updateGithubActivitySpecAtBreakpoint: {
      contract: githubActivitySpecContractV1,
    },
    updateGithubProfileSpecAtBreakpoint: {
      contract: githubProfileSpecContractV1,
    },
    updateGithubRepoSpecAtBreakpoint: { contract: githubRepoSpecContractV1 },
    updateImageSpecAtBreakpoint: { contract: imageSpecContractV1 },
    updateInstagramSpecAtBreakpoint: { contract: instagramSpecContractV1 },
    updateLinkSpecAtBreakpoint: { contract: linkSpecContractV1 },
    updateMapPlaceSpecAtBreakpoint: { contract: mapPlaceSpecContractV1 },
    updateSwatchAndIconSpecAtBreakpoint: {
      contract: swatchAndIconSpecContractV1,
    },
    updateTextSpecAtBreakpoint: { contract: textSpecContractV1 },
  },
});

export const sessionRuntimeLayer = Layer.mergeAll(
  Layer.succeed(PublishableKey, Redacted.make("pk_library_sandbox")),
  Layer.succeed(ZerospinApiUrl, "https://api.library.sandbox.test"),
);

const LibraryZerospinApp = makeZerospinApp<typeof librarySystem>({
  systemName: "library",
  layer: sessionRuntimeLayer,
});

export const LibraryFrontend = LibraryZerospinApp.makeFrontend(
  libraryFrontendController,
);
