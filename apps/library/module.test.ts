import { createElement } from "react";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { modulesHash } from "./modulesHash";
import { makeModule } from "./makeModule";

describe("library module identity", () => {
  it("resolves repo XS dimensions and inherits SM dimensions above XS", () => {
    const def = modulesHash["github-repo"].def;
    expect(def.xs).toEqual({ w: 4, h: 6 });
    expect(def.sm).toEqual({ w: 4, h: 2 });
    expect(def.lg).toEqual(def.sm);
    expect(def.xl).toEqual(def.sm);
  });

  it("registers unique kebab-case module identities", () => {
    const moduleIds = new Set<string>();
    const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

    for (const module of Object.values(modulesHash)) {
      expect(kebabCase.test(module.id)).toBe(true);
      expect(moduleIds.has(module.id)).toBe(false);
      moduleIds.add(module.id);
      expect(module.description.trim()).not.toBe("");
      expect(module.def.moduleId).toBe(module.id);
      expect(module).not.toHaveProperty("views");
      expect(module.def).not.toHaveProperty("view");
    }

    expect(moduleIds.size).toBe(11);
  });

  it("registers one data-backed Figma thumbnail module", () => {
    const thumbnail = modulesHash["figma-thumbnail"];
    expect(thumbnail.def.xs).toEqual({ w: 4, h: 4 });
    expect(thumbnail.configuration?.configurationType).toBe("fetcher");
    expect(thumbnail.dataShape).toHaveProperty("thumbnail_url");
    expect(thumbnail.defaultData).toMatchObject({
      title: "Figma Thumbnail",
      url: "",
    });
  });

  it("registers the data-backed Link 4x2 module", () => {
    const linkModule = modulesHash.link;
    if (linkModule.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(linkModule.configuration?.moduleOptionsShape).toHaveProperty("url");
    expect(linkModule.dataShape).toMatchObject({
      url: { kind: "text" },
      title: { kind: "text" },
      description: { kind: "text" },
      siteName: { kind: "text" },
    });
  });

  it("registers the data-backed TikTok module", () => {
    const tiktokModule = modulesHash.tiktok;
    if (tiktokModule.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(Object.keys(modulesHash).filter((id) => id.startsWith("tiktok"))).toEqual(["tiktok"]);
    expect(tiktokModule.defaultData).toEqual({ username: "theonion" });
  });

  it("registers the Text module", () => {
    const textModule = modulesHash.text;
    expect(textModule.label).toBe("Text");
    expect(textModule.configuration?.configurationType).toBe("form");
  });
});

describe("makeModule", () => {
  const catalog = makeModule({
    id: "summary",
    label: "Summary",
    description: "Summary",
    dataShape: null,
    defaultData: null,
    order: 0,
    xs: { component: () => createElement("div", null, "summary"), w: 2, h: 2 },
  });

  it("stamps moduleId and moduleLabel onto def", () => {
    expect(catalog.def).toEqual({
      moduleId: "summary",
      moduleLabel: "Summary",
      label: "Summary",
      order: 0,
      data: null,
      xs: { w: 2, h: 2 },
      sm: { w: 2, h: 2 },
      lg: { w: 2, h: 2 },
      xl: { w: 2, h: 2 },
    });
  });

  it("renders the module component", () => {
    expect(
      renderToStaticMarkup(createElement(catalog.component, { breakpoint: "xs" })),
    ).toContain("summary");
  });
});
