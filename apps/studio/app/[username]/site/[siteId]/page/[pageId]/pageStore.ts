import { Result, Schema } from "effect";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { JSONContent } from "@tiptap/react";

interface IPageArticleDraft {
  readonly article: JSONContent;
}

interface ISitePagesDraft {
  readonly pages: Readonly<Record<string, IPageArticleDraft>>;
}

interface IOwnerPagesDraft {
  readonly sites: Readonly<Record<string, ISitePagesDraft>>;
}

interface IPageStoreState {
  readonly owners: Readonly<Record<string, IOwnerPagesDraft>>;
  readonly initializePageDraft: (identityKey: string, siteId: string, pageId: string) => void;
  readonly setArticle: (
    identityKey: string,
    siteId: string,
    pageId: string,
    article: JSONContent,
  ) => void;
}

const PAGE_STORE_STORAGE_KEY = "qrk-page-editor-drafts-v1";

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

const ArticleSchema = Schema.Struct({
  type: Schema.Literal("doc"),
  content: Schema.optional(Schema.Array(Schema.Unknown)),
  attrs: Schema.optional(Schema.Unknown),
  marks: Schema.optional(Schema.Array(Schema.Unknown)),
  text: Schema.optional(Schema.String),
});

const PersistedPageEditorStateSchema = Schema.Struct({
  owners: Schema.Record(
    Schema.String,
    Schema.Struct({
      sites: Schema.Record(
        Schema.String,
        Schema.Struct({
          pages: Schema.Record(
            Schema.String,
            Schema.Struct({
              article: ArticleSchema,
            }),
          ),
        }),
      ),
    }),
  ),
}) satisfies Schema.Schema<{
  readonly owners: Readonly<Record<string, IOwnerPagesDraft>>;
}>;

function createSeedPageDraft(): IPageArticleDraft {
  return {
    article: seedArticle,
  };
}

export const usePageStore = create<IPageStoreState>()(
  persist(
    (set) => ({
      owners: {},
      initializePageDraft: (identityKey, siteId, pageId) => {
        set((state) => {
          const ownerDraft = state.owners[identityKey];

          if (ownerDraft === undefined) {
            return {
              owners: {
                ...state.owners,
                [identityKey]: {
                  sites: {
                    [siteId]: {
                      pages: {
                        [pageId]: createSeedPageDraft(),
                      },
                    },
                  },
                },
              },
            };
          }

          const siteDraft = ownerDraft.sites[siteId];

          if (siteDraft === undefined) {
            return {
              owners: {
                ...state.owners,
                [identityKey]: {
                  sites: {
                    ...ownerDraft.sites,
                    [siteId]: {
                      pages: {
                        [pageId]: createSeedPageDraft(),
                      },
                    },
                  },
                },
              },
            };
          }

          if (siteDraft.pages[pageId] !== undefined) {
            return state;
          }

          return {
            owners: {
              ...state.owners,
              [identityKey]: {
                sites: {
                  ...ownerDraft.sites,
                  [siteId]: {
                    ...siteDraft,
                    pages: {
                      ...siteDraft.pages,
                      [pageId]: createSeedPageDraft(),
                    },
                  },
                },
              },
            },
          };
        });
      },
      setArticle: (identityKey, siteId, pageId, article) => {
        set((state) => {
          const ownerDraft = state.owners[identityKey];
          const siteDraft = ownerDraft?.sites[siteId];
          const pageDraft = siteDraft?.pages[pageId];

          if (ownerDraft === undefined || siteDraft === undefined || pageDraft === undefined) {
            return state;
          }

          return {
            owners: {
              ...state.owners,
              [identityKey]: {
                sites: {
                  ...ownerDraft.sites,
                  [siteId]: {
                    ...siteDraft,
                    pages: {
                      ...siteDraft.pages,
                      [pageId]: {
                        ...pageDraft,
                        article,
                      },
                    },
                  },
                },
              },
            },
          };
        });
      },
    }),
    {
      name: PAGE_STORE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ owners: state.owners }),
      skipHydration: true,
      merge: (persistedState, currentState) => {
        const decoded = Schema.decodeUnknownResult(PersistedPageEditorStateSchema, {
          onExcessProperty: "error",
        })(persistedState);

        if (Result.isFailure(decoded)) {
          localStorage.removeItem(PAGE_STORE_STORAGE_KEY);
          return currentState;
        }

        return {
          ...currentState,
          owners: decoded.success.owners,
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error !== undefined) {
          localStorage.removeItem(PAGE_STORE_STORAGE_KEY);
        }
      },
    },
  ),
);
