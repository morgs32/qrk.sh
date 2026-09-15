import { create } from "zustand";

export const useSiteStore = create<{
  readonly site: {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly slug: string | null;
    readonly userId: string | null;
  } | null;
  readonly initializeSite: (site: {
    readonly id: string;
    readonly name: string | null;
    readonly description: string | null;
    readonly slug: string | null;
    readonly userId: string | null;
  }) => void;
  readonly setName: (name: string) => void;
  readonly setDescription: (description: string) => void;
}>()((set) => ({
  site: null,
  initializeSite: (site) => {
    set({
      site: {
        id: site.id,
        name: site.name ?? "",
        description: site.description ?? "",
        slug: site.slug,
        userId: site.userId,
      },
    });
  },
  setName: (name) => {
    set((state) => {
      if (state.site === null) {
        return state;
      }

      return {
        site: {
          ...state.site,
          name,
        },
      };
    });
  },
  setDescription: (description) => {
    set((state) => {
      if (state.site === null) {
        return state;
      }

      return {
        site: {
          ...state.site,
          description,
        },
      };
    });
  },
}));
