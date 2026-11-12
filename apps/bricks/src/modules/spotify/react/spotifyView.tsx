import { defineRegistry } from "@json-render/react";
import { Music2 } from "lucide-react";

import {
  BrickDetailsTrigger,
} from "../../../components/BrickDetailsTrigger";
import { makeCatalogFromComponentMetadata } from "../../../definition/makeCatalogFromComponentMetadata";
import { makeModuleView } from "../../react/makeModuleView";
import { spotifyV1 } from "../definition/spotifyV1";
import { SpotifyForm } from "./SpotifyForm";
import { SpotifyPlayer } from "./SpotifyPlayer";

const { registry } = defineRegistry(
  makeCatalogFromComponentMetadata(spotifyV1.componentMetadata),
  { components: { SpotifyPlayer } },
);

const view = makeModuleView(spotifyV1, {
  categoryIds: ["music"],
  defaultState: { url: null },
  LineIcon: Music2,
  form: SpotifyForm,
  variants: {
    default: {
      registry,
      placeholder() {
        return (
          <div className="grid min-h-[180px] w-full flex-1 place-items-center bg-muted p-3 text-center text-sm text-muted-foreground">
            Add a Spotify link
          </div>
        );
      },
    },
  },
});

export const spotifyView = {
  ...view,
  Render(props: Parameters<typeof view.Render>[0]) {
    const { state, spec, variantId } = props;
    return (
      <BrickDetailsTrigger label="Edit Spotify">
        <view.Render state={state} spec={spec} variantId={variantId} />
      </BrickDetailsTrigger>
    );
  },
};
