import { useState } from "react";

import { BorderInput } from "./BorderInput";

export function BorderInputExample() {
  const [border, setBorder] = useState<Parameters<typeof BorderInput>[0]["value"]>({
    width: 0,
    color: "",
  });

  return <BorderInput value={border} onChange={setBorder} />;
}
