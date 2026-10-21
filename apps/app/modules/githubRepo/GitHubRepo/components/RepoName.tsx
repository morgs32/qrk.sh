import { makeComponentView } from "../../../make/makeComponentView";
import { repoNameComponent } from "@qrk.sh/zerospin/src/modules/githubRepo/generator/RepoNameComponent";

export const repoNameView = makeComponentView(repoNameComponent, {
  component(props) {
    const { name } = props;
    return <h3 className="min-w-0 shrink-0 break-words [margin-block-end:0]">{name}</h3>;
  },
});
