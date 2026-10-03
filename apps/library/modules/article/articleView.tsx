import { makeModuleView } from "../../make/makeModuleView";
import { TiptapDocSchema } from "../../lib/TiptapDocSchema";
import { Schema } from "effect";
import { registry } from "./generator/ArticleJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { articleV1 } from "./articleV1";
import { articleBrickContentView } from "./ArticleBrickContent";
import { ArticleEditorControl } from "./ArticleEditorControl";

export const articleView = makeModuleView(articleV1, {
  form(props) {
    const { state, onChange } = props;
    return (
      <ArticleEditorControl
        title={state.title}
        subtitle={state.subtitle}
        value={state.content === null ? null : JSON.parse(JSON.stringify(state.content))}
        drawer={{
          onTitleChange: (title) => onChange({ ...state, title }),
          onSubtitleChange: (subtitle) => onChange({ ...state, subtitle }),
          onChange: (content) =>
            onChange({ ...state, content: Schema.decodeUnknownSync(TiptapDocSchema)(content) }),
        }}
      />
    );
  },
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
  sm: { w: 8, h: 2 },
  md: { w: 8, h: 4 },
  lg: { w: 4, h: 4 },
  xl: { w: 4, h: 4 },
});
