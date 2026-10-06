import type { AggregateNode } from '@zerospin/core/AggregateNode/AggregateNode';
import { makeZerospinError } from '@zerospin/error';
import { RpcTarget, type RpcStub } from 'capnweb';
import { Schema } from 'effect';

import { AggregateNodeCommandInputSchema } from './AggregateNodeCommandInputSchema.ts';
import type { AggregateNodeSynchronization } from './AggregateNodeSynchronization.ts';
export class AggregateBrowserSessionApi extends RpcTarget {
  #node: AggregateNode;
  #synchronization: AggregateNodeSynchronization;
  #clear: () => Promise<void>;
  #unsubscribe: (() => void) | null = null;
  #generation = 0;
  #detached = false;
  isCurrent = () => true;
  detach?: () => void;
  constructor(
    node: AggregateNode,
    synchronization: AggregateNodeSynchronization,
    clear: () => Promise<void>,
    detach: () => void,
  ) {
    super();
    this.#node = node;
    this.#synchronization = synchronization;
    this.#clear = clear;
    this.detach = detach;
  }
  #check() {
    if (!this.isCurrent()) throw makeZerospinError({ code: 'node-signed-out' });
    if (this.#detached) throw makeZerospinError({ code: 'node-tab-detached' });
  }
  async snapshot() {
    this.#check();
    return this.#node.snapshot();
  }
  async accept(input: unknown) {
    this.#check();
    let command: typeof AggregateNodeCommandInputSchema.Type;
    try {
      command = Schema.decodeUnknownSync(AggregateNodeCommandInputSchema)(
        input,
        { onExcessProperty: 'error' },
      );
    } catch {
      throw makeZerospinError({ code: 'node-command-invalid' });
    }
    await this.#node.accept(command);
    void this.#synchronization.push().catch(() => undefined);
    return { id: command.id };
  }
  async subscribe(
    input: unknown,
    sink: RpcStub<Parameters<AggregateNode['subscribe']>[1]>,
  ) {
    this.#check();
    const request = Schema.decodeUnknownSync(
      Schema.Struct({
        afterChangeIndex: Schema.optionalKey(
          Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
        ),
      }),
    )(input, { onExcessProperty: 'error' });
    const generation = ++this.#generation;
    this.#unsubscribe?.();
    const retained = sink.dup();
    try {
      const unsubscribe = await this.#node.subscribe(request, {
        initialize: async snapshot => {
          if (this.isCurrent() && !this.#detached) {
            await retained.initialize(snapshot);
          }
        },
        commands: async (commands, throughChangeIndex) => {
          if (this.isCurrent() && !this.#detached) {
            await retained.commands(commands, throughChangeIndex);
          }
        },
        state: async state => {
          if (this.isCurrent() || state.authentication === 'signed-out') {
            await retained.state(state);
          }
        },
      });
      const close = () => {
        unsubscribe();
        retained[Symbol.dispose]();
      };
      if (this.#detached || generation !== this.#generation) close();
      else this.#unsubscribe = close;
    } catch (error) {
      retained[Symbol.dispose]();
      throw error;
    }
  }
  async pushNow() {
    this.#check();
    return this.#synchronization.push(true);
  }
  async resume() {
    this.#check();
    return this.#synchronization.resume();
  }
  async clearAuthentication() {
    this.#check();
    await this.#clear();
  }
  async setPushPaused(input: unknown) {
    this.#check();
    const value = Schema.decodeUnknownSync(
      Schema.Struct({ pushPaused: Schema.Boolean }),
    )(input, { onExcessProperty: 'error' });
    await this.#node.setPushPaused(value.pushPaused);
    if (!value.pushPaused) {
      void this.#synchronization.push().catch(() => undefined);
    }
  }
  async dispose() {
    this[Symbol.dispose]();
  }
  [Symbol.dispose]() {
    if (this.#detached) return;
    this.#detached = true;
    this.#generation += 1;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.detach?.();
  }
}
export type IAggregateBrowserSessionApi = Pick<
  AggregateBrowserSessionApi,
  | 'snapshot'
  | 'accept'
  | 'subscribe'
  | 'pushNow'
  | 'resume'
  | 'clearAuthentication'
  | 'setPushPaused'
  | 'dispose'
>;
