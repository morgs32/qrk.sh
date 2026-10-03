import { useEffect, useState } from 'react';

import { ReactFlowProvider } from '@xyflow/react';

import { entities, repos, tables } from './data/architecture';
import { scenarios } from './data/scenarios';
import {
  connectionColors,
  connectionNames,
  Diagram,
  ownerColors,
  ownerNames,
} from './diagram';
import { Inspector } from './Inspector';
import { snapshotAt } from './playback';
import type { IConnectionKind, IOwner, IScenario } from './types';

const allOwners: IOwner[] = [
  'system',
  'user',
  'marketplace',
  'promotion',
  'browser',
  'provider',
];
const allKinds: IConnectionKind[] = [
  'relationship',
  'command',
  'projection',
  'websocket',
  'async',
  'access',
];

function toggleSet<T>(current: ReadonlySet<T>, item: T): Set<T> {
  const next = new Set(current);
  if (next.has(item)) next.delete(item);
  else next.add(item);
  return next;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReduced(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  return reduced;
}

function Visualizer() {
  const firstScenario = scenarios[0];
  if (firstScenario === undefined) {
    throw new Error('No visualizer walkthroughs');
  }
  return <Workbench initialScenario={firstScenario} />;
}

function Workbench({ initialScenario }: { initialScenario: IScenario }) {
  const [scenario, setScenario] = useState(initialScenario);
  const [stepIndex, setStepIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [query, setQuery] = useState('');
  const [owners, setOwners] = useState<ReadonlySet<IOwner>>(new Set(allOwners));
  const [kinds, setKinds] = useState<ReadonlySet<IConnectionKind>>(
    new Set(allKinds),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const snapshot = snapshotAt(scenario, stepIndex);
  const step = snapshot.step;
  const progress = (stepIndex + 1) / scenario.steps.length;
  const matches = query.trim()
    ? tables.filter(table =>
        `${table.name} ${table.columns.map(column => column.name).join(' ')} ${repos.find(repo => repo.id === table.repoId)?.name}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
    : [];

  useEffect(() => {
    if (!playing) return;
    if (stepIndex >= scenario.steps.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(
      () => setStepIndex(index => index + 1),
      2600,
    );
    return () => window.clearTimeout(timer);
  }, [playing, stepIndex, scenario]);

  const go = (index: number) => {
    setPlaying(false);
    setStepIndex(Math.max(-1, Math.min(scenario.steps.length - 1, index)));
  };
  const choose = (id: string) => {
    setSelectedId(id);
    setSidebarOpen(false);
  };
  const changeScenario = (id: string) => {
    const next = scenarios.find(item => item.id === id);
    if (next === undefined) return;
    setScenario(next);
    setStepIndex(-1);
    setPlaying(false);
    setSelectedId(null);
    setOwners(new Set(allOwners));
    setQuery('');
  };
  const inspectStep = () => {
    const contractEntity = step?.contractId
      ? entities.find(entity => entity.contractId === step.contractId)
      : undefined;
    const firstTable = step?.focus.find(id =>
      tables.some(table => table.id === id),
    );
    const id = contractEntity?.id ?? firstTable ?? step?.focus[0];
    if (id) choose(id);
  };
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">Z</span>
          <div>
            <strong>ZEROSPIN</strong>
            <span>System visualizer</span>
          </div>
        </div>
        <div className="header-center">
          <span className="system-pill">shopping</span>
          <span className="header-divider">/</span>
          <span>Architecture & command lifecycle</span>
        </div>
        <div className="header-end">
          <span className="snapshot-badge">EXAMPLE DATA</span>
          <button
            className="icon-button menu-toggle"
            onClick={() => setSidebarOpen(value => !value)}
            aria-label="Toggle explorer"
            aria-expanded={sidebarOpen}
          >
            ☰
          </button>
        </div>
      </header>
      <main className="workspace">
        <aside
          className={`explorer ${sidebarOpen ? 'is-open' : ''}`}
          aria-label="Canvas explorer"
        >
          <div className="explorer-title">
            <span className="eyebrow">EXPLORE THE SYSTEM</span>
            <h1>Under the hood.</h1>
            <p>The architecture, one table at a time.</p>
          </div>
          <label className="search-box">
            <span>⌕</span>
            <input
              type="search"
              aria-label="Search tables, columns, and components"
              placeholder="Find a table or column…"
              value={query}
              onChange={event => setQuery(event.currentTarget.value)}
            />
          </label>
          {query.trim() && (
            <div className="search-results">
              <span className="eyebrow">{matches.length} TABLE MATCHES</span>
              {matches.slice(0, 24).map(table => {
                const repo = repos.find(repo => repo.id === table.repoId);
                return (
                  <button
                    key={table.id}
                    onClick={() => choose(table.id)}
                    aria-label={`${table.name} · ${repo?.name} · ${repo?.identity}`}
                    title={repo?.identity}
                  >
                    <strong>{table.name}</strong>
                    <span>{repo?.name}</span>
                  </button>
                );
              })}
              {matches.length > 24 && <p>Refine search to see more matches.</p>}
            </div>
          )}
          <div className="filter-section">
            <div className="section-label">
              <span className="eyebrow">OWNERS & BOUNDARIES</span>
              <button onClick={() => setOwners(new Set(allOwners))}>All</button>
            </div>
            {allOwners.map(owner => (
              <label className="filter-item" key={owner}>
                <input
                  type="checkbox"
                  checked={owners.has(owner)}
                  onChange={() =>
                    setOwners(current => toggleSet(current, owner))
                  }
                />
                <span
                  className="color-dot"
                  style={{ background: ownerColors[owner] }}
                />
                <span>{ownerNames[owner]}</span>
                <small>
                  {repos.filter(repo => repo.owner === owner).length ||
                    entities.filter(entity => entity.owner === owner).length}
                </small>
              </label>
            ))}
          </div>
          <div className="filter-section">
            <div className="section-label">
              <span className="eyebrow">CONNECTIONS</span>
              <button onClick={() => setKinds(new Set(allKinds))}>All</button>
            </div>
            {allKinds.map(kind => (
              <label className="filter-item connection-item" key={kind}>
                <input
                  type="checkbox"
                  checked={kinds.has(kind)}
                  onChange={() => setKinds(current => toggleSet(current, kind))}
                />
                <span
                  className={`connection-line ${kind}`}
                  style={{ borderColor: connectionColors[kind] }}
                />
                <span>{connectionNames[kind]}</span>
              </label>
            ))}
          </div>
          <div className="repo-index">
            <span className="eyebrow">REPOS & CHAINS</span>
            {repos
              .filter(repo => owners.has(repo.owner))
              .map(repo => (
                <button
                  key={repo.id}
                  className={selectedId === repo.id ? 'selected' : ''}
                  onClick={() => choose(repo.id)}
                >
                  <span
                    className="repo-index-abbr"
                    style={{ color: ownerColors[repo.owner] }}
                  >
                    {repo.abbreviation}
                  </span>
                  <span>{repo.name}</span>
                </button>
              ))}
          </div>
          <div className="explorer-footer">
            <span className="live-dot" /> Source-grounded fixtures
            <span>Current structure · illustrative checkout</span>
          </div>
        </aside>
        <section
          className="canvas-area"
          aria-label="System architecture canvas"
        >
          <Diagram
            snapshot={snapshot}
            query={query}
            owners={owners}
            kinds={kinds}
            selectedId={selectedId}
            onSelect={choose}
            reducedMotion={reducedMotion}
          />
        </section>
        <Inspector
          selectedId={selectedId}
          snapshot={snapshot}
          onSelect={choose}
          onClose={() => setSelectedId(null)}
        />
      </main>
      <section className="walkthrough" aria-label="Command walkthrough">
        <div className="walkthrough-top">
          <div className="scenario-picker">
            <label className="eyebrow" htmlFor="scenario">
              FOLLOW A COMMAND
            </label>
            <select
              id="scenario"
              value={scenario.id}
              onChange={event => changeScenario(event.currentTarget.value)}
            >
              {scenarios.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <span
            className={`scenario-badge ${scenario.illustrative ? 'illustrative' : ''}`}
          >
            {scenario.illustrative
              ? 'ILLUSTRATIVE CHECKOUT'
              : 'CURRENT SHOPPING'}
          </span>
          <div className="playback-controls">
            <button
              className="icon-button"
              onClick={() => go(-1)}
              aria-label="Reset walkthrough"
              title="Reset"
            >
              ↺
            </button>
            <button
              className="icon-button"
              disabled={stepIndex < 0}
              onClick={() => go(stepIndex - 1)}
              aria-label="Previous step"
            >
              ←
            </button>
            <button
              className="play-button"
              onClick={() => {
                if (stepIndex === scenario.steps.length - 1) setStepIndex(-1);
                setPlaying(value => !value);
              }}
              aria-label={playing ? 'Pause walkthrough' : 'Play walkthrough'}
            >
              {playing ? 'Ⅱ' : '▶'}
              <span>{playing ? 'Pause' : 'Play'}</span>
            </button>
            <button
              className="icon-button"
              disabled={stepIndex === scenario.steps.length - 1}
              onClick={() => go(stepIndex + 1)}
              aria-label="Next step"
            >
              →
            </button>
            <span className="step-counter">
              {stepIndex + 1}
              <span>/ {scenario.steps.length}</span>
            </span>
          </div>
        </div>
        <div className="step-summary">
          <div className="step-summary-title">
            <span className={`phase-badge ${step?.phase ?? 'ready'}`}>
              {step?.phase === 'transaction'
                ? 'ATOMIC COMMIT'
                : (step?.phase ?? 'READY')}
            </span>
            <h3>{step?.title ?? 'A command is about to leave the browser.'}</h3>
            {step && <button onClick={inspectStep}>Inspect step ↗</button>}
          </div>
          <p>{step?.description ?? scenario.description}</p>
          {step?.note && <p className="step-note">{step.note}</p>}
        </div>
        <div className="scrubber">
          <input
            type="range"
            min={-1}
            max={scenario.steps.length - 1}
            step={1}
            value={stepIndex}
            onChange={event => go(Number(event.currentTarget.value))}
            aria-label="Walkthrough position"
            aria-valuetext={step?.title ?? 'Initial state'}
            style={{
              background: `linear-gradient(to right, #83e4bd ${progress * 100}%, #2a373c ${progress * 100}%)`,
            }}
          />
        </div>
        <div className="timeline" aria-label="Walkthrough steps">
          <button
            onClick={() => go(-1)}
            className={stepIndex === -1 ? 'current' : ''}
          >
            <span>00</span>Initial state
          </button>
          {scenario.steps.map((item, index) => (
            <button
              key={item.id}
              onClick={() => go(index)}
              className={`${index === stepIndex ? 'current' : ''} ${index < stepIndex ? 'completed' : ''}`}
              aria-current={index === stepIndex ? 'step' : undefined}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              {item.title}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function App() {
  return (
    <ReactFlowProvider>
      <Visualizer />
    </ReactFlowProvider>
  );
}
