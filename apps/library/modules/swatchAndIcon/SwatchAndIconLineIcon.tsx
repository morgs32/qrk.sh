import type { SVGProps } from "react";

// Source: https://www.untitledui.com/icon/palette
export function SwatchAndIconLineIcon(props: SVGProps<SVGSVGElement>) {
  const { width = 24, height = 24, ...svgProps } = props;
  return (
    <svg
      fill="none"
      height={height}
      viewBox="0 0 24 24"
      width={width}
      xmlns="http://www.w3.org/2000/svg"
      {...svgProps}
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <path d="m2 12c0 5.5228 4.47715 10 10 10 1.6569 0 3-1.3431 3-3v-.5c0-.4644 0-.6966.0257-.8916.1772-1.3462 1.2365-2.4055 2.5827-2.5827.195-.0257.4272-.0257.8916-.0257h.5c1.6569 0 3-1.3431 3-3 0-5.52285-4.4772-10-10-10-5.52285 0-10 4.47715-10 10z" />
        <path d="m7 13c.55228 0 1-.4477 1-1s-.44772-1-1-1-1 .4477-1 1 .44772 1 1 1z" />
        <path d="m16 9c.5523 0 1-.44772 1-1s-.4477-1-1-1-1 .44772-1 1 .4477 1 1 1z" />
        <path d="m10 8c.5523 0 1-.44772 1-1s-.4477-1-1-1c-.55228 0-1 .44772-1 1s.44772 1 1 1z" />
      </g>
    </svg>
  );
}
