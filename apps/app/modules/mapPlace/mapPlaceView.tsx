import { MapPlacePlaceholder } from "./MapPlacePlaceholder";
import { makeModuleView } from "../make/makeModuleView";
import { registry } from "./generator/MapPlaceJsonRenderRegistry";
import { mapPlaceV2 } from "@qrk.sh/zerospin/src/modules/mapPlace/mapPlaceV2";
import { mapCanvasView } from "./MapCanvas";
import { MapPlaceForm } from "./MapPlaceForm";
import { MapPlaceLineIcon } from "./MapPlaceLineIcon";

export const mapPlaceView = makeModuleView(mapPlaceV2, {
  LineIcon: MapPlaceLineIcon,
  form(props) {
    const { state, onSave, onCancel } = props;
    return <MapPlaceForm state={state} onSave={onSave} onCancel={onCancel} />;
  },
  default: {
    placeholder: MapPlacePlaceholder,
    defaultWidth: 480,
    minWidth: 320,
    component(props) {
      const { state } = props;
      if (state.data === null)
        return <p role="status">This brick has no saved content.</p>;
      return (
        <mapCanvasView.Component
          googlePlaceId={state.data.googlePlaceId}
          latitude={state.data.latitude}
          longitude={state.data.longitude}
          name={state.data.name}
        />
      );
    },
    generator: { registry, defaultSpec: mapPlaceV2.defaultSpec },
  },
});
