import type { ReactNode } from "react";

import { Image } from "@unpic/react";

export function LinkCard(props: { children?: ReactNode }) {
  return (
    <div className="flex h-full w-full min-h-0 gap-4 overflow-hidden bg-sky-50">
      {props.children}
    </div>
  );
}

export function LinkCopy(props: { url: string; title: string; siteName: string; iconUrl: string }) {
  return (
    <a
      className="flex min-w-0 flex-1 flex-col justify-start p-4"
      href={props.url.length > 0 ? props.url : undefined}
      rel="noopener noreferrer"
      target="_blank"
    >
      <span className="flex min-w-0 items-center gap-3">
        {props.iconUrl.length > 0 ? (
          <Image
            alt=""
            className="size-8 shrink-0 object-contain"
            height={32}
            layout="constrained"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
            src={props.iconUrl}
            width={32}
          />
        ) : null}
        <small className="m-0 min-w-0 truncate">{props.siteName}</small>
      </span>
      <h2 className="m-0 line-clamp-3">{props.title}</h2>
    </a>
  );
}

export function LinkHeroImage(props: { imageUrl: string }) {
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

export function LinkBrick(props: {
  data: {
    url: string;
    title: string;
    siteName: string;
    iconUrl: string;
    imageUrl: string;
  };
  breakpointOptions: unknown;
}) {
  return (
    <LinkCard>
      <LinkCopy
        iconUrl={props.data.iconUrl}
        siteName={props.data.siteName}
        title={props.data.title}
        url={props.data.url}
      />
      <LinkHeroImage imageUrl={props.data.imageUrl} />
    </LinkCard>
  );
}
