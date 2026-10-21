import { create } from "zustand";

export const useSiteStore = create<{
  readonly site: {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly slug: string | null;
    readonly userId: string | null;
    readonly logoUrl: string;
    readonly faviconLightUrl: string;
    readonly faviconDarkUrl: string;
    readonly cardStyle: boolean;
    readonly stickyNavbar: boolean;
  } | null;
  readonly initializeSite: (site: {
    readonly id: string;
    readonly name: string | null;
    readonly description: string | null;
    readonly slug: string | null;
    readonly userId: string | null;
    readonly logoUrl: string | null;
    readonly faviconLightUrl: string | null;
    readonly faviconDarkUrl: string | null;
    readonly cardStyle: boolean;
    readonly stickyNavbar: boolean;
  }) => void;
  readonly setName: (name: string) => void;
  readonly setDescription: (description: string) => void;
  readonly setLogoUrl: (logoUrl: string) => void;
  readonly setFaviconLightUrl: (faviconLightUrl: string) => void;
  readonly setFaviconDarkUrl: (faviconDarkUrl: string) => void;
  readonly setStickyNavbar: (stickyNavbar: boolean) => void;
  readonly setCardStyle: (cardStyle: boolean) => void;
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
        logoUrl: site.logoUrl ?? "",
        faviconLightUrl: site.faviconLightUrl ?? "",
        faviconDarkUrl: site.faviconDarkUrl ?? "",
        cardStyle: site.cardStyle,
        stickyNavbar: site.stickyNavbar,
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
  setLogoUrl: (logoUrl) => {
    set((state) => {
      if (state.site === null) {
        return state;
      }

      return {
        site: {
          ...state.site,
          logoUrl,
        },
      };
    });
  },
  setFaviconLightUrl: (faviconLightUrl) => {
    set((state) => {
      if (state.site === null) {
        return state;
      }

      return {
        site: {
          ...state.site,
          faviconLightUrl,
        },
      };
    });
  },
  setFaviconDarkUrl: (faviconDarkUrl) => {
    set((state) => {
      if (state.site === null) {
        return state;
      }

      return {
        site: {
          ...state.site,
          faviconDarkUrl,
        },
      };
    });
  },
  setStickyNavbar: (stickyNavbar) => {
    set((state) => {
      if (state.site === null) return state;
      return { site: { ...state.site, stickyNavbar } };
    });
  },
  setCardStyle: (cardStyle) => {
    set((state) => {
      if (state.site === null) {
        return state;
      }

      return {
        site: {
          ...state.site,
          cardStyle,
        },
      };
    });
  },
}));
