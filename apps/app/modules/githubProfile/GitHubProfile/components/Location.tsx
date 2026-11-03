import { MapPin } from "lucide-react";
import { brickMetaIconClass } from "../../../components/brick/brickTokens";
import { makeComponentView } from "../../../make/makeComponentView";
import { locationComponentMetadata } from "@qrk.sh/zerospin/src/modules/githubProfile/generator/LocationComponentMetadata";

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
