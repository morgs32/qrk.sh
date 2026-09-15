import { Image } from "@unpic/react";

export function IconSvgGraphic(props: { data: { name: string; svg: string } }) {
  return (
    <Image
      alt={props.data.name}
      className="h-16 w-16 max-h-[85%] max-w-[85%] shrink-0 object-contain"
      height={64}
      layout="constrained"
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(props.data.svg)}`}
      width={64}
    />
  );
}
