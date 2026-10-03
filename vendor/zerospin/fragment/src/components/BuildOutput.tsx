import '@fontsource/space-mono/400.css';

import './TerminalOutput.css';

export function BuildOutput() {
  return (
    <div className="terminal-output" aria-label="Build output">
      <div>$ zerospin dev</div>
      <div className="terminal-output__muted">
        <div>
          VITE+ <span className="terminal-output__blue">building for production</span>
        </div>
        <div>
          <span className="terminal-output__success">✓</span> Transformed{' '}
          <span className="terminal-output__value">128 modules</span>
        </div>
      </div>
      <div className="terminal-output__muted">
        <div className="terminal-output__line">
          <span className="terminal-output__value">dist/index.html</span>{' '}
          <span className="terminal-output__blue">0.42 kB</span>
        </div>
        <div className="terminal-output__line">
          <span className="terminal-output__value">dist/assets/index.css</span>{' '}
          <span className="terminal-output__blue">5.1 kB</span>
        </div>
        <div className="terminal-output__line">
          <span className="terminal-output__value">dist/assets/index.js</span>{' '}
          <span className="terminal-output__blue">46.2 kB</span>
        </div>
        <div>
          <span className="terminal-output__success">✓</span> Built in{' '}
          <span className="terminal-output__value">421ms</span>
        </div>
      </div>
    </div>
  );
}
