import type { SVGProps } from "react";

// Source: https://www.untitledui.com/icon/figma
export function FigmaThumbnailLineIcon(props: SVGProps<SVGSVGElement>) {
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
      <path
        d="m12 1.5h-3.5c-1.933 0-3.5 1.567-3.5 3.5s1.567 3.5 3.5 3.5m3.5-7v7m0-7h3.5c1.933 0 3.5 1.567 3.5 3.5s-1.567 3.5-3.5 3.5m-3.5 0h-3.5m3.5 0v7m0-7h3.5m-7 0c-1.933 0-3.5 1.567-3.5 3.5s1.567 3.5 3.5 3.5m3.5 0h-3.5m3.5 0v3.5c0 1.933-1.567 3.5-3.5 3.5s-3.5-1.567-3.5-3.5 1.567-3.5 3.5-3.5m7-7c1.933 0 3.5 1.567 3.5 3.5s-1.567 3.5-3.5 3.5-3.5-1.567-3.5-3.5 1.567-3.5 3.5-3.5z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
