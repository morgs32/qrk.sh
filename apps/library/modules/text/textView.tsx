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
  sm: { w: 8, h: 2 },
  md: { w: 4, h: 4 },
  lg: { w: 4, h: 4 },
  xl: { w: 4, h: 4 },
});
