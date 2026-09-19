import { makeSelection } from "@zerospin/core/models/makeSelection";

import { backendLibrary, type IBackendLibrary } from "../../backendLibrary";
import { makeModuleContracts } from "../../make/makeModuleContracts";
import { makeAddBrickContract } from "./contracts/addBrick/AddBrickContractV1";
import { makeCompactLayoutAtBreakpointContract } from "./contracts/compactLayoutAtBreakpoint/CompactLayoutAtBreakpointContractV1";
import { makeRemoveBrickContract } from "./contracts/removeBrick/RemoveBrickContractV1";
import { makeSetBrickVisibilityAtBreakpointContract } from "./contracts/setBrickVisibilityAtBreakpoint/SetBrickVisibilityAtBreakpointContractV1";
import { makeUpdateBrickStateContract } from "./contracts/updateBrickState/UpdateBrickStateContractV1";
import { makeUpdateLayoutAtBreakpointContract } from "./contracts/updateLayoutAtBreakpoint/UpdateLayoutAtBreakpointContractV1";
import { makeBrickModel } from "./models/brick/makeBrickModel";
import { makePlacementModel } from "./models/placement/placementModelV1";
import { wallModelV1 } from "./models/wall/wallModelV1";

export function makeLibraryAggregate(backendLibrary: IBackendLibrary) {
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
  const setBrickVisibilityAtBreakpoint =
    makeSetBrickVisibilityAtBreakpointContract({
      brick,
      placement,
    });
  const compactLayoutAtBreakpoint = makeCompactLayoutAtBreakpointContract({
    wall,
    brick,
    placement,
  });
  const updateBrickState = makeUpdateBrickStateContract({
    library: backendLibrary,
    brick,
  });
  const moduleContracts = makeModuleContracts({
    library: backendLibrary,
    brick,
    placement,
  });

  const models = {
    wall,
    brick,
    placement,
  };

  return {
    version: "1.0.0",
    name: "library",
    models,
    contracts: {
      addBrick: { contract: addBrick },
      updateLayoutAtBreakpoint: { contract: updateLayoutAtBreakpoint },
      setBrickVisibilityAtBreakpoint: {
        contract: setBrickVisibilityAtBreakpoint,
      },
      removeBrick: { contract: removeBrick },
      compactLayoutAtBreakpoint: {
        contract: compactLayoutAtBreakpoint,
      },
      updateBrickState: { contract: updateBrickState },
      updateFigmaThumbnailSpecAtBreakpoint: {
        contract: moduleContracts.updateFigmaThumbnailSpecAtBreakpoint,
      },
      updateGithubActivitySpecAtBreakpoint: {
        contract: moduleContracts.updateGithubActivitySpecAtBreakpoint,
      },
      updateGithubProfileSpecAtBreakpoint: {
        contract: moduleContracts.updateGithubProfileSpecAtBreakpoint,
      },
      updateGithubRepoSpecAtBreakpoint: {
        contract: moduleContracts.updateGithubRepoSpecAtBreakpoint,
      },
      updateImageSpecAtBreakpoint: {
        contract: moduleContracts.updateImageSpecAtBreakpoint,
      },
      updateInstagramSpecAtBreakpoint: {
        contract: moduleContracts.updateInstagramSpecAtBreakpoint,
      },
      updateLinkSpecAtBreakpoint: {
        contract: moduleContracts.updateLinkSpecAtBreakpoint,
      },
      updateMapPlaceSpecAtBreakpoint: {
        contract: moduleContracts.updateMapPlaceSpecAtBreakpoint,
      },
      updateSwatchAndIconSpecAtBreakpoint: {
        contract: moduleContracts.updateSwatchAndIconSpecAtBreakpoint,
      },
      updateTextSpecAtBreakpoint: {
        contract: moduleContracts.updateTextSpecAtBreakpoint,
      },
    },
    selections: {
      wall: makeSelection({ model: wall }),
      brick: makeSelection({ model: brick }),
      placement: makeSelection({ model: placement }),
    },
  };
}

export const libraryAggregate = makeLibraryAggregate(backendLibrary);
