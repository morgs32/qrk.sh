import { BrickBreakpointProvider } from "@qrk.sh/library/BrickBreakpointProvider";
import { MainColumns } from "./MainColumns";
import { Drawers } from "../../Drawers/Drawers";
import { Toolbars } from "../../Toolbars/Toolbars";
import { useBreakpointsPreviewStore } from "../../Toolbars/useBreakpointsPreviewStore";

export default function SitePage() {
  const persistedWidth = useBreakpointsPreviewStore((state) => state.selectedWidth);
  return (
    <BrickBreakpointProvider persistedWidth={persistedWidth}>
      <MainColumns />
      <Drawers />
      <Toolbars />
    </BrickBreakpointProvider>
  );
}
