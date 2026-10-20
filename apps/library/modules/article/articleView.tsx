import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/ArticleJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { articleV1 } from "./articleV1";
import { articleBrickContentView } from "./ArticleBrickContent";
import { ArticleForm } from "./ArticleForm";
import { ArticleLineIcon } from "./ArticleLineIcon";

export const articleView = makeModuleView(articleV1, {
  LineIcon: ArticleLineIcon,
  form: ArticleForm,
  default: {
    defaultWidth: 720,
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
    generator: { registry, defaultSpec },
  },
  lg: { defaultWidth: 800 },
  xl: { defaultWidth: 800 },
});
