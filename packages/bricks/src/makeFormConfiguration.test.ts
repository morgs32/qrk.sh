import { createElement } from "react";

import { primitives } from "@zerospin/schema";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";

import { Configuration } from "./app/Configuration";
import { makeCatalog } from "./makeCatalog";
import { makeFormConfiguration } from "./makeFormConfiguration";
import { makeRegistry } from "./makeRegistry";

describe("form configuration", () => {
  it("preserves a typed data form through content and catalog creation", () => {
    const dataShape = { text: primitives.text() };
    const content = makeRegistry({
      registry: "default",
      registryName: "Default",
      registryDescription: "Editable text",
      dataShape,
      defaultData: { text: "Before" },
      configuration: makeFormConfiguration<typeof dataShape>({
        form: ({ data, onChange }) => {
          expectTypeOf(data.text).toEqualTypeOf<string>();
          onChange({ text: `${data.text} edited` });
          return null;
        },
      }),
      w: 1,
      h: 1,
      order: 0,
      xs: () => null,
    });
    const catalog = makeCatalog({
      catalogName: "test",
      catalogLabel: "Test",
      catalogDescription: "Test",
      registries: { default: content },
    });
    const configuration = catalog.registries.default?.configuration;
    if (configuration?.configurationType !== "form") throw new Error("Expected form");
    const onChange = vi.fn();
    const html = renderToStaticMarkup(
      createElement(Configuration, {
        registry: catalog.registries.default,
        data: { text: "Rendered" },
        setData: onChange,
      }),
    );
    expect(html).toContain("Configuration");
    expect(html).toContain("JSON view");
    expect(onChange).toHaveBeenCalledWith({ text: "Rendered edited" });
    onChange.mockClear();
    configuration.form({ data: { text: "Current" }, onChange });
    expect(onChange).toHaveBeenCalledWith({ text: "Current edited" });
  });
});
