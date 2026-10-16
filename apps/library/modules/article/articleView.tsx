import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/ArticleJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { articleV1 } from "./articleV1";
import { articleBrickContentView } from "./ArticleBrickContent";
import { ArticleForm } from "./ArticleForm";

export const articleView = makeModuleView(articleV1, {
  form: ArticleForm,
  default: {
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
  sm: { w: 8, h: 8 },
  md: { w: 6, h: 6 },
  lg: { w: 4, h: 4 },
  xl: { w: 4, h: 4 },
});
