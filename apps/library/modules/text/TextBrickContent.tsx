"use client";

import { useContext } from "react";
import { makeComponentView } from "../../make/makeComponentView";
import { textBrickComponent } from "./generator/TextBrickComponent";
import { TextBrickEditingContext } from "./TextBrickEditingContext";
import { TextEditorControl } from "./TextEditorControl";

export const textBrickContentView = makeComponentView(textBrickComponent, {
  component(props) {
    const { content } = props;
    const editing = useContext(TextBrickEditingContext);
    return (
      <TextEditorControl
        value={content === null ? null : JSON.parse(JSON.stringify(content))}
        editing={editing}
      />
    );
  },
});
