import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { backendLibrary } from "./backendLibrary";
import { resolveBrickLayout } from "./freshLibrary";
import { reactLibrary } from "./reactLibrary";

it("renders every registered Brick through its module-owned view on the server", () => {
  expect(Object.keys(reactLibrary).sort()).toEqual(Object.keys(backendLibrary).sort());
  for (const moduleId of Object.keys(backendLibrary)) {
    const module = reactLibrary[moduleId];
    expect(module.id).toBe(moduleId);
    expect(module.def.moduleId).toBe(moduleId);
    const brickState = module.defaultState;
    const spec = resolveBrickLayout({ moduleId, layoutId: "default", brickState });
    const html = renderToStaticMarkup(createElement(module.Render, {
      brickState,
      placementState: module.defaultPlacementState,
      layoutId: "default",
      spec,
    }));
    expect(html).not.toBe("");
  }
});
