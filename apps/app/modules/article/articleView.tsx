import { articlePreviewState } from "@qrk.sh/zerospin/src/modules/article/articlePreviewState";
import { ArticlePlaceholder } from "./ArticlePlaceholder";
import { makeModuleView } from "../make/makeModuleView";
import { registry } from "./generator/ArticleJsonRenderRegistry";
import { articleV1 } from "@qrk.sh/zerospin/src/modules/article/articleV1";
import { ArticleEditor } from "./ArticleEditor";
import { ArticleLineIcon } from "./ArticleLineIcon";

export const articleView = makeModuleView(articleV1, {
  defaultState: articlePreviewState,
  LineIcon: ArticleLineIcon,
  inlineEditor: ArticleEditor,
  variants: {
    default: {
      placeholder: ArticlePlaceholder,
      registry,
    },
  },
});
