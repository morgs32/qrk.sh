import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import {
  LinkCard as LinkCardLeaf,
  LinkCopy as LinkCopyLeaf,
  LinkHeroImage as LinkHeroImageLeaf,
} from "../LinkBrick";
import { linkJsonRenderCatalog } from "./LinkJsonRenderCatalog";

export const { registry } = defineRegistry(linkJsonRenderCatalog, {
  components: {
    ...layoutRegistryComponents,
    LinkCard: ({ children, props }) => (
      <LinkCardLeaf url={typeof props.url === "string" ? props.url : ""}>{children}</LinkCardLeaf>
    ),
    LinkCopy: ({ props }) => (
      <LinkCopyLeaf
        title={typeof props.title === "string" ? props.title : ""}
        siteName={typeof props.siteName === "string" ? props.siteName : ""}
        iconUrl={typeof props.iconUrl === "string" ? props.iconUrl : ""}
      />
    ),
    LinkHeroImage: ({ props }) => (
      <LinkHeroImageLeaf imageUrl={typeof props.imageUrl === "string" ? props.imageUrl : ""} />
    ),
  },
});
