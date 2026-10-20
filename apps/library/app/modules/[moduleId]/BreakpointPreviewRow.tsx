import { useContext } from "react";

import type { Spec } from "@json-render/core";

import { OrderedSection } from "@qrk.sh/web/library/OrderedDoc";

import { BrickWrapper } from "../../../components/brick/BrickWrapper";
import { BrickCardStyleContext } from "../../../lib/BrickCardStyleContext";
import { BREAKPOINTS } from "../../../lib/breakpoints";
import { modulesHash } from "../../../lib/modulesHash";

export function BreakpointPreviewRow(props: {
  entry: (typeof BREAKPOINTS)[number];
  moduleId: keyof typeof modulesHash;
  brick: (typeof modulesHash)[keyof typeof modulesHash];
  moduleState: unknown;
  className?: string;
  specs: Record<(typeof BREAKPOINTS)[number]["id"], Spec>;
}) {
  const { entry, moduleId, brick, moduleState, className, specs } = props;
  const cardStyle = useContext(BrickCardStyleContext);
  const maxPerPage = brick.maxPerPage;
  const view = brick.viewFor(entry.id);
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
              data-brick-surface=""
              data-card-style={cardStyle}
              className="brick-hover-target relative shrink-0"
              style={{ width: previewWidth }}
            >
              <BrickWrapper
                className="brick-hover-surface"
                data-module-brick={moduleId}
                data-testid="component-preview"
              >
                <Component state={moduleState} />
              </BrickWrapper>
            </div>
          </div>
          <div>
            <p className="m-0 mb-2 font-mono text-neutral-500">JsonRender</p>
            <div
              data-brick-surface=""
              data-card-style={cardStyle}
              className="brick-hover-target relative shrink-0"
              style={{ width: previewWidth }}
            >
              <BrickWrapper
                className="brick-hover-surface"
                data-module-brick={moduleId}
                data-testid="json-render-preview"
              >
                <JsonRender breakpoint={entry.id} state={moduleState} spec={specs[entry.id]} />
              </BrickWrapper>
            </div>
          </div>
        </div>
      </div>
    </OrderedSection>
  );
}
