import type { SVGProps } from "react";

// Source: https://www.untitledui.com/icon/marker-pin-01
export function MapPlaceLineIcon(props: SVGProps<SVGSVGElement>) {
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
        <path d="m12 13c1.6569 0 3-1.3431 3-3 0-1.65685-1.3431-3-3-3s-3 1.34315-3 3c0 1.6569 1.3431 3 3 3z" />
        <path d="m12 22c4-4 8-7.5817 8-12 0-4.41828-3.5817-8-8-8-4.41828 0-8 3.58172-8 8 0 4.4183 4 8 8 12z" />
      </g>
    </svg>
  );
}
