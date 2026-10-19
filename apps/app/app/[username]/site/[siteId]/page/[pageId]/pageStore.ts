import { create } from "zustand";

export const usePageStore = create<{
  readonly page: {
    readonly id: string;
    readonly siteId: string;
    readonly slug: string | null;
    readonly title: string;
    readonly description: string;
  } | null;
  readonly initializePage: (page: {
    readonly id: string;
    readonly siteId: string;
    readonly slug: string | null;
    readonly title: string | null;
    readonly description: string | null;
  }) => void;
  readonly setTitle: (title: string) => void;
  readonly setDescription: (description: string) => void;
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
    set((state) => (state.page === null ? state : { page: { ...state.page, description } }));
  },
}));
