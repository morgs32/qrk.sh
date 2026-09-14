import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Configuration } from "./app/Configuration";
import { primitives } from "@zerospin/schema";
import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { makeFormConfiguration } from "./makeFormConfiguration";
import { makeContent } from "./makeContent";
import { makeCollection } from "./makeCollection";

describe("form configuration", () => {
  it("preserves a typed data form through content and collection creation", () => {
    const dataShape = { text: primitives.text() };
    const content = makeContent({
      content: "default",
      contentName: "Default",
      contentDescription: "Editable text",
      dataShape,
      defaultData: { text: "Before" },
      configuration: makeFormConfiguration<typeof dataShape>({
        form: ({ data, onChange }) => {
          expectTypeOf(data.text).toEqualTypeOf<string>();
          onChange({ text: `${data.text} edited` });
          return null;
        },
      }),
      views: {},
    });
    const collection = makeCollection({
      collectionName: "test",
      collectionLabel: "Test",
      collectionDescription: "Test",
      contents: { default: content },
    });
    const configuration = collection.contents.default?.configuration;
    if (configuration?.configurationType !== "form") throw new Error("Expected form");
    const onChange = vi.fn();
    const html = renderToStaticMarkup(
      createElement(Configuration, {
        content: collection.contents.default,
        data: { text: "Rendered" },
        setData: onChange,
      }),
    );
    expect(html).toContain("Configure");
    expect(html).toContain("Rendered");
    expect(onChange).toHaveBeenCalledWith({ text: "Rendered edited" });
    onChange.mockClear();
    configuration.form({ data: { text: "Current" }, onChange });
    expect(onChange).toHaveBeenCalledWith({ text: "Current edited" });
  });
});
