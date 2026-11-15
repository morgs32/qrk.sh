import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resolveBrickLayout } from "@qrk.sh/bricks/modules/freshLibrary";
import { PublishedWalls } from "./PublishedWalls";

describe("PublishedWalls", () => {
  it("renders every Wall and saved Text and Article on the server without loading hidden players", () => {
    const bricks = [
      { id: "brk_text", moduleId: "text", brickState: { content: "Hello **world**" }, borderWidth: 0 },
      { id: "brk_article", moduleId: "article", brickState: { title: "Article title", subtitle: "", content: "Saved article body" }, borderWidth: 0 },
      { id: "brk_youtube", moduleId: "youtube", brickState: { content: { kind: "video", videoId: "M7lc1UVf-VE", playlistId: null, startSeconds: 0 } }, borderWidth: 0 },
    ];
    const snapshot = {
      slug: null, title: "Site", description: null, bricks,
      walls: ["sm", "md", "lg", "xl"].map((breakpoint) => ({
        id: `wal_${breakpoint}`, breakpoint,
        sections: [{ id: `sec_${breakpoint}`, stacks: [{ id: `stk_${breakpoint}`, name: "", rows:
          bricks.map((brick) => ({
            id: `row_${breakpoint}_${brick.id}`, minHeight: 200,
            placements: [{
              id: `plc_${breakpoint}_${brick.id}`, brickId: brick.id, widthWeight: 1,
              layoutId: "default",
              placementState: brick.moduleId === "text" ? { fontFamily: "sans", fontSizePx: 16 } : {},
              spec: resolveBrickLayout({ moduleId: brick.moduleId, layoutId: "default", brickState: brick.brickState }),
            }],
          })),
        }] }],
      })),
    };
    const html = renderToStaticMarkup(createElement(PublishedWalls, { snapshot, brickGap: 4, cardStyle: false }));
    expect((html.match(/data-wall-breakpoint=/g) ?? [])).toHaveLength(4);
    expect(html).toContain("Hello");
    expect(html).toContain("world");
    expect(html).toContain("Saved article body");
    expect(html).not.toMatch(/<iframe[^>]+src=/);
  });
});
