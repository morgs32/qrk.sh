import { createElement } from "react";

import { primitives } from "@zerospin/schema";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";

import { Configuration } from "./app/Configuration";
import { makeFormConfiguration } from "./makeFormConfiguration";
import { makeModule } from "./makeModule";

describe("form configuration", () => {
  it("preserves a typed data form through module creation", () => {
    const dataShape = { text: primitives.text() };
    const module = makeModule({
      id: "default",
      label: "Default",
      description: "Editable text",
      dataShape,
      defaultData: { text: "Before" },
      configuration: makeFormConfiguration<typeof dataShape>({
        form: ({ data, onChange }) => {
          expectTypeOf(data.text).toEqualTypeOf<string>();
          onChange({ text: `${data.text} edited` });
          return null;
        },
      }),
      xs: { component: () => null, w: 1, h: 1 },
    });
    const configuration = module.configuration;
    if (configuration?.configurationType !== "form") throw new Error("Expected form");
    const onChange = vi.fn();
    const html = renderToStaticMarkup(
      createElement(Configuration, {
        module,
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
