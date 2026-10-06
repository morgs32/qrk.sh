import { backendLibrary } from "../backendLibrary";
import { makeModuleContracts } from "../make/makeModuleContracts";
import { makeAddBrickContract } from "./contracts/addBrick/AddBrickContractV1";
import { makeCompactLayoutAtBreakpointContract } from "./contracts/compactLayoutAtBreakpoint/CompactLayoutAtBreakpointContractV1";
import { makeRemoveBrickContract } from "./contracts/removeBrick/RemoveBrickContractV1";
import { makeSetBrickVisibilityAtBreakpointContract } from "./contracts/setBrickVisibilityAtBreakpoint/SetBrickVisibilityAtBreakpointContractV1";
import { makeUpdateBrickContract } from "./contracts/updateBrick/UpdateBrickContractV1";
import { makeUpdateLayoutAtBreakpointContract } from "./contracts/updateLayoutAtBreakpoint/UpdateLayoutAtBreakpointContractV1";
import { makeBrickModel } from "./models/brick/makeBrickModel";
import { makePlacementModel } from "./models/placement/placementModelV1";
import { wallModelV1 } from "./models/wall/wallModelV1";

const wall = wallModelV1;
const brick = makeBrickModel({ library: backendLibrary, wall });
const placement = makePlacementModel({ brick });
const addBrick = makeAddBrickContract({
  library: backendLibrary,
  wall,
  brick,
  placement,
});
const removeBrick = makeRemoveBrickContract({ wall, brick, placement });
const updateLayoutAtBreakpoint = makeUpdateLayoutAtBreakpointContract({
  wall,
  brick,
  placement,
});
const setBrickVisibilityAtBreakpoint = makeSetBrickVisibilityAtBreakpointContract({
  brick,
  placement,
});
const compactLayoutAtBreakpoint = makeCompactLayoutAtBreakpointContract({
  wall,
  brick,
  placement,
});
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

export const libraryModule = {
  models: {
    wall,
    brick,
    placement,
  },
  contracts: {
    addBrick,
    updateLayoutAtBreakpoint,
    setBrickVisibilityAtBreakpoint,
    removeBrick,
    compactLayoutAtBreakpoint,
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
