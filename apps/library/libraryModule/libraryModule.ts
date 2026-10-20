import { makeBrickSpecGenerationContracts } from "./contracts/makeBrickSpecGenerationContracts";
import { makeConfigureInstagramContract } from "../modules/instagram/makeConfigureInstagramContract";
import { makeCompleteInstagramContract } from "../modules/instagram/makeCompleteInstagramContract";
import { makeConfigureGithubActivityContract } from "../modules/githubActivity/makeConfigureGithubActivityContract";
import { makeCompleteGithubActivityContract } from "../modules/githubActivity/makeCompleteGithubActivityContract";
import { makeConfigureGithubProfileContract } from "../modules/githubProfile/makeConfigureGithubProfileContract";
import { makeCompleteGithubProfileContract } from "../modules/githubProfile/makeCompleteGithubProfileContract";
import { makeConfigureGithubRepoContract } from "../modules/githubRepo/makeConfigureGithubRepoContract";
import { makeCompleteGithubRepoContract } from "../modules/githubRepo/makeCompleteGithubRepoContract";
import { makeConfigureFigmaThumbnailContract } from "../modules/figmaThumbnail/makeConfigureFigmaThumbnailContract";
import { makeCompleteFigmaThumbnailContract } from "../modules/figmaThumbnail/makeCompleteFigmaThumbnailContract";
import { makeConfigureLinkContract } from "../modules/link/makeConfigureLinkContract";
import { makeCompleteLinkContract } from "../modules/link/makeCompleteLinkContract";
import { makeConfigureMapPlaceContract } from "../modules/mapPlace/makeConfigureMapPlaceContract";
import { makeCompleteMapPlaceContract } from "../modules/mapPlace/makeCompleteMapPlaceContract";
import { backendLibrary } from "../backendLibrary";
import { makeModuleContracts } from "../make/makeModuleContracts";
import { makeUpdateBrickContract } from "./contracts/updateBrick/UpdateBrickContractV1";
import { makeBrickModel } from "./models/brick/makeBrickModel";
import { makePlacementModel } from "./models/placement/placementModelV1";
import { wallModelV1 } from "./models/wall/wallModelV1";

const wall = wallModelV1;
const brick = makeBrickModel({ library: backendLibrary, wall });
const placement = makePlacementModel({ brick });
const updateBrick = makeUpdateBrickContract({
  library: backendLibrary,
  brick,
  placement,
});
const moduleContracts = makeModuleContracts({
  library: backendLibrary,
  brick,
  placement,
});

const specGeneration = makeBrickSpecGenerationContracts({
  library: backendLibrary,
  brick,
  placement,
});
const configureInstagram = makeConfigureInstagramContract({ brick, placement });
const completeInstagram = makeCompleteInstagramContract({ brick, placement });
const configureGithubActivity = makeConfigureGithubActivityContract({ brick, placement });
const completeGithubActivity = makeCompleteGithubActivityContract({ brick, placement });
const configureGithubProfile = makeConfigureGithubProfileContract({ brick, placement });
const completeGithubProfile = makeCompleteGithubProfileContract({ brick, placement });
const configureGithubRepo = makeConfigureGithubRepoContract({ brick, placement });
const completeGithubRepo = makeCompleteGithubRepoContract({ brick, placement });
const configureFigmaThumbnail = makeConfigureFigmaThumbnailContract({ brick, placement });
const completeFigmaThumbnail = makeCompleteFigmaThumbnailContract({ brick, placement });
const configureLink = makeConfigureLinkContract({ brick, placement });
const completeLink = makeCompleteLinkContract({ brick, placement });
const configureMapPlace = makeConfigureMapPlaceContract({ brick, placement });
const completeMapPlace = makeCompleteMapPlaceContract({ brick, placement });

export const libraryModule: {
  models: {
    wall: typeof wall;
    brick: typeof brick;
    placement: typeof placement;
  };
  contracts: {
    generateBrickSpec: typeof specGeneration.generate;
    completeBrickSpecGeneration: typeof specGeneration.complete;
    configureInstagram: typeof configureInstagram;
    completeInstagram: typeof completeInstagram;
    configureGithubActivity: typeof configureGithubActivity;
    completeGithubActivity: typeof completeGithubActivity;
    configureGithubProfile: typeof configureGithubProfile;
    completeGithubProfile: typeof completeGithubProfile;
    configureGithubRepo: typeof configureGithubRepo;
    completeGithubRepo: typeof completeGithubRepo;
    configureFigmaThumbnail: typeof configureFigmaThumbnail;
    completeFigmaThumbnail: typeof completeFigmaThumbnail;
    configureLink: typeof configureLink;
    completeLink: typeof completeLink;
    configureMapPlace: typeof configureMapPlace;
    completeMapPlace: typeof completeMapPlace;
    updateBrick: typeof updateBrick;
    updateFigmaThumbnailSpecAtBreakpoint: typeof moduleContracts.updateFigmaThumbnailSpecAtBreakpoint;
    updateGithubActivitySpecAtBreakpoint: typeof moduleContracts.updateGithubActivitySpecAtBreakpoint;
    updateGithubProfileSpecAtBreakpoint: typeof moduleContracts.updateGithubProfileSpecAtBreakpoint;
    updateGithubRepoSpecAtBreakpoint: typeof moduleContracts.updateGithubRepoSpecAtBreakpoint;
    updateImageSpecAtBreakpoint: typeof moduleContracts.updateImageSpecAtBreakpoint;
    updateInstagramSpecAtBreakpoint: typeof moduleContracts.updateInstagramSpecAtBreakpoint;
    updateLinkSpecAtBreakpoint: typeof moduleContracts.updateLinkSpecAtBreakpoint;
    updateMapPlaceSpecAtBreakpoint: typeof moduleContracts.updateMapPlaceSpecAtBreakpoint;
    updateSwatchAndIconSpecAtBreakpoint: typeof moduleContracts.updateSwatchAndIconSpecAtBreakpoint;
    updateArticleSpecAtBreakpoint: typeof moduleContracts.updateArticleSpecAtBreakpoint;
  };
} = {
  models: {
    wall,
    brick,
    placement,
  },
  contracts: {
    generateBrickSpec: specGeneration.generate,
    completeBrickSpecGeneration: specGeneration.complete,
    configureInstagram,
    completeInstagram,
    configureGithubActivity,
    completeGithubActivity,
    configureGithubProfile,
    completeGithubProfile,
    configureGithubRepo,
    completeGithubRepo,
    configureFigmaThumbnail,
    completeFigmaThumbnail,
    configureLink,
    completeLink,
    configureMapPlace,
    completeMapPlace,
    updateBrick,
    updateFigmaThumbnailSpecAtBreakpoint: moduleContracts.updateFigmaThumbnailSpecAtBreakpoint,
    updateGithubActivitySpecAtBreakpoint: moduleContracts.updateGithubActivitySpecAtBreakpoint,
    updateGithubProfileSpecAtBreakpoint: moduleContracts.updateGithubProfileSpecAtBreakpoint,
    updateGithubRepoSpecAtBreakpoint: moduleContracts.updateGithubRepoSpecAtBreakpoint,
    updateImageSpecAtBreakpoint: moduleContracts.updateImageSpecAtBreakpoint,
    updateInstagramSpecAtBreakpoint: moduleContracts.updateInstagramSpecAtBreakpoint,
    updateLinkSpecAtBreakpoint: moduleContracts.updateLinkSpecAtBreakpoint,
    updateMapPlaceSpecAtBreakpoint: moduleContracts.updateMapPlaceSpecAtBreakpoint,
    updateSwatchAndIconSpecAtBreakpoint: moduleContracts.updateSwatchAndIconSpecAtBreakpoint,
    updateArticleSpecAtBreakpoint: moduleContracts.updateArticleSpecAtBreakpoint,
  },
};
