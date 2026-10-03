import './tic-tac-toe.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useGameStore } from './game-store';

const labels = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];

export default function TicTacToe() {
  const { board, phase, cursorIndex, moveCursor, playNext, respond, reset } = useGameStore();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const action = phase === 'thinking' ? respond : phase === 'moving' ? playNext : phase === 'complete' ? reset : moveCursor;
    const delay = phase === 'thinking' ? 780 : phase === 'moving' ? 560 : phase === 'complete' ? 3200 : phase === 'idle' ? 520 : 420;
    const timeout = window.setTimeout(action, delay);
    return () => window.clearTimeout(timeout);
  }, [phase, moveCursor, playNext, respond, reset]);

  return (
    <div className="tic-tac-toe" role="img" aria-label={`Tic-tac-toe board: ${board.map((mark, index) => `${labels[index]} ${mark ?? 'empty'}`).join(', ')}`}>
      {board.map((mark, index) => (
        <div className="tic-tac-toe__cell" key={labels[index]}>
          {mark && <span className={`tic-tac-toe__mark tic-tac-toe__mark--${mark.toLowerCase()}`} aria-hidden="true">{mark}</span>}
        </div>
      ))}
      {cursorIndex !== null && (
        <motion.svg
          className="tic-tac-toe__cursor"
          viewBox="0 0 30 38"
          aria-hidden="true"
          initial={{ left: '105%', top: '105%', opacity: 0 }}
          animate={{
            left: `${((cursorIndex % 3) + 0.62) * 100 / 3}%`,
            top: `${(Math.floor(cursorIndex / 3) + 0.62) * 100 / 3}%`,
            opacity: 1,
          }}
          transition={{ duration: reducedMotion ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <path d="M3 2v29l7.6-7.7 5.7 12.2 6.1-2.9-5.7-12.1H28L3 2Z" fill="#171717" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        </motion.svg>
      )}
    </div>
  );
}
