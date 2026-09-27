import { RpcTarget, type RpcStub } from 'capnweb';
import { Effect } from 'effect';

import type { Node } from '../Node/Node.ts';
import type { NodeSynchronization } from '../Node/NodeSynchronization.ts';

import { accept } from './accept/accept.ts';
import { clearAuthentication } from './clearAuthentication/clearAuthentication.ts';
import { dispose } from './dispose/dispose.ts';
import { history } from './history/history.ts';
import { pushNow } from './pushNow/pushNow.ts';
import { resume } from './resume/resume.ts';
import { setPushPaused } from './setPushPaused/setPushPaused.ts';
import { snapshot } from './snapshot/snapshot.ts';
import { subscribe } from './subscribe/subscribe.ts';

/** One attached tab capability. Disposing it never deletes or supersedes its node. */
export class BrowserSessionApi extends RpcTarget {
  detached = false;
  isCurrent = () => true;
  subscriptionGeneration = 0;
  unsubscribe: (() => void) | null = null;

  constructor(
    readonly node: Node,
    readonly synchronization?: NodeSynchronization,
    readonly clear?: () => Promise<void>,
    public detach?: () => void,
  ) {
    super();
  }

  async snapshot() {
    return Effect.runPromise(snapshot({ api: this }));
  }
  async pushNow() {
    return Effect.runPromise(pushNow({ api: this }));
  }
  async resume() {
    return Effect.runPromise(resume({ api: this }));
  }
  async clearAuthentication() {
    return Effect.runPromise(clearAuthentication({ api: this }));
  }

  async accept(input: unknown) {
    return Effect.runPromise(accept({ api: this, input }));
  }

  async history(input: unknown) {
    return Effect.runPromise(history({ api: this, input }));
  }

  async setPushPaused(input: unknown) {
    return Effect.runPromise(setPushPaused({ api: this, input }));
  }

  async subscribe(receive: RpcStub<Parameters<Node['subscribe']>[0]>) {
    return Effect.runPromise(subscribe({ api: this, receive }));
  }

  async dispose() {
    return Effect.runPromise(dispose({ api: this }));
  }

  [Symbol.dispose](): void {
    Effect.runSync(dispose({ api: this }));
  }
}

export type IBrowserSessionApi = Pick<
  BrowserSessionApi,
  | 'accept'
  | 'history'
  | 'subscribe'
  | 'snapshot'
  | 'pushNow'
  | 'setPushPaused'
  | 'resume'
  | 'clearAuthentication'
  | 'dispose'
>;
