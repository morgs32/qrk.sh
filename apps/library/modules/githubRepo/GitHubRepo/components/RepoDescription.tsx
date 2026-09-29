import { makeComponentView } from "../../../../make/makeComponentView";
import { repoDescriptionComponent } from "../../generator/RepoDescriptionComponent";

export const repoDescriptionView = makeComponentView(repoDescriptionComponent, {
  component(props) {
    const { description: descriptionProp } = props;
    const description = descriptionProp === null ? "" : descriptionProp.trim();
    if (description.length === 0) {
      return null;
    }
    return <p className="min-w-0 [margin-block-start:0] [overflow-wrap:anywhere]">{description}</p>;
  },
});
