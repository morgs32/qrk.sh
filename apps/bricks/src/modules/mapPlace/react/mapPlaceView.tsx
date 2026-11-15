import { addBrick, updateBrick } from "../commands/brickActions";
import { mapPlacePreviewState } from "../definition/mapPlacePreviewState";
import { MapPlacePlaceholder } from "./MapPlacePlaceholder";
import { makeModuleView } from "../../react/makeModuleView";
import { BrickDetailsTrigger } from "../../../components/BrickDetailsTrigger";
import { registry } from "./generator/MapPlaceJsonRenderRegistry";
import { mapPlaceV1 } from "../definition/mapPlaceV1";
import { MapPlaceForm } from "./MapPlaceForm";
import { MapPlaceLineIcon } from "./MapPlaceLineIcon";

const mapPlace = makeModuleView(mapPlaceV1, {
  defaultPlacementState: {},
  add: addBrick,
  update: updateBrick,
  categoryIds: ["business"],
  defaultState: mapPlacePreviewState,
  LineIcon: MapPlaceLineIcon,
  form(props) {
    const { state, onSave } = props;
    return <MapPlaceForm state={state} onSave={onSave} />;
  },
  variants: {
    default: {
      placeholder: MapPlacePlaceholder,
      registry,
    },
  },
});

export const mapPlaceView = {
  ...mapPlace,
  Render(props: Parameters<typeof mapPlace.Render>[0]) {
    const { brickState, placementState, layoutId, spec } = props;
    return (
      <BrickDetailsTrigger label={`Edit ${mapPlace.label}`}>
        <mapPlace.Render brickState={brickState} placementState={placementState} spec={spec} layoutId={layoutId} />
      </BrickDetailsTrigger>
    );
  },
};
