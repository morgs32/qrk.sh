import { mapPlacePreviewState } from "../definition/mapPlacePreviewState";
import { MapPlacePlaceholder } from "./MapPlacePlaceholder";
import { makeModuleView } from "../../react/makeModuleView";
import { registry } from "./generator/MapPlaceJsonRenderRegistry";
import { mapPlaceV1 } from "../definition/mapPlaceV1";
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
