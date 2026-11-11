import { useState } from "react";

import { PositionInput } from "./PositionInput";

export function PositionInputExample() {
  const [position, setPosition] = useState<Parameters<typeof PositionInput>[0]["value"]>({
    x: 0,
    y: 0,
  });

  return <PositionInput value={position} onChange={setPosition} />;
}
