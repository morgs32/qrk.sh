import { Either, Schema } from "effect";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { seedLayout, type ILayout } from "@/components/home/seedLayout";

import type { BreakpointPrefix } from "./page/[pageId]/Breakpoints/breakpointRows";

interface IComposeBlock {
  readonly id: string;
  readonly content: string;
}

interface IPageDraft {
  readonly title: string;
  readonly description: string;
  readonly pageType: "split-scroll" | "shared-scroll";
  readonly layout: ILayout;
  readonly composeBlocks: readonly IComposeBlock[];
  readonly breakpointGridColumnCounts: {
    readonly sm: 1 | 2;
    readonly md: 1 | 2;
    readonly lg: 1 | 2;
    readonly xl: 1 | 2;
    readonly "2xl": 1 | 2;
  };
}

interface ISiteDraft {
  readonly name: string;
  readonly description: string;
  readonly pages: Readonly<Record<string, IPageDraft>>;
}

interface IOwnerDraft {
  readonly sites: Readonly<Record<string, ISiteDraft>>;
}

interface ISiteStoreState {
  readonly owners: Readonly<Record<string, IOwnerDraft>>;
  readonly initializePageDraft: (userId: string, siteId: string, pageId: string) => void;
  readonly setSiteDescription: (userId: string, siteId: string, description: string) => void;
  readonly setPageTitle: (userId: string, siteId: string, pageId: string, title: string) => void;
  readonly setPageDescription: (
    userId: string,
    siteId: string,
    pageId: string,
    description: string,
  ) => void;
  readonly setGridLayout: (userId: string, siteId: string, pageId: string, layout: ILayout) => void;
  readonly addComposeBlock: (userId: string, siteId: string, pageId: string) => void;
  readonly updateComposeBlock: (
    userId: string,
    siteId: string,
    pageId: string,
    blockId: string,
    content: string,
  ) => void;
  readonly removeComposeBlock: (
    userId: string,
    siteId: string,
    pageId: string,
    blockId: string,
  ) => void;
  readonly setBreakpointGridColumnCount: (
    userId: string,
    siteId: string,
    pageId: string,
    prefix: BreakpointPrefix,
    count: 1 | 2,
  ) => void;
}

const SITE_STORE_STORAGE_KEY = "qrk-site-editor-drafts";

const PersistedSiteEditorStateSchema = Schema.Struct({
  owners: Schema.Record({
    key: Schema.String,
    value: Schema.Struct({
      sites: Schema.Record({
        key: Schema.String,
        value: Schema.Struct({
          name: Schema.String,
          description: Schema.String,
          pages: Schema.Record({
            key: Schema.String,
            value: Schema.Struct({
              title: Schema.String,
              description: Schema.String,
              pageType: Schema.Literal("split-scroll", "shared-scroll"),
              layout: Schema.Array(
                Schema.Struct({
                  i: Schema.String,
                  x: Schema.Number,
                  y: Schema.Number,
                  w: Schema.Number,
                  h: Schema.Number,
                  minW: Schema.optional(Schema.Number),
                  minH: Schema.optional(Schema.Number),
                  maxW: Schema.optional(Schema.Number),
                  maxH: Schema.optional(Schema.Number),
                  static: Schema.optional(Schema.Boolean),
                  isDraggable: Schema.optional(Schema.Boolean),
                  isResizable: Schema.optional(Schema.Boolean),
                  isBounded: Schema.optional(Schema.Boolean),
                  moved: Schema.optional(Schema.Boolean),
                }),
              ),
              composeBlocks: Schema.Array(
                Schema.Struct({
                  id: Schema.String,
                  content: Schema.String,
                }),
              ),
              breakpointGridColumnCounts: Schema.Struct({
                sm: Schema.Literal(1, 2),
                md: Schema.Literal(1, 2),
                lg: Schema.Literal(1, 2),
                xl: Schema.Literal(1, 2),
                "2xl": Schema.Literal(1, 2),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}) satisfies Schema.Schema<{
  readonly owners: Readonly<Record<string, IOwnerDraft>>;
}>;

export const useSiteStore = create<ISiteStoreState>()(
  persist(
    (set) => ({
      owners: {},
      initializePageDraft: (userId, siteId, pageId) => {
        set((state) => {
          const ownerDraft = state.owners[userId];

          if (ownerDraft === undefined) {
            return {
              owners: {
                ...state.owners,
                [userId]: {
                  sites: {
                    [siteId]: {
                      name: "Make it Rainey",
                      description:
                        "We are helping Austin home owners save $600 or more on their property taxes.",
                      pages: {
                        [pageId]: {
                          title: "Make it Rainey",
                          description:
                            "We are helping Austin home owners save $600 or more on their property taxes.",
                          pageType: "split-scroll",
                          layout: seedLayout,
                          composeBlocks: [{ id: crypto.randomUUID(), content: "" }],
                          breakpointGridColumnCounts: {
                            sm: 1,
                            md: 1,
                            lg: 1,
                            xl: 1,
                            "2xl": 1,
                          },
                        },
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
                [userId]: {
                  sites: {
                    ...ownerDraft.sites,
                    [siteId]: {
                      name: "Make it Rainey",
                      description:
                        "We are helping Austin home owners save $600 or more on their property taxes.",
                      pages: {
                        [pageId]: {
                          title: "Make it Rainey",
                          description:
                            "We are helping Austin home owners save $600 or more on their property taxes.",
                          pageType: "split-scroll",
                          layout: seedLayout,
                          composeBlocks: [{ id: crypto.randomUUID(), content: "" }],
                          breakpointGridColumnCounts: {
                            sm: 1,
                            md: 1,
                            lg: 1,
                            xl: 1,
                            "2xl": 1,
                          },
                        },
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
              [userId]: {
                sites: {
                  ...ownerDraft.sites,
                  [siteId]: {
                    ...siteDraft,
                    pages: {
                      ...siteDraft.pages,
                      [pageId]: {
                        title: "Make it Rainey",
                        description:
                          "We are helping Austin home owners save $600 or more on their property taxes.",
                        pageType: "split-scroll",
                        layout: seedLayout,
                        composeBlocks: [{ id: crypto.randomUUID(), content: "" }],
                        breakpointGridColumnCounts: {
                          sm: 1,
                          md: 1,
                          lg: 1,
                          xl: 1,
                          "2xl": 1,
                        },
                      },
                    },
                  },
                },
              },
            },
          };
        });
      },
      setSiteDescription: (userId, siteId, description) => {
        set((state) => {
          const ownerDraft = state.owners[userId];
          const siteDraft = ownerDraft?.sites[siteId];

          if (ownerDraft === undefined || siteDraft === undefined) {
            return state;
          }

          return {
            owners: {
              ...state.owners,
              [userId]: {
                sites: {
                  ...ownerDraft.sites,
                  [siteId]: {
                    ...siteDraft,
                    description,
                  },
                },
              },
            },
          };
        });
      },
      setPageTitle: (userId, siteId, pageId, title) => {
        set((state) => {
          const ownerDraft = state.owners[userId];
          const siteDraft = ownerDraft?.sites[siteId];
          const pageDraft = siteDraft?.pages[pageId];

          if (ownerDraft === undefined || siteDraft === undefined || pageDraft === undefined) {
            return state;
          }

          return {
            owners: {
              ...state.owners,
              [userId]: {
                sites: {
                  ...ownerDraft.sites,
                  [siteId]: {
                    ...siteDraft,
                    pages: {
                      ...siteDraft.pages,
                      [pageId]: {
                        ...pageDraft,
                        title,
                      },
                    },
                  },
                },
              },
            },
          };
        });
      },
      setPageDescription: (userId, siteId, pageId, description) => {
        set((state) => {
          const ownerDraft = state.owners[userId];
          const siteDraft = ownerDraft?.sites[siteId];
          const pageDraft = siteDraft?.pages[pageId];

          if (ownerDraft === undefined || siteDraft === undefined || pageDraft === undefined) {
            return state;
          }

          return {
            owners: {
              ...state.owners,
              [userId]: {
                sites: {
                  ...ownerDraft.sites,
                  [siteId]: {
                    ...siteDraft,
                    pages: {
                      ...siteDraft.pages,
                      [pageId]: {
                        ...pageDraft,
                        description,
                      },
                    },
                  },
                },
              },
            },
          };
        });
      },
      setGridLayout: (userId, siteId, pageId, layout) => {
        set((state) => {
          const ownerDraft = state.owners[userId];
          const siteDraft = ownerDraft?.sites[siteId];
          const pageDraft = siteDraft?.pages[pageId];

          if (ownerDraft === undefined || siteDraft === undefined || pageDraft === undefined) {
            return state;
          }

          return {
            owners: {
              ...state.owners,
              [userId]: {
                sites: {
                  ...ownerDraft.sites,
                  [siteId]: {
                    ...siteDraft,
                    pages: {
                      ...siteDraft.pages,
                      [pageId]: {
                        ...pageDraft,
                        layout,
                      },
                    },
                  },
                },
              },
            },
          };
        });
      },
      addComposeBlock: (userId, siteId, pageId) => {
        set((state) => {
          const ownerDraft = state.owners[userId];
          const siteDraft = ownerDraft?.sites[siteId];
          const pageDraft = siteDraft?.pages[pageId];

          if (ownerDraft === undefined || siteDraft === undefined || pageDraft === undefined) {
            return state;
          }

          return {
            owners: {
              ...state.owners,
              [userId]: {
                sites: {
                  ...ownerDraft.sites,
                  [siteId]: {
                    ...siteDraft,
                    pages: {
                      ...siteDraft.pages,
                      [pageId]: {
                        ...pageDraft,
                        composeBlocks: [
                          ...pageDraft.composeBlocks,
                          { id: crypto.randomUUID(), content: "" },
                        ],
                      },
                    },
                  },
                },
              },
            },
          };
        });
      },
      updateComposeBlock: (userId, siteId, pageId, blockId, content) => {
        set((state) => {
          const ownerDraft = state.owners[userId];
          const siteDraft = ownerDraft?.sites[siteId];
          const pageDraft = siteDraft?.pages[pageId];

          if (ownerDraft === undefined || siteDraft === undefined || pageDraft === undefined) {
            return state;
          }

          return {
            owners: {
              ...state.owners,
              [userId]: {
                sites: {
                  ...ownerDraft.sites,
                  [siteId]: {
                    ...siteDraft,
                    pages: {
                      ...siteDraft.pages,
                      [pageId]: {
                        ...pageDraft,
                        // The compose block list is intentionally traversed here so the matching
                        // block is replaced without hiding the update inside a generic helper.
                        composeBlocks: pageDraft.composeBlocks.map((block) =>
                          block.id === blockId ? { ...block, content } : block,
                        ),
                      },
                    },
                  },
                },
              },
            },
          };
        });
      },
      removeComposeBlock: (userId, siteId, pageId, blockId) => {
        set((state) => {
          const ownerDraft = state.owners[userId];
          const siteDraft = ownerDraft?.sites[siteId];
          const pageDraft = siteDraft?.pages[pageId];

          if (ownerDraft === undefined || siteDraft === undefined || pageDraft === undefined) {
            return state;
          }

          return {
            owners: {
              ...state.owners,
              [userId]: {
                sites: {
                  ...ownerDraft.sites,
                  [siteId]: {
                    ...siteDraft,
                    pages: {
                      ...siteDraft.pages,
                      [pageId]: {
                        ...pageDraft,
                        // The compose block list is intentionally traversed here so only the
                        // requested block is removed without introducing a filtering helper.
                        composeBlocks: pageDraft.composeBlocks.filter(
                          (block) => block.id !== blockId,
                        ),
                      },
                    },
                  },
                },
              },
            },
          };
        });
      },
      setBreakpointGridColumnCount: (userId, siteId, pageId, prefix, count) => {
        set((state) => {
          const ownerDraft = state.owners[userId];
          const siteDraft = ownerDraft?.sites[siteId];
          const pageDraft = siteDraft?.pages[pageId];

          if (ownerDraft === undefined || siteDraft === undefined || pageDraft === undefined) {
            return state;
          }

          return {
            owners: {
              ...state.owners,
              [userId]: {
                sites: {
                  ...ownerDraft.sites,
                  [siteId]: {
                    ...siteDraft,
                    pages: {
                      ...siteDraft.pages,
                      [pageId]: {
                        ...pageDraft,
                        breakpointGridColumnCounts: {
                          ...pageDraft.breakpointGridColumnCounts,
                          [prefix]: count,
                        },
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
      name: SITE_STORE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ owners: state.owners }),
      skipHydration: true,
      merge: (persistedState, currentState) => {
        const decoded = Schema.decodeUnknownEither(PersistedSiteEditorStateSchema)(persistedState, {
          onExcessProperty: "error",
        });

        if (Either.isLeft(decoded)) {
          localStorage.removeItem(SITE_STORE_STORAGE_KEY);
          return currentState;
        }

        return {
          ...currentState,
          owners: decoded.right.owners,
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error !== undefined) {
          localStorage.removeItem(SITE_STORE_STORAGE_KEY);
        }
      },
    },
  ),
);
