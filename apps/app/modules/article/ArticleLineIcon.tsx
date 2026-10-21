import type { SVGProps } from "react";

// Source: https://www.untitledui.com/icon/file-06
export function ArticleLineIcon(props: SVGProps<SVGSVGElement>) {
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
        d="m14 2.26953v4.13054c0 .56005 0 .84008.109 1.05399.0959.18816.2488.34114.437.43702.2139.10899.4939.10899 1.054.10899h4.1305m-3.7305 4.99993h-8m8 4h-8m2-8h-2m6-7h-5.2c-1.68016 0-2.52024 0-3.16197.32698-.56449.28762-1.02343.74656-1.31105 1.31105-.32698.64173-.32698 1.48181-.32698 3.16197v10.4c0 1.6802 0 2.5202.32698 3.162.28762.5645.74656 1.0234 1.31105 1.311.64173.327 1.48181.327 3.16197.327h6.4c1.6802 0 2.5202 0 3.162-.327.5645-.2876 1.0234-.7465 1.311-1.311.327-.6418.327-1.4818.327-3.162v-9.2z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
