import { Result, Schema } from "effect";
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
    readonly lg: 1 | 2;
    readonly xl: 1 | 2;
  };
}

interface ISiteDraft {
  readonly pages: Readonly<Record<string, IPageDraft>>;
}

interface IOwnerDraft {
  readonly sites: Readonly<Record<string, ISiteDraft>>;
}

interface ISitePageDraftStoreState {
  readonly owners: Readonly<Record<string, IOwnerDraft>>;
  readonly initializePageDraft: (identityKey: string, siteId: string, pageId: string) => void;
  readonly setPageTitle: (
    identityKey: string,
    siteId: string,
    pageId: string,
    title: string,
  ) => void;
  readonly setPageDescription: (
    identityKey: string,
    siteId: string,
    pageId: string,
    description: string,
  ) => void;
  readonly setGridLayout: (
    identityKey: string,
    siteId: string,
    pageId: string,
    layout: ILayout,
  ) => void;
  readonly addComposeBlock: (identityKey: string, siteId: string, pageId: string) => void;
  readonly updateComposeBlock: (
    identityKey: string,
    siteId: string,
    pageId: string,
    blockId: string,
    content: string,
  ) => void;
  readonly removeComposeBlock: (
    identityKey: string,
    siteId: string,
    pageId: string,
    blockId: string,
  ) => void;
  readonly setBreakpointGridColumnCount: (
    identityKey: string,
    siteId: string,
    pageId: string,
    prefix: BreakpointPrefix,
    count: 1 | 2,
  ) => void;
}

const SITE_PAGE_DRAFT_STORE_STORAGE_KEY = "qrk-site-editor-drafts-v2";

const PersistedSitePageDraftStateSchema = Schema.Struct({
  owners: Schema.Record(
    Schema.String,
    Schema.Struct({
      sites: Schema.Record(
        Schema.String,
        Schema.Struct({
          pages: Schema.Record(
            Schema.String,
            Schema.Struct({
              title: Schema.String,
              description: Schema.String,
              pageType: Schema.Literals(["split-scroll", "shared-scroll"]),
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
                sm: Schema.Literals([1, 2]),
                lg: Schema.Literals([1, 2]),
                xl: Schema.Literals([1, 2]),
              }).annotate({ parseOptions: { onExcessProperty: "ignore" } }),
            }),
          ),
        }).annotate({ parseOptions: { onExcessProperty: "ignore" } }),
      ),
    }),
  ),
}) satisfies Schema.Schema<{
  readonly owners: Readonly<Record<string, IOwnerDraft>>;
}>;

function createSeedPageDraft(): IPageDraft {
  return {
    title: "Make it Rainey",
    description:
      "We are helping Austin home owners save $600 or more on their property taxes.",
    pageType: "split-scroll",
    layout: seedLayout,
    composeBlocks: [],
    breakpointGridColumnCounts: {
      sm: 1,
      lg: 1,
      xl: 1,
    },
  };
}

export const useSitePageDraftStore = create<ISitePageDraftStoreState>()(
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
      setPageTitle: (identityKey, siteId, pageId, title) => {
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
      setPageDescription: (identityKey, siteId, pageId, description) => {
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
      setGridLayout: (identityKey, siteId, pageId, layout) => {
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
      addComposeBlock: (identityKey, siteId, pageId) => {
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
      updateComposeBlock: (identityKey, siteId, pageId, blockId, content) => {
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
      removeComposeBlock: (identityKey, siteId, pageId, blockId) => {
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
      setBreakpointGridColumnCount: (identityKey, siteId, pageId, prefix, count) => {
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
      name: SITE_PAGE_DRAFT_STORE_STORAGE_KEY,
      version: 3,
      migrate: () => ({ owners: {} }),
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ owners: state.owners }),
      skipHydration: true,
      merge: (persistedState, currentState) => {
        const decoded = Schema.decodeUnknownResult(PersistedSitePageDraftStateSchema, {
          onExcessProperty: "error",
        })(persistedState);

        if (Result.isFailure(decoded)) {
          localStorage.removeItem(SITE_PAGE_DRAFT_STORE_STORAGE_KEY);
          return currentState;
        }

        return {
          ...currentState,
          owners: decoded.success.owners,
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error !== undefined) {
          localStorage.removeItem(SITE_PAGE_DRAFT_STORE_STORAGE_KEY);
        }
      },
    },
  ),
);
