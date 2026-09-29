import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/MapPlaceJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { mapPlaceV1 } from "./mapPlaceV1";
import { mapCanvasView } from "./MapCanvas";

export const mapPlaceView = makeModuleView(mapPlaceV1, {
  default: {
    component(props) {
      const { state } = props;
      return (
        <mapCanvasView.Component
          googlePlaceId={state.data.googlePlaceId}
          latitude={state.data.latitude}
          longitude={state.data.longitude}
          name={state.data.name}
        />
      );
    },
    generator: { registry, defaultSpec },
  },
});
