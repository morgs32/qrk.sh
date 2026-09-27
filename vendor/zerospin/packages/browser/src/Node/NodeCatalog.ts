import { makeTableProvisioningStatements } from '@zerospin/core/drizzle/provisionDb/provisionDbTx/makeTableProvisioningSQL/makeTableProvisioningSQL';
import { makeZerospinError } from '@zerospin/error';
import { and, eq, sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import { nodeKey } from './nodeKey.ts';
import type { INodeDefinition, INodeIdentity } from './types.ts';

const catalogNodes = sqliteTable('nodes', {
  key: text().primaryKey(),
  logicalSession: text().notNull(),
  definition: text({ mode: 'json' }).$type<INodeDefinition>().notNull(),
  suspended: integer({ mode: 'boolean' }).notNull(),
});
const catalogLocators = sqliteTable('offlineLocators', {
  sessionDefinition: text().primaryKey(),
  nodeKey: text().notNull(),
});

/** The catalog remembers verified identities; it never treats an offline locator as authentication. */
export class NodeCatalog {
  private serial: Promise<unknown> = Promise.resolve();

  constructor(readonly db: SqliteRemoteDatabase) {}

  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const result = this.serial.then(async () => {
      await this.db.run(sql`BEGIN IMMEDIATE`);
      try {
        const value = await work();
        await this.db.run(sql`COMMIT`);
        return value;
      } catch (error) {
        await this.db.run(sql`ROLLBACK`).catch(() => undefined);
        throw error;
      }
    });
    this.serial = result.catch(() => undefined);
    return result;
  }

  async initialize(): Promise<void> {
    await this.serialized(async () => {
      const tables = await this.db.values(
        sql`SELECT name FROM sqlite_master WHERE type = 'table'`,
      );
      const [version] = await this.db.values<[number]>(
        sql`PRAGMA user_version`,
      );
      if (tables.length > 0) {
        if (version?.[0] !== 2) {
          throw makeZerospinError({ code: 'node-catalog-reset-required' });
        }
        return;
      }
      for (const table of [catalogNodes, catalogLocators]) {
        for (const statement of makeTableProvisioningStatements(table)) {
          await this.db.run(sql.raw(statement));
        }
      }
      await this.db.run(sql`PRAGMA user_version = 2`);
    });
  }

  private locator(identity: INodeIdentity) {
    return nodeKey({ ...identity, targetId: '', identity: {} });
  }

  private logicalSession(identity: INodeIdentity) {
    return nodeKey({
      ...identity,
      targetId: '',
      targetVersion: '',
      actorVersion: '',
      definitionHash: '',
      identity: {},
    });
  }

  /** Call only after the server verified this complete identity and definition. */
  async authenticated(
    definition: INodeDefinition,
    current: () => boolean = () => true,
  ): Promise<string> {
    const key = await nodeKey(definition.identity);
    const sessionDefinition = await this.locator(definition.identity);
    const logicalSession = await this.logicalSession(definition.identity);
    await this.serialized(async () => {
      if (!current()) {
        throw makeZerospinError({ code: 'node-authentication-cancelled' });
      }
      await this.db
        .insert(catalogNodes)
        .values({ key, logicalSession, definition, suspended: false })
        .onConflictDoUpdate({
          target: catalogNodes.key,
          set: { suspended: false },
        });
      await this.db
        .insert(catalogLocators)
        .values({ sessionDefinition, nodeKey: key })
        .onConflictDoUpdate({
          target: catalogLocators.sessionDefinition,
          set: { nodeKey: key },
        });
    });
    return key;
  }

  async reopenOffline(
    identity: INodeIdentity,
  ): Promise<INodeDefinition | null> {
    const sessionDefinition = await this.locator(identity);
    return this.serialized(async () => {
      const [entry] = await this.db
        .select({ definition: catalogNodes.definition })
        .from(catalogLocators)
        .innerJoin(catalogNodes, eq(catalogNodes.key, catalogLocators.nodeKey))
        .where(
          and(
            eq(catalogLocators.sessionDefinition, sessionDefinition),
            eq(catalogNodes.suspended, false),
          ),
        );
      return entry?.definition ?? null;
    });
  }

  async discover(identity: INodeIdentity): Promise<readonly INodeDefinition[]> {
    const logicalSession = await this.logicalSession(identity);
    return this.serialized(async () => {
      const rows = await this.db
        .select({ definition: catalogNodes.definition })
        .from(catalogNodes)
        .where(eq(catalogNodes.logicalSession, logicalSession));
      return rows.map(row => row.definition);
    });
  }

  async clearAuthentication(identity: INodeIdentity): Promise<void> {
    const logicalSession = await this.logicalSession(identity);
    await this.serialized(async () => {
      const affected = await this.db
        .select({ key: catalogNodes.key })
        .from(catalogNodes)
        .where(eq(catalogNodes.logicalSession, logicalSession));
      await this.db
        .update(catalogNodes)
        .set({ suspended: true })
        .where(eq(catalogNodes.logicalSession, logicalSession));
      for (const entry of affected) {
        await this.db
          .delete(catalogLocators)
          .where(eq(catalogLocators.nodeKey, entry.key));
      }
    });
  }
}
