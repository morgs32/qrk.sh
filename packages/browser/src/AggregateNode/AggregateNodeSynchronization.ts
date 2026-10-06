import type { AggregateNode } from '@zerospin/core/AggregateNode/AggregateNode';
import type { IAggregateStagedCommand } from '@zerospin/core/AggregateNode/types';
import { AggregateBrowserCommandSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { makeZerospinError, PublicFailureSchema } from '@zerospin/error';
import { Schema } from 'effect';

import { isNodeNetworkUnavailable } from '../Node/isNodeNetworkUnavailable.ts';

import type {
  AggregateNodeAuthentication,
  IVerifiedAggregateAdmission,
} from './AggregateNodeAuthentication.ts';
import { aggregateNodeNetwork } from './aggregateNodeNetwork.ts';
import type { IAggregateNodeRequest } from './aggregateNodeRequest.ts';
/** Network calls never hold Node's SQLite transaction boundary. */
export class AggregateNodeSynchronization {
  private socket: WebSocket | null = null;
  private connecting: Promise<void> | null = null;
  private pending: {
    command: IAggregateStagedCommand;
    resolve(): void;
    reject(error: unknown): void;
  } | null = null;
  private pushing: Promise<{ status: 'empty' | 'pushed' }> | null = null;
  private stopped = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  constructor(
    readonly node: AggregateNode,
    readonly request: IAggregateNodeRequest,
    readonly authentication: AggregateNodeAuthentication,
  ) {}
  enable() {
    this.stopped = false;
  }
  resume(verified?: IVerifiedAggregateAdmission): Promise<void> {
    if (this.stopped) {
      return Promise.reject(makeZerospinError({ code: 'node-signed-out' }));
    }
    if (this.node.status().blockedWork) {
      return Promise.reject(
        makeZerospinError({ code: 'node-synchronization-blocked' }),
      );
    }
    if (this.connecting !== null) return this.connecting;
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    const generation = this.generation;
    const connecting = this.connect(verified);
    this.connecting = connecting;
    void connecting
      .catch(async error => {
        if (this.stopped || generation + 1 !== this.generation) return;
        const code =
          error instanceof Error && 'code' in error ? String(error.code) : null;
        if (code === 'node-authentication-rejected') {
          await this.node.rejectAuthentication();
          this.node.connectionState('blocked', error);
          return;
        }
        const retryable = [
          'node-authentication-unavailable',
          'node-subscription-timeout',
          'node-subscription-closed',
          'node-admission-uncertain',
          'node-offline',
        ].includes(String(code));
        if (!retryable && !isNodeNetworkUnavailable(error)) {
          this.node.connectionState('blocked', error);
          return;
        }
        this.node.connectionState('offline', error);
        this.scheduleRetry();
      })
      .finally(() => {
        if (this.connecting === connecting) this.connecting = null;
      })
      .catch(() => undefined);
    return connecting;
  }
  private scheduleRetry() {
    if (!this.stopped && this.retry === null) {
      this.retry = setTimeout(() => {
        this.retry = null;
        void this.resume().catch(() => undefined);
      }, 3000);
    }
  }
  private async connect(admitted?: IVerifiedAggregateAdmission) {
    const generation = ++this.generation;
    this.node.connectionState('authenticating');
    const verified = admitted ?? (await this.authentication.authenticate());
    if (generation !== this.generation || this.stopped) return;
    await this.node.authenticated(
      verified.identity,
      () => generation === this.generation && !this.stopped,
    );
    const before = await this.node.snapshot();
    const ticket = await aggregateNodeNetwork(
      this.request,
      verified.admission,
    ).ticket();
    if (generation !== this.generation || this.stopped) return;
    const url = new URL(this.request.apiUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws-aggregate-session-commands';
    url.search = '';
    url.searchParams.set('ticket', ticket.ticket);
    const socket = new WebSocket(url);
    this.socket = socket;
    let messages: Promise<void> = Promise.resolve();
    await new Promise<void>((resolve, reject) => {
      let live = false;
      let failed = false;
      const fail = (error: unknown) => {
        failed = true;
        this.node.connectionState('blocked', error);
        socket.close();
        reject(error);
      };
      const timeout = setTimeout(() => {
        socket.close();
        reject(makeZerospinError({ code: 'node-subscription-timeout' }));
      }, 15000);
      socket.addEventListener('open', () =>
        socket.send(
          JSON.stringify({
            nodeId: before.metadata.nodeId,
            nodeIndex: before.metadata.outcomeIndex,
            executedIndex: before.metadata.executedIndex,
            executedHash: before.metadata.executedHash,
          }),
        ),
      );
      socket.addEventListener('message', event => {
        messages = messages
          .then(async () => {
            if (failed || this.socket !== socket || this.stopped) return;
            const message: unknown = JSON.parse(event.data);
            if (Array.isArray(message)) {
              const commands = Schema.decodeUnknownSync(
                Schema.Array(AggregateBrowserCommandSchema),
              )(message, { onExcessProperty: 'error' });
              for (const command of commands) {
                await this.node.receiveCommand(command);
              }
              return;
            }
            if (typeof message !== 'object' || message === null) {
              throw makeZerospinError({
                code: 'node-subscription-message-invalid',
              });
            }
            if (!('type' in message)) {
              await this.node.receiveCommand(
                Schema.decodeUnknownSync(AggregateBrowserCommandSchema)(
                  message,
                  { onExcessProperty: 'error' },
                ),
              );
              return;
            }
            if (message.type === 'state-required') {
              throw makeZerospinError({ code: 'node-checkpoint-conflict' });
            }
            if (message.type === 'aggregateCommandAdmissionFailed') {
              const receipt = Schema.decodeUnknownSync(
                Schema.Struct({
                  id: Schema.String,
                  failure: PublicFailureSchema,
                }),
              )(message);
              const pending = this.pending;
              if (pending === null || receipt.id !== pending.command.id) {
                throw makeZerospinError({
                  code: 'node-admission-reply-mismatch',
                });
              }
              this.pending = null;
              const mismatch = Schema.decodeUnknownOption(
                Schema.Struct({
                  code: Schema.Literal('node-admission-index-mismatch'),
                  extra: Schema.Struct({ expectedNodeIndex: Schema.Number }),
                }),
              )(receipt.failure);
              if (
                mismatch._tag === 'Some' &&
                mismatch.value.extra.expectedNodeIndex <
                  pending.command.nodeIndex
              ) {
                await this.node.reconcileAdmission(
                  mismatch.value.extra.expectedNodeIndex,
                );
                pending.resolve();
              } else {
                await this.node.admissionRejected({
                  commandId: pending.command.id,
                  commandName: pending.command.commandName,
                  failure: receipt.failure,
                });
                pending.reject(receipt.failure);
                throw makeZerospinError({ code: 'node-admission-rejected' });
              }
            } else if (message.type === 'aggregateCommandAdmission') {
              const receipt = Schema.decodeUnknownSync(
                Schema.Struct({
                  id: Schema.TemplateLiteral(['cmd_', Schema.String]),
                  nodeIndex: Schema.Number,
                  admissionIndex: Schema.Number,
                  admission: Schema.toEncoded(AdmissionResultSchema),
                }),
              )(message);
              const pending = this.pending;
              if (
                pending === null ||
                receipt.id !== pending.command.id ||
                receipt.nodeIndex !== pending.command.nodeIndex
              ) {
                throw makeZerospinError({
                  code: 'node-admission-reply-mismatch',
                });
              }
              await this.node.admitted(receipt);
              this.pending = null;
              pending.resolve();
            } else if (message.type === 'replay-complete') {
              const through = Schema.decodeUnknownSync(
                Schema.Struct({ executedIndex: Schema.Number }),
              )(message).executedIndex;
              if (
                (await this.node.snapshot()).metadata.executedIndex !== through
              ) {
                throw makeZerospinError({ code: 'node-replay-incomplete' });
              }
              clearTimeout(timeout);
              live = true;
              this.node.connectionState('online');
              resolve();
              void this.push().catch(() => undefined);
            } else {
              throw makeZerospinError({
                code: 'node-subscription-message-invalid',
              });
            }
          })
          .catch(fail);
      });
      socket.addEventListener('error', () => socket.close());
      socket.addEventListener('close', () => {
        clearTimeout(timeout);
        if (generation !== this.generation) return;
        if (this.socket === socket) this.socket = null;
        this.pending?.reject(
          makeZerospinError({ code: 'node-admission-uncertain' }),
        );
        this.pending = null;
        if (!live && !failed) {
          reject(makeZerospinError({ code: 'node-subscription-closed' }));
        }
        if (!failed && !this.stopped) {
          this.node.connectionState('offline');
          this.scheduleRetry();
        }
      });
    });
  }
  push(manual = false): Promise<{ status: 'empty' | 'pushed' }> {
    if (this.pushing !== null) return this.pushing;
    const pushing = (async () => {
      await this.resume();
      for (;;) {
        const command = await this.node.nextPush(manual);
        if (command === null) return { status: 'empty' as const };
        const socket = this.socket;
        if (socket?.readyState !== WebSocket.OPEN) {
          throw makeZerospinError({ code: 'node-offline' });
        }
        const {
          id,
          nodeId,
          nodeIndex,
          commandName,
          payload,
          contractVersion,
          actorName,
          actorVersion,
          sessionName,
          claims,
        } = command;
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            socket.close();
            reject(makeZerospinError({ code: 'node-admission-uncertain' }));
          }, 15000);
          this.pending = {
            command,
            resolve: () => {
              clearTimeout(timeout);
              resolve();
            },
            reject: error => {
              clearTimeout(timeout);
              reject(error);
            },
          };
          socket.send(
            JSON.stringify({
              type: 'pushAggregateCommand',
              command: {
                id,
                nodeId,
                nodeIndex,
                commandName,
                payload,
                contractVersion,
                aggregateId: command.aggregateId,
                aggregateName: command.aggregateName,
                actorName,
                actorVersion,
                sessionName,
                claims,
                systemName: this.request.systemName,
              },
            }),
          );
        });
        if (manual) return { status: 'pushed' as const };
      }
    })();
    this.pushing = pushing;
    void pushing
      .finally(() => {
        if (this.pushing === pushing) this.pushing = null;
      })
      .catch(() => undefined);
    return pushing;
  }
  stop() {
    this.stopped = true;
    this.generation += 1;
    this.connecting = null;
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    this.authentication.clear();
    this.pending?.reject(makeZerospinError({ code: 'node-signed-out' }));
    this.pending = null;
    this.socket?.close();
    this.socket = null;
  }
}
