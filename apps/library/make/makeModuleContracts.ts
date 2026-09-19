import type { IBackendLibrary } from "../backendLibrary";
import { makeBrickModel } from "../makeLibraryFrontend/models/brick/makeBrickModel";
import { makePlacementModel } from "../makeLibraryFrontend/models/placement/placementModelV1";
import { makeModuleSpecContractVersion } from "./makeModuleSpecContractVersion";

export function makeModuleContracts(props: {
  library: IBackendLibrary;
  brick: ReturnType<typeof makeBrickModel>;
  placement: ReturnType<typeof makePlacementModel>;
}) {
  return {
    updateFigmaThumbnailSpecAtBreakpoint: makeModuleSpecContractVersion({
      commandName: "updateFigmaThumbnailSpecAtBreakpoint",
      moduleId: "figma-thumbnail",
      brick: props.brick,
      placement: props.placement,
      components: props.library["figma-thumbnail"].components,
    }),
    updateGithubActivitySpecAtBreakpoint: makeModuleSpecContractVersion({
      commandName: "updateGithubActivitySpecAtBreakpoint",
      moduleId: "github-activity",
      brick: props.brick,
      placement: props.placement,
      components: props.library["github-activity"].components,
    }),
    updateGithubProfileSpecAtBreakpoint: makeModuleSpecContractVersion({
      commandName: "updateGithubProfileSpecAtBreakpoint",
      moduleId: "github-profile",
      brick: props.brick,
      placement: props.placement,
      components: props.library["github-profile"].components,
    }),
    updateGithubRepoSpecAtBreakpoint: makeModuleSpecContractVersion({
      commandName: "updateGithubRepoSpecAtBreakpoint",
      moduleId: "github-repo",
      brick: props.brick,
      placement: props.placement,
      components: props.library["github-repo"].components,
    }),
    updateImageSpecAtBreakpoint: makeModuleSpecContractVersion({
      commandName: "updateImageSpecAtBreakpoint",
      moduleId: "image",
      brick: props.brick,
      placement: props.placement,
      components: props.library["image"].components,
    }),
    updateInstagramSpecAtBreakpoint: makeModuleSpecContractVersion({
      commandName: "updateInstagramSpecAtBreakpoint",
      moduleId: "instagram",
      brick: props.brick,
      placement: props.placement,
      components: props.library["instagram"].components,
    }),
    updateLinkSpecAtBreakpoint: makeModuleSpecContractVersion({
      commandName: "updateLinkSpecAtBreakpoint",
      moduleId: "link",
      brick: props.brick,
      placement: props.placement,
      components: props.library["link"].components,
    }),
    updateMapPlaceSpecAtBreakpoint: makeModuleSpecContractVersion({
      commandName: "updateMapPlaceSpecAtBreakpoint",
      moduleId: "map-place",
      brick: props.brick,
      placement: props.placement,
      components: props.library["map-place"].components,
    }),
    updateSwatchAndIconSpecAtBreakpoint: makeModuleSpecContractVersion({
      commandName: "updateSwatchAndIconSpecAtBreakpoint",
      moduleId: "swatch-and-icon",
      brick: props.brick,
      placement: props.placement,
      components: props.library["swatch-and-icon"].components,
    }),
    updateTextSpecAtBreakpoint: makeModuleSpecContractVersion({
      commandName: "updateTextSpecAtBreakpoint",
      moduleId: "text",
      brick: props.brick,
      placement: props.placement,
      components: props.library["text"].components,
    }),
  };
}
