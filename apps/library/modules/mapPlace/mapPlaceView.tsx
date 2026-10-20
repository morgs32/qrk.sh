import { MapPlacePlaceholder } from "./MapPlacePlaceholder";
import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/MapPlaceJsonRenderRegistry";
import { mapPlaceV1 } from "./mapPlaceV1";
import { mapCanvasView } from "./MapCanvas";
import { MapPlaceForm } from "./MapPlaceForm";
import { MapPlaceLineIcon } from "./MapPlaceLineIcon";

export const mapPlaceView = makeModuleView(mapPlaceV1, {
  LineIcon: MapPlaceLineIcon,
  configureCommand: "configureMapPlace",
  form(props) {
    const { state, onConfigure, onCancel } = props;
    return <MapPlaceForm state={state} onConfigure={onConfigure} onCancel={onCancel} />;
  },
  default: {
    placeholder: MapPlacePlaceholder,
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
    generator: { registry, defaultSpec: mapPlaceV1.defaultSpec },
  },
});
