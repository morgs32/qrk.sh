import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/TextJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { TextBrick } from "./TextBrick";
import { textV1 } from "./textV1";

export const textView = makeModuleView(textV1, {
  default: {
    component: TextBrick,
    generator: { registry, defaultSpec },
  },
});
