import type { ReactNode } from "react";

import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import {
  LinkCard as LinkCardLeaf,
  LinkCopy as LinkCopyLeaf,
  LinkHeroImage as LinkHeroImageLeaf,
} from "../LinkBrick";
import { linkV1 } from "../linkV1";

export const { registry } = defineRegistry(linkV1.catalog, {
  components: {
    ...layoutRegistryComponents,
    LinkCard: ({ children }: { children?: ReactNode }) => <LinkCardLeaf>{children}</LinkCardLeaf>,
    LinkCopy: ({ props }: { props: Record<string, unknown> }) => (
      <LinkCopyLeaf
        url={typeof props.url === "string" ? props.url : ""}
        title={typeof props.title === "string" ? props.title : ""}
        siteName={typeof props.siteName === "string" ? props.siteName : ""}
        iconUrl={typeof props.iconUrl === "string" ? props.iconUrl : ""}
      />
    ),
    LinkHeroImage: ({ props }: { props: Record<string, unknown> }) => (
      <LinkHeroImageLeaf imageUrl={typeof props.imageUrl === "string" ? props.imageUrl : ""} />
    ),
  },
});
