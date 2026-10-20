import type { SVGProps } from "react";

// Source: https://www.untitledui.com/icon/link-01
export function LinkLineIcon(props: SVGProps<SVGSVGElement>) {
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
        d="m12.7076 18.3639-1.4143 1.4142c-1.95258 1.9527-5.1184 1.9527-7.07102 0-1.95262-1.9526-1.95262-5.1184 0-7.071l1.41421-1.4142m12.72791 1.4142 1.4142-1.4142c1.9526-1.95266 1.9526-5.11849 0-7.07111s-5.1184-1.95262-7.071 0l-1.4143 1.41421m-2.79285 9.8639 7.00005-6.99996"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
