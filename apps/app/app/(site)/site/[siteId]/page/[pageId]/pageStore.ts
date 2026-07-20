import { create } from "zustand";

type IPageState = {
  pageType: "split-scroll" | "shared-scroll";
};

export const usePageStore = create<IPageState>(() => ({
  pageType: "split-scroll",
}));
