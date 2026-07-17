import { DurableObject } from 'cloudflare:workers';

export type ISnapshot = Readonly<{
  version: number;
  value: string;
}>;

const snapshotKey = 'snapshot';

const emptySnapshot = (): ISnapshot => ({
  version: 0,
  value: '',
});

export class FixtureStateRepo extends DurableObject<Env> {
  async getSnapshot(): Promise<ISnapshot> {
    const snapshot = await this.ctx.storage.kv.get<ISnapshot>(snapshotKey);
    return snapshot ?? emptySnapshot();
  }

  async bump(props: { value: string }): Promise<ISnapshot> {
    const current = await this.getSnapshot();
    const snapshot: ISnapshot = {
      version: current.version + 1,
      value: props.value,
    };
    await this.ctx.storage.kv.put(snapshotKey, snapshot);

    const name = this.ctx.id.name;
    if (name === undefined || name === '') {
      throw new Error('FixtureStateRepo must be name-addressed');
    }

    await this.env.FIXTURE_SYNC_AGENT.getByName(name).pushSnapshot(snapshot);
    return snapshot;
  }
}
