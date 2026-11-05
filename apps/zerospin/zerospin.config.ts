import { makeConfig } from "@zerospin/sdk";

import { system } from "./src/system";
import { instagramProfileProviderLayer } from "./src/services/instagramVerification/instagramProfileProvider";

export default makeConfig({
  system,
  systemId: "sys_qrk_sh_1",
  layer: instagramProfileProviderLayer,
});
