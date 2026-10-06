import { DurableObject } from 'cloudflare:workers';

/** Replaces only the fixture class implementation while retaining its storage identity. */
export class RepoLifecycleInspector extends DurableObject<Cloudflare.Env> {
  override fetch(_request: Request) {
    const tables = this.ctx.storage.sql
      .exec("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .toArray()
      .map(row => row.name);
    return Promise.resolve(
      Response.json({
        tables,
        bootstrapped: this.ctx.storage.kv.get('_isBootstrapped') ?? null,
        migrations: tables.includes('applied_migrations')
          ? this.ctx.storage.sql
              .exec(
                'SELECT id, name, appliedAt FROM applied_migrations ORDER BY id',
              )
              .toArray()
          : [],
        records: tables.includes('records')
          ? this.ctx.storage.sql
              .exec('SELECT * FROM records ORDER BY key')
              .toArray()
          : [],
      }),
    );
  }
}
