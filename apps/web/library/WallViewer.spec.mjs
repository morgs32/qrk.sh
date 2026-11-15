import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { WallViewer } from "./WallViewer";

it("keeps all four saved Walls and their Brick content in server HTML", () => {
  const breakpoints = ["sm", "md", "lg", "xl"];
  const snapshot = {
    bricks: [{ id: "brk_text", moduleId: "text", brickState: { content: "Hello" }, borderWidth: 0 }],
    walls: breakpoints.map((breakpoint) => ({
      id: `wal_${breakpoint}`,
      breakpoint,
      sections: [{
        id: `sec_${breakpoint}`,
        stacks: [{
          id: `stk_${breakpoint}`,
          rows: [{
            id: `row_${breakpoint}`,
            alignment: "left",
            minHeight: null,
            placements: [{ id: `plc_${breakpoint}`, brickId: "brk_text", widthWeight: 320 }],
          }],
        }],
      }],
    })),
  };
  const html = renderToStaticMarkup(createElement(
    "div",
    { "data-responsive-walls": true },
    breakpoints.map((breakpoint) => createElement(WallViewer, {
      key: breakpoint,
      breakpoint,
      snapshot,
      brickGap: 8,
      renderBrick: () => "Hello",
    })),
  ));
  for (const breakpoint of breakpoints) {
    expect(html).toContain(`data-wall-breakpoint="${breakpoint}"`);
    expect(html).toContain(`data-wall-placement-id="plc_${breakpoint}"`);
  }
  expect(html.match(/Hello/g)).toHaveLength(4);
  expect(html).toContain("--wall-brick-min-width:320px");
});
