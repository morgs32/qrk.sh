import { defineRegistry } from "@json-render/react";
import { Type } from "lucide-react";
import { makeCatalogFromComponentMetadata } from "../../../definition/makeCatalogFromComponentMetadata";
import { makeModuleView } from "../../react/makeModuleView";
import { textV1 } from "../definition/textV1";
import { addBrick, updateBrick } from "../commands/brickActions";
import { textDefaultPlacementState } from "../commands/textPlacementState";
import { textBlockView } from "./TextBlock";

const { registry } = defineRegistry(makeCatalogFromComponentMetadata(textV1.componentMetadata), {
  components: { TextBlock: textBlockView.RegistryComponent },
});

export const textView = makeModuleView(textV1, {
  categoryIds: ["tools"],
  defaultState: { content: "" },
  defaultPlacementState: textDefaultPlacementState,
  initialDraft: { content: "" },
  LineIcon: Type,
  add: addBrick,
  update: updateBrick,
  inline: true,
  variants: { default: { registry } },
});
