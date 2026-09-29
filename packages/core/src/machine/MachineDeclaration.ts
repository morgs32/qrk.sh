import { Schema } from 'effect';

import type { IAnyMachineDeclaration } from './types.ts';

/** Canonical authored machine value shared with the system registry. */
export class MachineDeclaration<
  PROPS extends IAnyMachineDeclaration = IAnyMachineDeclaration,
> {
  readonly source: PROPS['source'];
  readonly selections: PROPS['selections'];
  readonly contracts: PROPS['contracts'];
  readonly states: PROPS['states'];
  readonly routes: PROPS['routes'];
  readonly onBootstrap: PROPS['onBootstrap'];
  readonly onVersionChange: PROPS['onVersionChange'];

  constructor(props: PROPS) {
    this.source = props.source;
    this.selections = props.selections;
    this.contracts = props.contracts;
    this.states = props.states;
    this.routes = props.routes;
    this.onBootstrap = props.onBootstrap;
    this.onVersionChange = props.onVersionChange;
    Object.freeze(this);
  }
}

export const MachineDeclarationSchema = Schema.instanceOf(MachineDeclaration);
