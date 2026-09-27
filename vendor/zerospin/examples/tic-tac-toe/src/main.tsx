import { useState } from 'react';

import {
  stageCommand,
  useInitializeSession,
  useLiveQuery,
} from '@zerospin/react';
import * as sdk from '@zerospin/sdk/browser';
import { createRoot } from 'react-dom/client';

import { gameSession } from './gameSession';
import { game } from './gameV1';
import './style.css';

const stored = localStorage.getItem('tic-tac-toe-game');
const token = stored ?? crypto.randomUUID();
localStorage.setItem('tic-tac-toe-game', token);
const id = sdk.prefixId(game, token);
const identity = { aggregateId: `acct_${token}`, instanceId: id };
function App() {
  const status = useInitializeSession({
    session: gameSession,
    identity,
  });
  return (
    <main>
      <p className="eyebrow">ZEROSPIN · AUTONOMOUS ACTOR</p>
      <h1>Tic-Tac-Toe</h1>
      <p>You play X. Your opponent plays O, even with this tab closed.</p>
      {status.isInitialized ? <Board /> : <p>Connecting…</p>}
    </main>
  );
}
function Board() {
  const { data: current } = useLiveQuery({
    session: gameSession,
    query: db => db.query.game.findFirst({ where: { id: { eq: id } } }),
  });
  const [error, setError] = useState<string | null>(null);
  if (current === undefined) {
    return (
      <button
        onClick={() => {
          const result = stageCommand({
            session: gameSession,
            contractName: 'createGame',
            payload: { id },
          });
          if (result._tag === 'Failure') setError(result.failure.message);
        }}
      >
        Start game{error ? ` — ${error}` : ''}
      </button>
    );
  }
  return (
    <>
      <h2 aria-live="polite">
        {current.outcome === 'playing'
          ? current.turn === 'X'
            ? 'Your turn'
            : 'O is thinking…'
          : current.outcome === 'draw'
            ? 'A draw!'
            : `${current.outcome} wins!`}
      </h2>
      <div className="board" aria-label="Tic-Tac-Toe board">
        {[...current.board].map((mark, square) => (
          <button
            key={square}
            aria-label={`Square ${square + 1}: ${mark === '.' ? 'empty' : mark}`}
            disabled={
              mark !== '.' ||
              current.turn !== 'X' ||
              current.outcome !== 'playing'
            }
            onClick={() => {
              const result = stageCommand({
                session: gameSession,
                contractName: 'playX',
                payload: { id, board: current.board, square },
              });
              setError(
                result._tag === 'Failure' ? result.failure.message : null,
              );
            }}
          >
            {mark === '.' ? '' : mark}
          </button>
        ))}
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <button
        onClick={() => {
          localStorage.removeItem('tic-tac-toe-game');
          window.location.reload();
        }}
      >
        New game
      </button>
    </>
  );
}
const root = createRoot(document.getElementById('root')!);
root.render(<App />);
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    root.unmount();
  });
}
