import { DevZerospinApis as CurrentDevZerospinApis } from '@zerospin/dispatch-worker/DevZerospinApis/DevZerospinApis';
import { makeSystemWorkerName } from '@zerospin/dispatch-worker/makeSystemWorkerName';
import { env } from 'cloudflare:workers';
import { asc, eq } from 'drizzle-orm';

export { AccountBlockRepo } from 'system-worker';
export { AccountRepo } from 'system-worker';
export { ActorBlockRepo } from 'system-worker';
export { ActorRepo } from 'system-worker';
export { AuthorizationRepo } from 'system-worker';
export { FrontendBlockRepo } from 'system-worker';
export { FrontendRepo } from 'system-worker';
export { ServiceBlockRepo } from 'system-worker';
export { ServiceFrontendBlockRepo } from 'system-worker';
export { ServiceFrontendRepo } from 'system-worker';
export { ServiceRepo } from 'system-worker';
export { SystemLogAgent } from 'system-worker';
export { SystemLogRepo } from 'system-worker';
export { SystemRepo } from 'system-worker';
export { SystemWorker } from 'system-worker';

/**
 * Test-only visibility around the real local deployment controller.
 *
 * The inherited implementation is the current DevZerospinApis. This
 * subclass exists only so a second process can read recognizable controller
 * rows through the live DevZerospinApis namespace after a full stop/restart.
 */
export class DevZerospinApis extends CurrentDevZerospinApis {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/__test/local-controller-snapshot') {
      return super.fetch(request);
    }

    // Checkpoint 1: the known clean receipt identifies immutable control rows
    // authored by the first Wrangler process.
    const cleanRequest = this.db
      .select()
      .from(this.schema.cleanRequest)
      .where(eq(this.schema.cleanRequest.id, 'cln_local_controller_restart'))
      .get();
    if (cleanRequest === undefined) {
      return Response.json(
        { message: 'Persisted local controller clean receipt is missing' },
        { status: 404 },
      );
    }

    // Checkpoint 2: read the receipt's complete historical control record from
    // the live Durable Object selected by this process.
    const systemInstance = this.db
      .select()
      .from(this.schema.systemInstance)
      .where(eq(this.schema.systemInstance.systemWorkerName, 'sys_local:local'))
      .get();
    const deploy = this.db
      .select()
      .from(this.schema.deploy)
      .where(eq(this.schema.deploy.id, cleanRequest.deployId))
      .get();
    const generation = this.db
      .select()
      .from(this.schema.generation)
      .where(eq(this.schema.generation.id, cleanRequest.generationId))
      .get();
    const deployLogs = this.db
      .select()
      .from(this.schema.deployLog)
      .where(eq(this.schema.deployLog.deployId, cleanRequest.deployId))
      .orderBy(asc(this.schema.deployLog.eventIndex))
      .all();
    if (
      systemInstance === undefined ||
      deploy === undefined ||
      generation === undefined
    ) {
      return Response.json(
        { message: 'Persisted local controller rows are incomplete' },
        { status: 500 },
      );
    }

    // Checkpoint 3: exclude the mutable active pointer because a later Worker
    // version may legitimately advance it after proving storage continuity.
    return Response.json({
      systemInstance: {
        systemWorkerName: systemInstance.systemWorkerName,
        systemId: systemInstance.systemId,
        instanceId: systemInstance.instanceId,
      },
      deploy,
      generation,
      cleanRequest,
      deployLogs,
    });
  }
}

// oxlint-disable-next-line import/no-default-export -- workerd fixture entrypoint
export default {
  fetch(request: Request) {
    return env.DEV_ZEROSPIN_APIS.getByName(
      makeSystemWorkerName({
        systemId: env.ZEROSPIN_SYSTEM_ID,
        instanceId: env.ZEROSPIN_INSTANCE_ID,
      }),
    ).fetch(request);
  },
};
