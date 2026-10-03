import './NeonPath.css';

export function NeonPath() {
  return (
    <svg className="neon-path" viewBox="0 0 160 440" aria-hidden="true">
      <path className="neon-path__tube" d="M 80 40 V 400" />
      <g className="neon-path__pulse">
        <path className="neon-path__bloom" d="M 80 40 V 400" pathLength="100" />
        <path className="neon-path__glow" d="M 80 40 V 400" pathLength="100" />
        <path className="neon-path__core" d="M 80 40 V 400" pathLength="100" />
      </g>
    </svg>
  );
}
