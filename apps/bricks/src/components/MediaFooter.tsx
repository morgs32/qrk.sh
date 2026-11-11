import type { ReactNode } from "react";
import { Image } from "@unpic/react";

export function MediaFooter(props: {
  iconUrl?: string;
  icon?: ReactNode;
  heading?: ReactNode;
  /** Small label above the heading (e.g. "Figma"). */
  overline?: string;
  children?: ReactNode;
}) {
  const { iconUrl, icon, heading, overline, children } = props;
  const showIcon = icon !== undefined || iconUrl !== undefined;
  const showText = overline !== undefined || heading !== undefined;

  return (
    <div className="flex shrink-0 items-center gap-3 p-4">
      {showIcon ? (
        icon !== undefined ? (
          icon
        ) : iconUrl !== undefined ? (
          <Image
            alt=""
            className="size-8 shrink-0 object-contain"
            height={32}
            layout="constrained"
            src={iconUrl}
            width={32}
          />
        ) : null
      ) : null}
      {showText ? (
        <div className="min-w-0 flex-1">
          {overline !== undefined && overline !== "" ? (
            <small className="m-0 uppercase tracking-[0.18em]">{overline}</small>
          ) : null}
          {heading !== undefined && heading !== "" ? (
            <h2 className="m-0 truncate">{heading}</h2>
          ) : null}
        </div>
      ) : null}
      {children !== undefined ? (
        <div className="ml-auto flex shrink-0 items-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}
