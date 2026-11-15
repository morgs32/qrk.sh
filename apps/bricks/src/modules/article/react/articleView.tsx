"use client";

import { addBrick, updateBrick } from "../commands/brickActions";
import { useContext } from "react";
import { BrickSessionContext } from "../../react/BrickSessionContext";
import { articlePreviewState } from "../definition/articlePreviewState";
import { ArticlePlaceholder } from "./ArticlePlaceholder";
import { makeModuleView } from "../../react/makeModuleView";
import { registry } from "./generator/ArticleJsonRenderRegistry";
import { articleV1 } from "../definition/articleV1";
import { ArticleLineIcon } from "./ArticleLineIcon";

const initialDraft = { title: "", subtitle: "", content: null };

const article = makeModuleView(articleV1, {
  defaultPlacementState: {},
  add: addBrick,
  update: updateBrick,
  categoryIds: ["tools"],
  defaultState: articlePreviewState,
  initialDraft,
  LineIcon: ArticleLineIcon,
  inline: true,
  variants: {
    default: {
      placeholder: ArticlePlaceholder,
      registry,
    },
  },
});

export const articleView = {
  ...article,
  Render(props: Parameters<typeof article.Render>[0]) {
    const { brickState, placementState, spec, layoutId } = props;
    const editing = useContext(BrickSessionContext);
    return (
      <article.Render
        brickState={editing !== null && brickState === null ? initialDraft : brickState}
        placementState={placementState}
        spec={spec}
        layoutId={layoutId}
      />
    );
  },
};
