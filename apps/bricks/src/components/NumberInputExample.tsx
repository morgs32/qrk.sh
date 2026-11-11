import { Rows3 } from "lucide-react";
import { useState } from "react";

import { NumberInput } from "./NumberInput";

export function NumberInputExample() {
  const [width, setWidth] = useState<number | null>(null);

  return (
    <NumberInput
      label="Row width"
      value={width}
      onChange={setWidth}
      min={0}
      steppers
      leadingIcon={<Rows3 className="size-3" />}
    />
  );
}
