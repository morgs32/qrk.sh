import './CharacterStatusIndicator.css';

export function CharacterStatusIndicator({ className = '' }: { className?: string }) {
  return <span className={`character-status-indicator ${className}`} aria-hidden="true" />;
}
