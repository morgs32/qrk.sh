import type { SVGProps } from "react";

// Source: https://www.untitledui.com/icon/code-browser
export function GitHubRepoLineIcon(props: SVGProps<SVGSVGElement>) {
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
        d="m22 9h-20m12 8.5 2.5-2.5-2.5-2.5m-4 0-2.5 2.5 2.5 2.5m-8-9.7v8.4c0 1.6802 0 2.5202.32698 3.162.28762.5645.74656 1.0234 1.31105 1.311.64173.327 1.48181.327 3.16197.327h10.4c1.6802 0 2.5202 0 3.162-.327.5645-.2876 1.0234-.7465 1.311-1.311.327-.6418.327-1.4818.327-3.162v-8.4c0-1.68016 0-2.52023-.327-3.16197-.2876-.56449-.7465-1.02343-1.311-1.31105-.6418-.32698-1.4818-.32698-3.162-.32698h-10.4c-1.68016 0-2.52024 0-3.16197.32698-.56449.28762-1.02343.74656-1.31105 1.31105-.32698.64173-.32698 1.48181-.32698 3.16197z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
