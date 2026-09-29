import { Link as LinkIcon } from "lucide-react";
import { brickMetaIconClass } from "../../../../components/brick/brickTokens";
import { makeComponentView } from "../../../../make/makeComponentView";
import { blogComponent } from "../../generator/BlogComponent";

export const blogView = makeComponentView(blogComponent, {
  component(props) {
    const { blog } = props;
    if (!blog) {
      return null;
    }

    return (
      <a
        data-github-profile-json-render="Blog"
        href={blog.startsWith("http") ? blog : `https://${blog}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex cursor-pointer items-center gap-1"
      >
        <LinkIcon className={brickMetaIconClass} />
        <span className="truncate">{blog.replace(/^https?:\/\//, "")}</span>
      </a>
    );
  },
});
