import type { IBackendLibrary } from "../backendLibrary";
import { makeBrickModel } from "./makeBrickModel";
import { makePlacementModel } from "./makePlacementModel";
import { makeModuleSpecContractVersion } from "./makeModuleSpecContractVersion";

export function makeModuleContracts(props: {
  library: IBackendLibrary;
  brick: ReturnType<typeof makeBrickModel>;
  placement: ReturnType<typeof makePlacementModel>;
}) {
  const { library, brick, placement } = props;
  return {
    updateFigmaThumbnailSpecAtBreakpoint: makeModuleSpecContractVersion({
      commandName: "updateFigmaThumbnailSpecAtBreakpoint",
      moduleId: "figma-thumbnail",
      brick: brick,
      placement: placement,
      components: library["figma-thumbnail"].components,
    }),
    updateGithubActivitySpecAtBreakpoint: makeModuleSpecContractVersion({
      commandName: "updateGithubActivitySpecAtBreakpoint",
      moduleId: "github-activity",
      brick: brick,
      placement: placement,
      components: library["github-activity"].components,
    }),
    updateGithubProfileSpecAtBreakpoint: makeModuleSpecContractVersion({
      commandName: "updateGithubProfileSpecAtBreakpoint",
      moduleId: "github-profile",
      brick: brick,
      placement: placement,
      components: library["github-profile"].components,
    }),
    updateGithubRepoSpecAtBreakpoint: makeModuleSpecContractVersion({
      commandName: "updateGithubRepoSpecAtBreakpoint",
      moduleId: "github-repo",
      brick: brick,
      placement: placement,
      components: library["github-repo"].components,
    }),
    updateImageSpecAtBreakpoint: makeModuleSpecContractVersion({
      commandName: "updateImageSpecAtBreakpoint",
      moduleId: "image",
      brick: brick,
      placement: placement,
      components: library["image"].components,
    }),
    updateInstagramSpecAtBreakpoint: makeModuleSpecContractVersion({
      commandName: "updateInstagramSpecAtBreakpoint",
      moduleId: "instagram",
      brick: brick,
      placement: placement,
      components: library["instagram"].components,
    }),
    updateLinkSpecAtBreakpoint: makeModuleSpecContractVersion({
      commandName: "updateLinkSpecAtBreakpoint",
      moduleId: "link",
      brick: brick,
      placement: placement,
      components: library["link"].components,
    }),
    updateMapPlaceSpecAtBreakpoint: makeModuleSpecContractVersion({
      commandName: "updateMapPlaceSpecAtBreakpoint",
      moduleId: "map-place",
      brick: brick,
      placement: placement,
      components: library["map-place"].components,
    }),
    updateSwatchAndIconSpecAtBreakpoint: makeModuleSpecContractVersion({
      commandName: "updateSwatchAndIconSpecAtBreakpoint",
      moduleId: "swatch-and-icon",
      brick: brick,
      placement: placement,
      components: library["swatch-and-icon"].components,
    }),
    updateArticleSpecAtBreakpoint: makeModuleSpecContractVersion({
      commandName: "updateArticleSpecAtBreakpoint",
      moduleId: "article",
      brick: brick,
      placement: placement,
      components: library["article"].components,
    }),
  };
}
