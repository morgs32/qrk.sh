import { useState } from "react";

import { SizeInput } from "./SizeInput";

export function SizeInputExample() {
  const [size, setSize] = useState<Parameters<typeof SizeInput>[0]["value"]>({
    width: 0,
    height: 0,
  });

  return <SizeInput value={size} onChange={setSize} />;
}
