import type { SVGProps } from "react";

// Source: https://www.untitledui.com/icon/git-commit
export function GitHubActivityLineIcon(props: SVGProps<SVGSVGElement>) {
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
        d="m16 12c0 2.2091-1.7909 4-4 4-2.20915 0-4.00001-1.7909-4.00001-4m8.00001 0c0-2.20914-1.7909-4-4-4-2.20915 0-4.00001 1.79086-4.00001 4m8.00001 0h6m-14.00001 0h-5.99981"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
