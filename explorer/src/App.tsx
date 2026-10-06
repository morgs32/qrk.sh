import { useEffect, useRef, useState } from 'react';

import { ReactFlowProvider } from '@xyflow/react';

import { systemOverviewScope } from './data/architecture';
import {
  connectionColors,
  connectionNames,
  Diagram,
  ownerColors,
  ownerNames,
} from './diagram';
import { Inspector } from './Inspector';
import { Navbar } from './Navbar';
import type { IConnectionKind, IOwner } from './types';
import { useMobile } from './useMobile';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { TooltipProvider } from '@/components/ui/tooltip';

const allOwners: IOwner[] = ['system', 'aggregate', 'service', 'browser'];
const allKinds: IConnectionKind[] = [
  'relationship',
  'session-execute',
  'session-stage',
  'projection',
  'websocket',
  'async',
  'access',
];
const overviewKinds = allKinds.filter(kind =>
  systemOverviewScope.connections.some(connection => connection.kind === kind),
);
const connectionDescriptions: Partial<Record<IConnectionKind, string>> = {
  'session-execute':
    'Local-only execution in standalone/mock aggregate sessions.',
  'session-stage':
    'Commands staged locally and delivered through Nodes for server admission.',
};

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

function Workbench() {
  const [owners, setOwners] = useState<ReadonlySet<IOwner>>(new Set(allOwners));
  const [kinds, setKinds] = useState<ReadonlySet<IConnectionKind>>(
    new Set<IConnectionKind>(['session-stage']),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const explorerTrigger = useRef<HTMLButtonElement>(null);
  const mobile = useMobile();
  const reducedMotion = useReducedMotion();
  const snapshot = { rows: {} };
  const hasInspector =
    selectedId !== null &&
    !systemOverviewScope.repos.some(repo => repo.id === selectedId);

  const choose = (id: string | null) => {
    setSelectedId(id);
    setSidebarOpen(false);
  };
  const explorer = (
    <>
      <div className="explorer-title">
        <span className="eyebrow">Explore the system</span>
        <h1>Repos & sessions.</h1>
        <p>Framework tables and connections on one canvas.</p>
      </div>
      <div className="filter-section">
        <div className="section-label">
          <span className="eyebrow">Owners & boundaries</span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setOwners(new Set(allOwners))}
          >
            All
          </Button>
        </div>
        {allOwners.map(owner => (
          <div className="filter-item" key={owner}>
            <label className="filter-choice">
              <Checkbox
                checked={owners.has(owner)}
                onCheckedChange={() =>
                  setOwners(current => toggleSet(current, owner))
                }
              />
              <span
                className="color-dot"
                style={{ background: ownerColors[owner] }}
              />
              <span>{ownerNames[owner]}</span>
              <Badge variant="secondary" className="filter-count">
                {systemOverviewScope.repos.filter(repo => repo.owner === owner)
                  .length ||
                  systemOverviewScope.entities.filter(
                    entity => entity.owner === owner,
                  ).length}
              </Badge>
            </label>
            <Button
              variant="ghost"
              size="xs"
              className="filter-only"
              aria-label={`Show only ${ownerNames[owner]}`}
              onClick={() => setOwners(new Set([owner]))}
            >
              Only
            </Button>
          </div>
        ))}
      </div>
      <div className="filter-section">
        <div className="section-label">
          <span className="eyebrow">Connections</span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setKinds(new Set(overviewKinds))}
          >
            All
          </Button>
        </div>
        {overviewKinds.map(kind => (
          <div className="filter-item connection-item" key={kind}>
            <label className="filter-choice">
              <Checkbox
                checked={kinds.has(kind)}
                onCheckedChange={() =>
                  setKinds(current => toggleSet(current, kind))
                }
              />
              <span
                className={`connection-line ${kind}`}
                style={{ borderColor: connectionColors[kind] }}
              />
              <span title={connectionDescriptions[kind]}>
                {connectionNames[kind]}
              </span>
            </label>
            <Button
              variant="ghost"
              size="xs"
              className="filter-only"
              aria-label={`Show only ${connectionNames[kind]}`}
              onClick={() => setKinds(new Set([kind]))}
            >
              Only
            </Button>
          </div>
        ))}
      </div>
      <div className="explorer-footer">
        <span className="live-dot" /> Framework schema catalog
        <span>Source declarations · no application data</span>
      </div>
    </>
  );
  return (
    <div className="app-shell">
      <Navbar
        explorerOpen={sidebarOpen}
        explorerTriggerRef={explorerTrigger}
        onOpenExplorer={mobile ? () => setSidebarOpen(true) : undefined}
      />
      <main className={`workspace ${hasInspector ? 'has-inspector' : ''}`}>
        {mobile ? (
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent
              side="left"
              className="explorer-sheet"
              finalFocus={explorerTrigger}
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Canvas explorer</SheetTitle>
                <SheetDescription>
                  Filter owners and connections in the architecture canvas.
                </SheetDescription>
              </SheetHeader>
              <div
                className="explorer explorer-sheet-body"
                aria-label="Canvas explorer"
              >
                {explorer}
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          <aside className="explorer" aria-label="Canvas explorer">
            {explorer}
          </aside>
        )}
        <section
          className="canvas-area"
          aria-label="System architecture canvas"
        >
          <Diagram
            scope={systemOverviewScope}
            snapshot={snapshot}
            owners={owners}
            kinds={kinds}
            selectedId={selectedId}
            onSelect={choose}
            reducedMotion={reducedMotion}
          />
        </section>
        {hasInspector && selectedId && (
          <Inspector
            scope={systemOverviewScope}
            selectedId={selectedId}
            snapshot={snapshot}
            onSelect={choose}
            onClose={() => setSelectedId(null)}
          />
        )}
      </main>
    </div>
  );
}

export function App() {
  return (
    <TooltipProvider>
      <ReactFlowProvider>
        <Workbench />
      </ReactFlowProvider>
    </TooltipProvider>
  );
}
