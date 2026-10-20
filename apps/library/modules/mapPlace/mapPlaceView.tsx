import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/MapPlaceJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { mapPlaceV1 } from "./mapPlaceV1";
import { mapCanvasView } from "./MapCanvas";
import { MapPlaceForm } from "./MapPlaceForm";
import { MapPlaceLineIcon } from "./MapPlaceLineIcon";

export const mapPlaceView = makeModuleView(mapPlaceV1, {
  LineIcon: MapPlaceLineIcon,
  form(props) {
    const { state, session, brickId, onCancel } = props;
    return <MapPlaceForm state={state} session={session} brickId={brickId} onCancel={onCancel} />;
  },
  default: {
    defaultWidth: 480,
    component(props) {
      const { state } = props;
      if (state.data === null)
        return <p role="status">{state.resolution.error?.message ?? "Resolving…"}</p>;
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
