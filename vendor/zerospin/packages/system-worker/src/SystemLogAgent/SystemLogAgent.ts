import type {
  ISystemLogRow,
  ISystemLogState,
} from '@zerospin/core/system/types';
import { Agent, type Connection, type ConnectionContext } from 'agents';

import { managedRuntime } from '../managedRuntime.js';

import { onStart } from './onStart/onStart.js';
import { pushLogRows } from './pushLogRows/pushLogRows.js';
import { shouldConnectionBeReadonly } from './shouldConnectionBeReadonly/shouldConnectionBeReadonly.js';

export class SystemLogAgent extends Agent<Cloudflare.Env, ISystemLogState> {
  override initialState: ISystemLogState = {
    rows: [],
    syncedAt: 0,
  };

  /*
   * SystemLogAgent.onStart is the runtime boundary for the same-named operation.
   *
   * 1. Run the bound domain operation.
   */
  override onStart(): Promise<void> {
    // 1 — run onStart with the instance-bound dependencies
    return managedRuntime.runPromise(
      onStart({
        name: this.name,
        systemId: this.env.ZEROSPIN_SYSTEM_ID,
        setState: state => this.setState(state),
      }),
    );
  }

  /*
   * The log agent exposes read-only client connections through its lifecycle
   * policy hook.
   *
   * 1. Run the bound domain operation.
   */
  override shouldConnectionBeReadonly(
    connection: Connection,
    context: ConnectionContext,
  ): boolean {
    // 1 — run shouldConnectionBeReadonly with the instance-bound dependencies
    return managedRuntime.runSync(
      shouldConnectionBeReadonly({ connection, context }),
    );
  }

  /*
   * SystemLogAgent.pushLogRows is the runtime boundary for the same-named operation.
   *
   * 1. Run the bound domain operation.
   */
  pushLogRows(rows: readonly ISystemLogRow[]): Promise<void> {
    // 1 — run pushLogRows with the instance-bound dependencies
    return managedRuntime.runPromise(
      pushLogRows({
        currentRows: this.state.rows,
        rows,
        setState: state => this.setState(state),
      }),
    );
  }
}
