import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/TextJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { textV1 } from "./textV1";
import { textBrickContentView } from "./TextBrickContent";

export const textView = makeModuleView(textV1, {
  default: {
    component(props) {
      const { state } = props;
      return <textBrickContentView.Component content={state.content} />;
    },
    generator: { registry, defaultSpec },
  },
});
