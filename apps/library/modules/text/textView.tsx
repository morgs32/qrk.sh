import { makeModuleView } from "../../make/makeModuleView";
import { TiptapDocSchema } from "../../lib/TiptapDocSchema";
import { Schema } from "effect";
import { registry } from "./generator/TextJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { textV1 } from "./textV1";
import { textBrickContentView } from "./TextBrickContent";
import { TextEditorControl } from "./TextEditorControl";

export const textView = makeModuleView(textV1, {
  form(props) {
    const { state, onChange } = props;
    return (
      <TextEditorControl
        value={state.content === null ? null : JSON.parse(JSON.stringify(state.content))}
        drawer={{
          onChange: (content) =>
            onChange({ ...state, content: Schema.decodeUnknownSync(TiptapDocSchema)(content) }),
        }}
      />
    );
  },
  default: {
    component(props) {
      const { state } = props;
      return <textBrickContentView.Component content={state.content} />;
    },
    generator: { registry, defaultSpec },
  },
  sm: { w: 8, h: 2 },
  md: { w: 4, h: 4 },
  lg: { w: 4, h: 4 },
  xl: { w: 4, h: 4 },
});
