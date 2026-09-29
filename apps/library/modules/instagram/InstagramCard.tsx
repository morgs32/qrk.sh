import { BrickShell } from "../../components/brick/BrickShell";
import { makeComponentView } from "../../make/makeComponentView";
import { instagramCardComponent } from "./generator/InstagramCardComponent";

export const instagramCardView = makeComponentView(instagramCardComponent, {
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
