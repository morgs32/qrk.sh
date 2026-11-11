import { useState } from "react";

import { ShadowInput } from "./ShadowInput";

export function ShadowInputExample() {
  const [shadow, setShadow] = useState<Parameters<typeof ShadowInput>[0]["value"]>({
    x: 0,
    y: 0,
    blur: 0,
    spread: 0,
    color: "",
  });

  return <ShadowInput value={shadow} onChange={setShadow} />;
}
