import { mapPlacePreviewState } from "@qrk.sh/zerospin/src/modules/mapPlace/mapPlacePreviewState";
import { MapPlacePlaceholder } from "./MapPlacePlaceholder";
import { makeModuleView } from "../make/makeModuleView";
import { registry } from "./generator/MapPlaceJsonRenderRegistry";
import { mapPlaceV1 } from "@qrk.sh/zerospin/src/modules/mapPlace/mapPlaceV1";
import { mapCanvasView } from "./MapCanvas";
import { MapPlaceForm } from "./MapPlaceForm";
import { MapPlaceLineIcon } from "./MapPlaceLineIcon";

export const mapPlaceView = makeModuleView(mapPlaceV1, {
  defaultState: mapPlacePreviewState,
  LineIcon: MapPlaceLineIcon,
  form(props) {
    const { state, onSave, onCancel, renderActions } = props;
    return (
      <MapPlaceForm
        state={state}
        onSave={onSave}
        onCancel={onCancel}
        renderActions={renderActions}
      />
    );
  },
  variants: {
    default: {
      placeholder: MapPlacePlaceholder,
      component(props) {
        const { state } = props;
        if (state.data === null) return <p role="status">This brick has no saved content.</p>;
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
  },
});
