import type { ReactNode } from "react";
import { Image } from "@unpic/react";

export function MediaFooter(props: {
  iconUrl?: string;
  icon?: ReactNode;
  heading?: string;
  /** Small label above the heading (e.g. "Figma"). */
  overline?: string;
}) {
  const showIcon = props.icon !== undefined || props.iconUrl !== undefined;
  const showText = props.overline !== undefined || props.heading !== undefined;

  return (
    <div className="flex shrink-0 items-center gap-3 p-4">
      {showIcon ? (
        props.icon !== undefined ? (
          props.icon
        ) : props.iconUrl !== undefined ? (
          <Image
            alt=""
            className="size-8 shrink-0 object-contain"
            height={32}
            layout="constrained"
            src={props.iconUrl}
            width={32}
          />
        ) : null
      ) : null}
      {showText ? (
        <div className="min-w-0">
          {props.overline !== undefined && props.overline !== "" ? (
            <p className="m-0 font-semibold uppercase tracking-[0.18em]">
              {props.overline}
            </p>
          ) : null}
          {props.heading !== undefined && props.heading !== "" ? (
            <h2 className="m-0 truncate">{props.heading}</h2>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
