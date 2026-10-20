import { ArticlePlaceholder } from "./ArticlePlaceholder";
import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/ArticleJsonRenderRegistry";
import { articleV1 } from "./articleV1";
import { articleBrickContentView } from "./ArticleBrickContent";
import { ArticleForm } from "./ArticleForm";
import { ArticleLineIcon } from "./ArticleLineIcon";

export const articleView = makeModuleView(articleV1, {
  LineIcon: ArticleLineIcon,
  form: ArticleForm,
  default: {
    placeholder: ArticlePlaceholder,
    defaultWidth: 720,
    minWidth: 320,
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
  lg: { defaultWidth: 800 },
  xl: { defaultWidth: 800 },
});
