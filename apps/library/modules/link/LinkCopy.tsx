import { Image } from "@unpic/react";
import { Link } from "../../components/Link";
import { makeComponentView } from "../../make/makeComponentView";
import { linkCopyComponent } from "./generator/LinkCopyComponent";

export const linkCopyView = makeComponentView(linkCopyComponent, {
  component(props) {
    const { url, iconUrl, siteName, title } = props;
    const href = url.length > 0 ? url : undefined;
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
        <span className="flex min-w-0 items-center gap-2">
          {iconUrl.length > 0 ? (
            <Image
              alt=""
              className="size-4 shrink-0 rounded-sm object-contain"
              height={16}
              layout="constrained"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
              src={iconUrl}
              width={16}
            />
          ) : null}
          <Link className="min-w-0" href={href}>
            <small className="m-0 min-w-0 truncate">{siteName}</small>
          </Link>
        </span>
        <h2 className="m-0 line-clamp-3 leading-normal">
          <Link href={href}>{title}</Link>
        </h2>
      </div>
    );
  },
});
