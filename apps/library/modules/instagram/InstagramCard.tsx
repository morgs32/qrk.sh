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
        <div className="flex h-full w-full min-h-0 flex-col overflow-hidden">{children}</div>
      </a>
    );
  },
});
