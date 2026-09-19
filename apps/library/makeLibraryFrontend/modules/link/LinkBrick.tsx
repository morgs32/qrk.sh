import type { ReactNode } from "react";

import { Image } from "@unpic/react";

import { Link } from "../../components/Link";

export function LinkCard(props: { children?: ReactNode }) {
  return (
    <div className="flex h-full w-full min-h-0 gap-4 overflow-hidden bg-sky-50">
      {props.children}
    </div>
  );
}

export function LinkCopy(props: { url: string; title: string; siteName: string; iconUrl: string }) {
  const href = props.url.length > 0 ? props.url : undefined;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
      <span className="flex min-w-0 items-center gap-2">
        {props.iconUrl.length > 0 ? (
          <Image
            alt=""
            className="size-4 shrink-0 rounded-sm object-contain"
            height={16}
            layout="constrained"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
            src={props.iconUrl}
            width={16}
          />
        ) : null}
        <Link className="min-w-0" href={href}>
          <small className="m-0 min-w-0 truncate">{props.siteName}</small>
        </Link>
      </span>
      <h2 className="m-0 line-clamp-3 leading-normal">
        <Link href={href}>{props.title}</Link>
      </h2>
    </div>
  );
}

export function LinkHeroImage(props: { imageUrl: string }) {
  if (props.imageUrl.length === 0) {
    return null;
  }
  return (
    <div className="relative w-[44%] min-w-[200px] shrink-0 overflow-hidden bg-zinc-200">
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
  state: {
    payload: { url: string };
    data: {
      url: string;
      title: string;
      siteName: string;
      iconUrl: string;
      imageUrl: string;
    };
  };
}) {
  return (
    <LinkCard>
      <LinkCopy
        iconUrl={props.state.data.iconUrl}
        siteName={props.state.data.siteName}
        title={props.state.data.title}
        url={props.state.data.url}
      />
      <LinkHeroImage imageUrl={props.state.data.imageUrl} />
    </LinkCard>
  );
}
