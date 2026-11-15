"use client";

import { MarkdownView } from "@meowdown/react";
import { stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { useCallback, useContext } from "react";
import { BrickSessionContext } from "../../react/BrickSessionContext";
import { makeComponentView } from "../../react/makeComponentView";
import { articleBrickComponentMetadata } from "../definition/generator/ArticleBrickComponentMetadata";
import { BrickShell } from "../../../components/BrickShell";
import { ArticleEditor } from "./ArticleEditor";
import "../../../components/spectral-font.css";
import "./article-editor.css";

export const articleBrickContentView = makeComponentView(articleBrickComponentMetadata, {
  component(props) {
    const { title, subtitle, content } = props;
    const editing = useContext(BrickSessionContext);
    const resolveXPost = useCallback(() => undefined, []);
    const resolveYouTubeVideo = useCallback(() => undefined, []);
    const onLinkClick = useCallback((props: { href: string }) => {
      const { href } = props;
      window.open(href, "_blank", "noopener,noreferrer");
    }, []);

    if (editing !== null) {
      const { session, brickId, placementId, registerFlush } = editing;
      return (
        <ArticleEditor
          key={placementId}
          state={{ title, subtitle, content }}
          registerFlush={registerFlush}
          onSave={(state) => stageAggregateSessionCommand({
            session,
            contractName: "updateArticleBrick",
            payload: { brickId, state },
          })}
        />
      );
    }

    return (
      <BrickShell className="overflow-hidden bg-white">
        <div className="qrk-article-document qrk-article-readonly qrk-responsive-insets">
          <h1 className="qrk-article-title">{title}</h1>
          <p className="qrk-article-subtitle">{subtitle}</p>
          <div aria-label="Article content">
            <fieldset disabled style={{ display: "contents" }}>
              <MarkdownView
                markdown={content ?? ""}
                markMode="hide"
                interactive={true}
                className="qrk-article-editor readonly"
                resolveXPost={resolveXPost}
                resolveYouTubeVideo={resolveYouTubeVideo}
                onLinkClick={onLinkClick}
              />
            </fieldset>
          </div>
        </div>
      </BrickShell>
    );
  },
});
