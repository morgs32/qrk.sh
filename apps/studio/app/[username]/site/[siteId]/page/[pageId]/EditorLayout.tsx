import { BrickBreakpointProvider } from "@qrk.sh/library/BrickBreakpointProvider";
import { MainColumns } from "./MainColumns";
import { Drawers } from "../../Drawers/Drawers";
import { Toolbars } from "../../Toolbars/Toolbars";

export default function SitePage() {
  return (
    <BrickBreakpointProvider>
      <MainColumns />
      <Drawers />
      <Toolbars />
    </BrickBreakpointProvider>
  );
}
