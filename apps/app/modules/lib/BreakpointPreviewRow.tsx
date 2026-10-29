import type { Spec } from "@json-render/core";

import { OrderedSection } from "@qrk.sh/web/library/OrderedDoc";

import { BrickWrapper } from "../components/brick/BrickWrapper";
import { BREAKPOINTS } from "./breakpoints";
import { modulesHash } from "./modulesHash";

export function BreakpointPreviewRow(props: {
  entry: (typeof BREAKPOINTS)[number];
  brick: (typeof modulesHash)[keyof typeof modulesHash];
  moduleState: unknown;
  cardStyle: boolean;
  className?: string;
  specs: Record<(typeof BREAKPOINTS)[number]["id"], Spec>;
}) {
  const { entry, brick, moduleState, cardStyle, className, specs } = props;
  const maxPerPage = brick.maxPerPage;
  const view = brick.variants.default;
  const Component = view.component;
  const JsonRender = brick.component;
  const previewWidth = Math.min(view.defaultWidth, entry.previewWidth);

  return (
    <OrderedSection className={className} label={entry.id}>
      {maxPerPage !== undefined ? (
        <p className="mb-0 mt-3 text-sm text-neutral-500">Limit: {maxPerPage} per page.</p>
      ) : null}
      <div className="overflow-x-auto px-4 py-8">
        <div className="flex w-max items-start gap-4">
          <div>
            <p className="m-0 mb-2 font-mono text-neutral-500">Component</p>
            <div
              className="relative shrink-0"
              style={{ width: previewWidth, minWidth: view.minWidth }}
            >
              <BrickWrapper className={cardStyle ? "brick-surface-card" : undefined}>
                <Component state={moduleState} />
              </BrickWrapper>
            </div>
          </div>
          <div>
            <p className="m-0 mb-2 font-mono text-neutral-500">JsonRender</p>
            <div
              className="relative shrink-0"
              style={{ width: previewWidth, minWidth: view.minWidth }}
            >
              <BrickWrapper className={cardStyle ? "brick-surface-card" : undefined}>
                <JsonRender variantId="default" state={moduleState} spec={specs[entry.id]} />
              </BrickWrapper>
            </div>
          </div>
        </div>
      </div>
    </OrderedSection>
  );
}
