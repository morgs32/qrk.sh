import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Configuration } from "./app/Configuration";
import { primitives } from "@zerospin/schema";
import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { makeFormConfiguration } from "./makeFormConfiguration";
import { makeVariant } from "./makeVariant";
import { makeCollection } from "./makeCollection";

describe("form configuration", () => {
  it("preserves a typed data form through variant and collection creation", () => {
    const dataShape = { text: primitives.text() };
    const variant = makeVariant({
      variant: "default",
      variantLabel: "Default",
      variantDescription: "Editable text",
      dataShape,
      defaultData: { text: "Before" },
      configuration: makeFormConfiguration<typeof dataShape>({
        form: ({ data, onChange }) => {
          expectTypeOf(data.text).toEqualTypeOf<string>();
          onChange({ text: `${data.text} edited` });
          return null;
        },
      }),
      sizes: {},
    });
    const collection = makeCollection({
      collectionName: "test",
      collectionLabel: "Test",
      collectionDescription: "Test",
      variants: { default: variant },
    });
    const configuration = collection.variants.default?.configuration;
    if (configuration?.configurationType !== "form") throw new Error("Expected form");
    const onChange = vi.fn();
    const html = renderToStaticMarkup(createElement(Configuration, {
      variant: collection.variants.default,
      data: { text: "Rendered" },
      setData: onChange,
    }));
    expect(html).toContain("Configure");
    expect(html).toContain("Rendered");
    expect(onChange).toHaveBeenCalledWith({ text: "Rendered edited" });
    onChange.mockClear();
    configuration.form({ data: { text: "Current" }, onChange });
    expect(onChange).toHaveBeenCalledWith({ text: "Current edited" });
  });
});
