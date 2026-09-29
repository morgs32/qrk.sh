import { Quote } from "lucide-react";
import { brickMetaIconClass } from "../../../../components/brick/brickTokens";
import { makeComponentView } from "../../../../make/makeComponentView";
import { bioComponent } from "../../generator/BioComponent";

export const bioView = makeComponentView(bioComponent, {
  component(props) {
    const { bio } = props;
    if (!bio) {
      return null;
    }

    return (
      <div data-github-profile-json-render="Bio" className="flex items-center gap-1">
        <Quote className={brickMetaIconClass} />
        <p className="m-0 truncate">{bio}</p>
      </div>
    );
  },
});
