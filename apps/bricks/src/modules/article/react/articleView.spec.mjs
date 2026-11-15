import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrickSessionContext } from "../../react/BrickSessionContext";
import { freshDefaultSpec } from "../definition/generator/freshDefaultSpec";
import { articleView } from "./articleView";

const props = { brickState: null, placementState: {}, layoutId: "default", spec: freshDefaultSpec };

describe("unconfigured Article rendering", () => {
  it("shows the visitor placeholder", () => {
    const html = renderToStaticMarkup(createElement(articleView.Render, props));
    expect(html).toContain("data-article-placeholder");
  });

  it("opens the inline editor in the Wall", () => {
    const context = {
      session: {},
      brickId: "brk_test",
      placementId: "plc_test",
      registerFlush: () => () => {},
    };
    const html = renderToStaticMarkup(createElement(
      BrickSessionContext.Provider,
      { value: context },
      createElement(articleView.Render, props),
    ));
    expect(html).not.toContain("data-article-placeholder");
    expect(html).toContain("textarea");
  });

  it("renders the saved Article body on the server", () => {
    const html = renderToStaticMarkup(createElement(articleView.Render, {
      ...props,
      brickState: { title: "Title", subtitle: "Subtitle", content: "Hello **world**\n\n- [x] Done\n\n[Link](https://example.test)" },
    }));
    expect(html).toContain("Hello");
    expect(html).toContain("world");
    expect(html).toContain("<fieldset disabled=");
    expect(html).toContain('href="https://example.test"');
  });
});
