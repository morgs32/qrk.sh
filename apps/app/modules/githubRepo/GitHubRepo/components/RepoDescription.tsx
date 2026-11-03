import { makeComponentView } from "../../../make/makeComponentView";
import { repoDescriptionComponentMetadata } from "@qrk.sh/zerospin/src/modules/githubRepo/generator/RepoDescriptionComponentMetadata";

export const repoDescriptionView = makeComponentView(repoDescriptionComponentMetadata, {
  component(props) {
    const { description: descriptionProp } = props;
    const description = descriptionProp === null ? "" : descriptionProp.trim();
    if (description.length === 0) {
      return null;
    }
    return <p className="min-w-0 [margin-block-start:0] [overflow-wrap:anywhere]">{description}</p>;
  },
});
