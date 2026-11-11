import { makeComponentView } from "../../../../react/makeComponentView";
import { repoNameComponentMetadata } from "../../../definition/generator/RepoNameComponentMetadata";

export const repoNameView = makeComponentView(repoNameComponentMetadata, {
  component(props) {
    const { name } = props;
    return <h3 className="min-w-0 shrink-0 break-words [margin-block-end:0]">{name}</h3>;
  },
});
