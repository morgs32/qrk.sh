import { ArticlePlaceholder } from "./ArticlePlaceholder";
import { makeModuleView } from "../make/makeModuleView";
import { registry } from "./generator/ArticleJsonRenderRegistry";
import { articleV1 } from "@qrk.sh/zerospin/src/modules/article/articleV1";
import { articleBrickContentView } from "./ArticleBrickContent";
import { ArticleForm } from "./ArticleForm";
import { ArticleLineIcon } from "./ArticleLineIcon";

export const articleView = makeModuleView(articleV1, {
  LineIcon: ArticleLineIcon,
  form: ArticleForm,
  variants: {
    default: {
      placeholder: ArticlePlaceholder,
      component(props) {
        const { state } = props;
        return (
          <articleBrickContentView.Component
            title={state.title}
            subtitle={state.subtitle}
            content={state.content}
          />
        );
      },
      generator: { registry, defaultSpec: articleV1.defaultSpec },
    },
  },
});
