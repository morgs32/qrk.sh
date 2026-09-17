import type { ReactNode } from "react";

import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import {
  InstagramCard as InstagramCardLeaf,
  InstagramMediaFooter as InstagramMediaFooterLeaf,
  InstagramPostGrid as InstagramPostGridLeaf,
} from "../InstagramBrick";
import { instagramV1 } from "../instagramV1";

export const { registry } = defineRegistry(instagramV1.catalog, {
  components: {
    ...layoutRegistryComponents,
    InstagramCard: ({
      children,
      props,
    }: {
      children?: ReactNode;
      props: Record<string, unknown>;
    }) => (
      <InstagramCardLeaf username={typeof props.username === "string" ? props.username : ""}>
        {children}
      </InstagramCardLeaf>
    ),
    InstagramPostGrid: ({ props }: { props: Record<string, unknown> }) => (
      <InstagramPostGridLeaf
        username={typeof props.username === "string" ? props.username : ""}
        postImageUrl1={typeof props.postImageUrl1 === "string" ? props.postImageUrl1 : ""}
        postImageUrl2={typeof props.postImageUrl2 === "string" ? props.postImageUrl2 : ""}
        postImageUrl3={typeof props.postImageUrl3 === "string" ? props.postImageUrl3 : ""}
        postImageUrl4={typeof props.postImageUrl4 === "string" ? props.postImageUrl4 : ""}
      />
    ),
    InstagramMediaFooter: ({ props }: { props: Record<string, unknown> }) => (
      <InstagramMediaFooterLeaf
        username={typeof props.username === "string" ? props.username : ""}
        followersText={typeof props.followersText === "string" ? props.followersText : ""}
      />
    ),
  },
});
