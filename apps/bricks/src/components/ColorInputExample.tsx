import { useState } from "react";

import { ColorInput } from "./ColorInput";

export function ColorInputExample() {
  const [color, setColor] = useState("#b73737");
  const pickerColor = /^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(color) ? color : "#ffffff";

  return (
    <ColorInput
      value={color}
      pickerColor={pickerColor}
      onChange={setColor}
      onCommit={setColor}
    />
  );
}
