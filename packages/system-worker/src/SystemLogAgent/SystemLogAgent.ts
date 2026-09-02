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

  override onStart(): Promise<void> {
    return managedRuntime.runPromise(
      onStart({
        name: this.name,
        systemId: this.env.ZEROSPIN_SYSTEM_ID,
        setState: state => this.setState(state),
      }),
    );
  }

  override shouldConnectionBeReadonly(
    connection: Connection,
    context: ConnectionContext,
  ): boolean {
    return managedRuntime.runSync(
      shouldConnectionBeReadonly({ connection, context }),
    );
  }

  pushLogRows(rows: readonly ISystemLogRow[]): Promise<void> {
    return managedRuntime.runPromise(
      pushLogRows({
        currentRows: this.state.rows,
        rows,
        setState: state => this.setState(state),
      }),
    );
  }
}
