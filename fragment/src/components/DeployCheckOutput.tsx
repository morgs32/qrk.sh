import '@fontsource/space-mono/400.css';

import './TerminalOutput.css';

export function DeployCheckOutput() {
  return (
    <div className="terminal-output" aria-label="Deploy check output">
      <div>$ zerospin deploy</div>
      <div className="terminal-output__line">
        <span className="terminal-output__blue">pass:</span>All{' '}
        <span className="terminal-output__value">42 files</span> are correctly
        formatted<span className="terminal-output__muted">(88ms, 16 threads)</span>
      </div>
      <div className="terminal-output__line terminal-output__muted">
        <span className="terminal-output__blue">pass:</span>Found no warnings, lint
        errors, or type errors in{' '}
        <span className="terminal-output__value">42 files</span>
        <span>(184ms, 16 threads)</span>
      </div>
    </div>
  );
}
