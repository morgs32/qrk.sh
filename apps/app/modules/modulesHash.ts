import { backendLibrary, type IBackendLibrary } from "@qrk.sh/bricks/modules/backendLibrary";
import { reactLibrary } from "@qrk.sh/bricks/modules/reactLibrary";
import { linkView } from "./link/linkView";
import { makeModuleViewLibrary } from "./make/makeModuleViewLibrary";

export const modulesHash = makeModuleViewLibrary<IBackendLibrary>(backendLibrary, {
  ...reactLibrary,
  link: linkView,
});
