import { Agent, type Connection, type ConnectionContext } from 'agents';

import type { ISnapshot } from './FixtureStateRepo.ts';

export type ISyncState = Readonly<{
  snapshot: ISnapshot;
  syncedAt: number;
}>;

export class FixtureSyncAgent extends Agent<Env, ISyncState> {
  override initialState: ISyncState = {
    snapshot: { version: 0, value: '' },
    syncedAt: 0,
  };

  override async onStart() {
    const snapshot = await this.env.FIXTURE_STATE_REPO.getByName(
      this.name,
    ).getSnapshot();
    if (snapshot.version > this.state.snapshot.version) {
      this.setState({ snapshot, syncedAt: Date.now() });
    }
  }

  async pushSnapshot(snapshot: ISnapshot): Promise<void> {
    this.setState({ snapshot, syncedAt: Date.now() });
  }

  override shouldConnectionBeReadonly(
    _connection: Connection,
    ctx: ConnectionContext,
  ): boolean {
    const url = new URL(ctx.request.url);
    return url.searchParams.get('mode') === 'view';
  }
}
