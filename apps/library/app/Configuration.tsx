import type { IModule } from "../lib/types";

/** Module-data configuration UI is retired; bricks render from state only. */
export function Configuration(_props: {
  brickModule: IModule;
  data: unknown;
  showData?: boolean;
  setData: (data: unknown) => void;
}) {
  return null;
}
