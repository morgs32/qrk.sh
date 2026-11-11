import { useState } from "react";

import { RadiusInput } from "./RadiusInput";

export function RadiusInputExample() {
  const [radius, setRadius] = useState<Parameters<typeof RadiusInput>[0]["value"]>({
    topLeft: 0,
    topRight: 0,
    bottomRight: 0,
    bottomLeft: 0,
  });

  return <RadiusInput value={radius} onChange={setRadius} />;
}
