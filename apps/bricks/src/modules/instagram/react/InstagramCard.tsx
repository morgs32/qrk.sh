import { BrickShell } from "../../../components/BrickShell";
import { makeComponentView } from "../../react/makeComponentView";
import { instagramCardComponentMetadata } from "../definition/generator/InstagramCardComponentMetadata";

export const instagramCardView = makeComponentView(instagramCardComponentMetadata, {
  component(props) {
    const { username, children } = props;
    return (
      <a
        className="flex h-full w-full flex-col no-underline"
        href={`https://www.instagram.com/${username}/`}
        rel="noopener noreferrer"
        target="_blank"
      >
        <BrickShell className="overflow-hidden bg-white">{children}</BrickShell>
      </a>
    );
  },
});
