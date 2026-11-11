import { Image } from "@unpic/react";
import { makeComponentView } from "../../../../react/makeComponentView";
import { iconSvgGraphicComponentMetadata } from "../../../definition/generator/IconSvgGraphicComponentMetadata";

export const iconSvgGraphicView = makeComponentView(iconSvgGraphicComponentMetadata, {
  component(props) {
    const { name, svg } = props;
    if (svg.trim().length === 0) return null;
    return (
      <Image
        alt={name}
        className="h-16 w-16 max-h-[85%] max-w-[85%] shrink-0 object-contain"
        height={64}
        layout="constrained"
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
        width={64}
      />
    );
  },
});
