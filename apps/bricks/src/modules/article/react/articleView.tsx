import { articlePreviewState } from "../definition/articlePreviewState";
import { ArticlePlaceholder } from "./ArticlePlaceholder";
import { makeModuleView } from "../../react/makeModuleView";
import { registry } from "./generator/ArticleJsonRenderRegistry";
import { articleV1 } from "../definition/articleV1";
import { ArticleEditor } from "./ArticleEditor";
import { ArticleLineIcon } from "./ArticleLineIcon";

export const articleView = makeModuleView(articleV1, {
  categoryIds: ["tools"],
  defaultState: articlePreviewState,
  initialDraft: { title: "", subtitle: "", content: null },
  LineIcon: ArticleLineIcon,
  inlineEditor: ArticleEditor,
  variants: {
    default: {
      placeholder: ArticlePlaceholder,
      registry,
    },
  },
});
