import { defineRegistry } from "@json-render/react";
import { Video } from "lucide-react";
import { BrickDetailsTrigger } from "../../../components/BrickDetailsTrigger";
import { makeCatalogFromComponentMetadata } from "../../../definition/makeCatalogFromComponentMetadata";
import { makeModuleView } from "../../react/makeModuleView";
import { youtubeV1 } from "../definition/youtubeV1";
import { YoutubeForm } from "./YoutubeForm";
import { YoutubePlayer } from "./YoutubePlayer";

const { registry } = defineRegistry(makeCatalogFromComponentMetadata(youtubeV1.componentMetadata), { components: { YoutubePlayer } });
const view = makeModuleView(youtubeV1, {
  categoryIds: ["social"],
  defaultState: { content: null },
  LineIcon: Video,
  form: YoutubeForm,
  variants: { default: { registry, placeholder: () => <div className="grid min-h-[200px] w-full flex-1 place-items-center bg-muted p-3 text-center text-sm text-muted-foreground">Add a YouTube link</div> } },
});

export const youtubeView = {
  ...view,
  Render(props: Parameters<typeof view.Render>[0]) {
    const { state, spec, variantId } = props;
    return <BrickDetailsTrigger label="Edit YouTube"><view.Render state={state} spec={spec} variantId={variantId} /></BrickDetailsTrigger>;
  },
};
