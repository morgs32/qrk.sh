import { Schema } from 'effect';

/** Provenance marker for factory-produced Machine definitions. */
export class Machine {
  readonly states: unknown;
  readonly initial: unknown;
  readonly routes: unknown;

  constructor(props: {
    readonly states: unknown;
    readonly initial: unknown;
    readonly routes: unknown;
  }) {
    this.states = props.states;
    this.initial = props.initial;
    this.routes = props.routes;
  }
}

export const CanonicalMachineSchema = Schema.instanceOf(Machine);
