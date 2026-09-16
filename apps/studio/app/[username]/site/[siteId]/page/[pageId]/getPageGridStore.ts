import { createGridStore } from "@qrk.sh/library/GridStore";

const pageGridStores = new Map<string, ReturnType<typeof createGridStore>>();

export function getPageGridStore(pageKey: string) {
  const existing = pageGridStores.get(pageKey);
  if (existing) {
    return existing;
  }
  const store = createGridStore();
  pageGridStores.set(pageKey, store);
  return store;
}
