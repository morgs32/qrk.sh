import { Image } from "@unpic/react";
import { Link } from "../components/Link";
import { makeComponentView } from "../make/makeComponentView";
import { linkCopyComponent } from "@qrk.sh/zerospin/src/modules/link/generator/LinkCopyComponent";

export const linkCopyView = makeComponentView(linkCopyComponent, {
  component(props) {
    const { url, iconUrl, title } = props;
    const href = url.length > 0 ? url : undefined;

    return (
      <div className="flex w-1/2 min-w-0 shrink-0 flex-col gap-4 p-4">
        <div className="flex min-w-0 flex-col gap-1">
          {iconUrl.length > 0 ? (
            <Image
              alt=""
              className="size-8 shrink-0 rounded-sm object-contain"
              height={32}
              layout="constrained"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
              src={iconUrl}
              width={32}
            />
          ) : null}
          <div className="min-w-0 wrap-break-word">
            <Link href={href}>
              <small className="m-0">{url}</small>
            </Link>
          </div>
        </div>
        <h2 className="m-0 wrap-break-word leading-normal">
          <Link href={href}>{title}</Link>
        </h2>
      </div>
    );
  },
});
