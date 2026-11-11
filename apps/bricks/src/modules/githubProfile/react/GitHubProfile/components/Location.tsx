import { MapPin } from "lucide-react";
import { brickMetaIconClass } from "../../../../../components/brickTokens";
import { makeComponentView } from "../../../../react/makeComponentView";
import { locationComponentMetadata } from "../../../definition/generator/LocationComponentMetadata";

export const locationView = makeComponentView(locationComponentMetadata, {
  component(props) {
    const { location } = props;
    if (!location) {
      return null;
    }

    return (
      <div data-github-profile-json-render="Location" className="flex items-center gap-1">
        <MapPin className={brickMetaIconClass} />
        <span className="truncate">{location}</span>
      </div>
    );
  },
});
