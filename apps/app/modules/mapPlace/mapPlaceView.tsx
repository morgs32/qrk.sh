import { mapPlacePreviewState } from "@qrk.sh/zerospin/src/modules/mapPlace/mapPlacePreviewState";
import { MapPlacePlaceholder } from "./MapPlacePlaceholder";
import { makeModuleView } from "../make/makeModuleView";
import { registry } from "./generator/MapPlaceJsonRenderRegistry";
import { mapPlaceV1 } from "@qrk.sh/zerospin/src/modules/mapPlace/mapPlaceV1";
import { MapPlaceForm } from "./MapPlaceForm";
import { MapPlaceLineIcon } from "./MapPlaceLineIcon";

export const mapPlaceView = makeModuleView(mapPlaceV1, {
  defaultState: mapPlacePreviewState,
  LineIcon: MapPlaceLineIcon,
  form(props) {
    const { state, onSave, onCancel } = props;
    return <MapPlaceForm state={state} onSave={onSave} onCancel={onCancel} />;
  },
  variants: {
    default: {
      placeholder: MapPlacePlaceholder,
      registry,
    },
  },
});
