import type { ReactNode } from "react";

import { Image } from "@unpic/react";
import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { linkJsonRenderCatalog } from "./LinkJsonRenderCatalog";

function LinkCard(props: { url: string; children?: ReactNode }) {
  return (
    <a
      className="block h-full w-full no-underline"
      data-link-card="default"
      href={props.url.length > 0 ? props.url : undefined}
      rel="noopener noreferrer"
      target="_blank"
    >
      <div className="flex h-full w-full min-h-0 gap-4 overflow-hidden bg-sky-50">{props.children}</div>
    </a>
  );
}

function LinkCopy(props: { title: string; siteName: string; iconUrl: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-start p-4">
      {props.iconUrl.length > 0 ? (
        <Image
          alt=""
          className="mb-3 h-10 w-10 shrink-0 object-cover"
          height={40}
          layout="constrained"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          src={props.iconUrl}
          width={40}
        />
      ) : null}
      <h2 className="m-0 line-clamp-3">{props.title}</h2>
      <p className="m-0 mt-1 truncate">{props.siteName}</p>
    </div>
  );
}

function LinkHeroImage(props: { imageUrl: string }) {
  if (props.imageUrl.length === 0) {
    return null;
  }
  return (
    <div className="relative h-full w-[44%] shrink-0 overflow-hidden bg-zinc-200">
      <Image
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        layout="fullWidth"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
        sizes="(max-width: 768px) 44vw, 22vw"
        src={props.imageUrl}
      />
    </div>
  );
}

export const { registry } = defineRegistry(linkJsonRenderCatalog, {
  components: {
    ...layoutRegistryComponents,
    LinkCard: ({ children, props }) => (
      <LinkCard url={typeof props.url === "string" ? props.url : ""}>{children}</LinkCard>
    ),
    LinkCopy: ({ props }) => (
      <LinkCopy
        title={typeof props.title === "string" ? props.title : ""}
        siteName={typeof props.siteName === "string" ? props.siteName : ""}
        iconUrl={typeof props.iconUrl === "string" ? props.iconUrl : ""}
      />
    ),
    LinkHeroImage: ({ props }) => (
      <LinkHeroImage imageUrl={typeof props.imageUrl === "string" ? props.imageUrl : ""} />
    ),
  },
});
