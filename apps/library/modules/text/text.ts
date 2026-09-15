import { createElement } from "react";

import type { JSONContent } from "@tiptap/react";
import { primitives } from "@zerospin/schema";
import { Schema } from "effect";

import { makeFormConfiguration } from "../../makeFormConfiguration";
import { makeModule } from "../../makeModule";

import { TextDefaultBody } from "./TextDefaultBody";
import { TextEditorControl } from "./TextEditorControl";

const dataShape = {
  content: primitives.json({
    nullable: true,
    defaultValue: null,
    schema: Schema.declare(
      (input): input is JSONContent =>
        typeof input === "object" && input !== null && "type" in input && input.type === "doc",
    )})};

export const text = makeModule({
  dataShape,
  defaultData: { content: null },
  id: "text",
  label: "Text",
  description: "Rich text content authored with Tiptap.",
  configuration: makeFormConfiguration<typeof dataShape>({
    form: ({ data, onChange }) =>
      createElement(TextEditorControl, {
        value: data.content,
        onChange: (content) => onChange({ content })})}),
  order: 1,
  xs: { component: TextDefaultBody, w: 4, h: 4 }});
