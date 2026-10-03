import { useState } from 'react';

import './InstallCommandCard.css';

type InstallCommandCardProps = {
  label: string;
  command: string;
};

export function InstallCommandCard({ label, command }: InstallCommandCardProps) {
  const [copyStatus, setCopyStatus] = useState('');

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setCopyStatus('Copied');
    } catch {
      setCopyStatus('Copy failed');
    }
  }

  return (
    <div className="install-command-card">
      <span className="install-command-label">{label}</span>
      <code className="install-command-code">{command}</code>
      <button
        className="install-command-copy"
        type="button"
        aria-label={`Copy ${label} command`}
        onClick={copyCommand}
      >
        {copyStatus || 'Copy'}
      </button>
      <span className="install-command-status" role="status">
        {copyStatus === 'Copy failed' ? 'Could not copy command.' : copyStatus}
      </span>
    </div>
  );
}
