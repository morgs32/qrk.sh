import {
  execute,
  makeMachine,
} from '@zerospin/core/machine/makeMachine/makeMachine';
import { makeState } from '@zerospin/core/machine/makeState/makeState';
import {
  captureActorSelections,
  makeActorDbVersion,
} from '@zerospin/core/models/make/makeActorDbVersion';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Context, Effect, Layer, Schema } from 'effect';

import { playO } from './contracts/playOV1';
import { aggregate } from './gameAggregateV1';
import { game } from './gameV1';

/** Replace this service with an LLM-backed Effect without changing the machine. */
export class ChooseComputerMove extends Context.Service<
  ChooseComputerMove,
  (board: string) => Effect.Effect<number>
>()('ChooseComputerMove') {}

export const deterministicComputerMove = Layer.succeed(
  ChooseComputerMove,
  board => Effect.succeed(board.indexOf('.')),
);

const Idle = makeState({ stateName: 'idle', input: {} });
const Choosing = makeState({
  stateName: 'choosing',
  input: {
    aggregateId: Schema.String,
    gameId: makeAbbreviationIdSchema('gam'),
    board: Schema.String,
  },
});
const Submitting = makeState({
  stateName: 'submitting',
  input: {
    aggregateId: Schema.String,
    gameId: makeAbbreviationIdSchema('gam'),
    board: Schema.String,
    square: Schema.Int,
  },
});
const selectedDb = makeActorDbVersion({ models: { game } });
const selections = captureActorSelections(
  selectedDb,
  { game: selectedDb.query.game.findMany() },
  Schema.Struct({}),
);
const PlayedX = Schema.fromJsonString(
  Schema.Struct({ id: makeAbbreviationIdSchema('gam') }),
);

export const computerTurn = makeMachine({
  source: aggregate,
  selections,
  contracts: { playO: { contract: playO, target: aggregate } },
  states: { idle: Idle, choosing: Choosing, submitting: Submitting },
  onBootstrap: () => Idle.make({}),
  routes: {
    idle: {
      onCommand: ({ db, command }) => {
        if (
          !('aggregateId' in command) ||
          command.commandName !== 'playX' ||
          command.execution.status !== 'succeeded'
        ) {
          return undefined;
        }
        const { id } = Schema.decodeUnknownSync(PlayedX)(command.payload);
        const current = db.query.game
          .findFirst({ where: { id: { eq: id } } })
          .sync();
        return current?.outcome === 'playing' && current.turn === 'O'
          ? Choosing.make({
              aggregateId: command.aggregateId,
              gameId: id,
              board: current.board,
            })
          : undefined;
      },
    },
    choosing: {
      onActivation: ({ origin }) =>
        Effect.gen(function* () {
          const chooseMove = yield* ChooseComputerMove;
          const square = yield* chooseMove(origin.board);
          return Submitting.make({
            aggregateId: origin.aggregateId,
            gameId: origin.gameId,
            board: origin.board,
            square,
          });
        }),
    },
    submitting: {
      command: ({ origin }) =>
        execute({
          binding: 'playO',
          aggregateId: origin.aggregateId,
          payload: {
            id: origin.gameId,
            board: origin.board,
            square: origin.square,
          },
        }),
      onResult: () => Idle.make({}),
    },
  },
});
