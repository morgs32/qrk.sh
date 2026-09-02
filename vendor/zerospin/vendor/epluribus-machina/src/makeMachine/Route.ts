import { Schema } from 'effect';

type ICallable = (...args: ReadonlyArray<any>) => unknown;

interface ICommandRoute {
  readonly payload: Schema.Top;
  readonly program: ICallable;
}

/** Provenance marker for Machine-decoded Route placements. */
export class Route {
  declare readonly onActivation?: ICallable;
  declare readonly commands?: Readonly<Record<string, ICommandRoute>>;

  constructor(props: {
    readonly onActivation?: ICallable;
    readonly commands?: Readonly<Record<string, ICommandRoute>>;
  }) {
    if (props.onActivation !== undefined) {
      this.onActivation = props.onActivation;
    }
    if (props.commands !== undefined) {
      this.commands = props.commands;
    }
  }
}

export const CanonicalRouteSchema = Schema.instanceOf(Route);
