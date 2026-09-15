import { Schema } from "effect";
import { create } from "zustand";
import type { JSONContent } from "@tiptap/react";

const ArticleDocSchema = Schema.Struct({
  type: Schema.Literal("doc"),
  content: Schema.optional(Schema.Array(Schema.Unknown)),
  attrs: Schema.optional(Schema.Unknown),
  marks: Schema.optional(Schema.Array(Schema.Unknown)),
  text: Schema.optional(Schema.String),
});

const seedArticle: JSONContent = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Hello" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "We are a Sydney-based design studio specialising in branding and wayfinding.",
        },
      ],
    },
  ],
};

function normalizeArticle(article: unknown): JSONContent {
  if (article === null || article === undefined) {
    return seedArticle;
  }

  const value = typeof article === "string" ? JSON.parse(article) : article;
  const decoded = Schema.decodeUnknownSync(ArticleDocSchema)(value);
  return JSON.parse(JSON.stringify(decoded));
}

export const usePageStore = create<{
  readonly page: {
    readonly id: string;
    readonly siteId: string;
    readonly slug: string;
    readonly title: string;
    readonly description: string;
    readonly pageType: "split-scroll" | "shared-scroll";
    readonly article: JSONContent;
  } | null;
  readonly initializePage: (page: {
    readonly id: string;
    readonly siteId: string;
    readonly slug: string;
    readonly title: string | null;
    readonly description: string | null;
    readonly pageType: "split-scroll" | "shared-scroll";
    readonly article: unknown;
  }) => void;
  readonly setTitle: (title: string) => void;
  readonly setDescription: (description: string) => void;
  readonly setArticle: (article: JSONContent) => void;
}>()((set) => ({
  page: null,
  initializePage: (page) => {
    set({
      page: {
        id: page.id,
        siteId: page.siteId,
        slug: page.slug,
        title: page.title ?? "",
        description: page.description ?? "",
        pageType: page.pageType,
        article: normalizeArticle(page.article),
      },
    });
  },
  setTitle: (title) => {
    set((state) => {
      if (state.page === null) {
        return state;
      }

      return {
        page: {
          ...state.page,
          title,
        },
      };
    });
  },
  setDescription: (description) => {
    set((state) => {
      if (state.page === null) {
        return state;
      }

      return {
        page: {
          ...state.page,
          description,
        },
      };
    });
  },
  setArticle: (article) => {
    set((state) => {
      if (state.page === null) {
        return state;
      }

      return {
        page: {
          ...state.page,
          article,
        },
      };
    });
  },
}));
