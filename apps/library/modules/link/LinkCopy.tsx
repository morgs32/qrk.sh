import { layout, prepare } from "@chenglou/pretext";
import { Image } from "@unpic/react";
import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "../../components/Link";
import { makeComponentView } from "../../make/makeComponentView";
import { linkCopyComponent } from "./generator/LinkCopyComponent";

export const linkCopyView = makeComponentView(linkCopyComponent, {
  component(props) {
    const { url, iconUrl, siteName, title } = props;
    const copyRef = useRef<HTMLDivElement>(null);
    const siteRef = useRef<HTMLSpanElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const [fontSize, setFontSize] = useState<number>();
    const href = url.length > 0 ? url : undefined;

    useLayoutEffect(() => {
      const copy = copyRef.current;
      const site = siteRef.current;
      const heading = titleRef.current;
      if (!copy || !site || !heading) return;

      const updateFontSize = () => {
        const copyStyle = getComputedStyle(copy);
        const headingStyle = getComputedStyle(heading);
        const width =
          copy.clientWidth - parseFloat(copyStyle.paddingLeft) - parseFloat(copyStyle.paddingRight);
        const height =
          copy.clientHeight -
          parseFloat(copyStyle.paddingTop) -
          parseFloat(copyStyle.paddingBottom) -
          site.offsetHeight -
          parseFloat(copyStyle.rowGap);
        const maxSize = parseFloat(copyStyle.fontSize);
        if (width <= 0 || height <= 0 || !Number.isFinite(maxSize)) return;

        const fits = (size: number) => {
          const font = `${headingStyle.fontWeight} ${size}px ${headingStyle.fontFamily}`;
          const prepared = prepare(title, font, {
            letterSpacing: parseFloat(headingStyle.letterSpacing) || 0,
          });
          return layout(prepared, width, size * 1.5).height <= height;
        };

        let low = 12;
        let high = Math.max(low, maxSize);
        if (fits(high)) {
          setFontSize(high);
          return;
        }
        while (high - low > 0.25) {
          const middle = (low + high) / 2;
          if (fits(middle)) low = middle;
          else high = middle;
        }
        setFontSize(low);
      };

      updateFontSize();
      const observer = new ResizeObserver(updateFontSize);
      observer.observe(copy);
      observer.observe(site);
      document.fonts.addEventListener("loadingdone", updateFontSize);
      let active = true;
      void document.fonts.ready.then(() => {
        if (active) updateFontSize();
      });
      return () => {
        active = false;
        observer.disconnect();
        document.fonts.removeEventListener("loadingdone", updateFontSize);
      };
    }, [title]);

    return (
      <div ref={copyRef} className="flex min-w-0 flex-1 flex-col gap-4 p-4">
        <span ref={siteRef} className="flex min-w-0 items-center gap-2">
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
        <h2
          ref={titleRef}
          className="m-0 min-h-0 overflow-hidden leading-normal"
          style={fontSize === undefined ? undefined : { fontSize }}
        >
          <Link href={href}>{title}</Link>
        </h2>
      </div>
    );
  },
});
