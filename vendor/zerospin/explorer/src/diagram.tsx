import { useMemo } from 'react';

import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
  useViewport,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { Crosshair, Maximize, Table2 } from 'lucide-react';
import '@xyflow/react/dist/style.css';

import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './components/ui/tooltip';
import { systemOverviewScope } from './data/architecture';
import { useTheme } from './theme';
import type {
  IConnectionKind,
  IEntity,
  IGraphScope,
  IOwner,
  IRepo,
  ISnapshot,
  ITable,
} from './types';

export const ownerNames: Record<IOwner, string> = {
  system: 'System',
  aggregate: 'Aggregate',
  service: 'Service',
  browser: 'Browser & sessions',
};
export const ownerColors: Record<IOwner, string> = {
  system: 'var(--owner-system)',
  aggregate: 'var(--owner-aggregate)',
  service: 'var(--owner-service)',
  browser: 'var(--owner-browser)',
};
export const connectionNames: Record<IConnectionKind, string> = {
  relationship: 'Declared reference',
  'session-execute': 'Session executeCommand',
  'session-stage': 'Session stageCommand',
  projection: 'History & projection',
  websocket: 'Websocket stream',
  async: 'Async producer work',
  access: 'Access & binding',
};
export const connectionColors: Record<IConnectionKind, string> = {
  relationship: 'var(--connection-relationship)',
  'session-execute': 'var(--connection-session-execute)',
  'session-stage': 'var(--connection-session-stage)',
  projection: 'var(--connection-projection)',
  websocket: 'var(--connection-websocket)',
  async: 'var(--connection-async)',
  access: 'var(--connection-access)',
};

type IRepoData = {
  repo: IRepo;
  tableCount: number;
};
type ITableData = {
  table: ITable;
  owner: IOwner;
  rows: number;
};
type IEntityData = { entity: IEntity };
type IOwnerBoundaryData = {
  owner: IOwner;
  name: string;
  componentCount: number;
};
type IRepoNode = Node<IRepoData, 'repo'>;
type ITableNode = Node<ITableData, 'table'>;
type IEntityNode = Node<IEntityData, 'entity'>;
type IOwnerBoundaryNode = Node<IOwnerBoundaryData, 'owner-boundary'>;
type IFlowNode = IRepoNode | ITableNode | IEntityNode | IOwnerBoundaryNode;

function SessionExecuteEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  label,
  labelStyle,
  labelBgStyle,
}: EdgeProps) {
  const top = Math.min(sourceY, targetY) - 100;
  return (
    <BaseEdge
      id={id}
      path={`M ${sourceX},${sourceY} C ${sourceX},${top} ${targetX},${top} ${targetX},${targetY}`}
      markerEnd={markerEnd}
      style={style}
      label={label}
      labelX={(sourceX + targetX) / 2}
      labelY={(sourceY + targetY) / 2 - 75}
      labelStyle={labelStyle}
      labelBgStyle={labelBgStyle}
    />
  );
}

function RepoNode({ data }: NodeProps<IRepoNode>) {
  const { repo, tableCount } = data;
  return (
    <Card
      className="repo-heading"
      style={{ borderColor: ownerColors[repo.owner] }}
    >
      <Handle type="target" position={Position.Left} id="in" />
      <Handle
        type="source"
        position={Position.Top}
        id="execute-out"
        style={{ left: '35%' }}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="execute-in"
        style={{ left: '65%' }}
      />
      <div className="repo-heading-top">
        <span className="repo-abbr" style={{ color: ownerColors[repo.owner] }}>
          {repo.abbreviation}
        </span>
        <Badge variant="outline" className="repo-count">
          {tableCount} {tableCount === 1 ? 'table' : 'tables'}
        </Badge>
      </div>
      <strong>{repo.name}</strong>
      <code>{repo.identity}</code>
      <Handle type="source" position={Position.Right} id="out" />
    </Card>
  );
}

function TableNode({ data }: NodeProps<ITableNode>) {
  const { table, owner, rows } = data;
  return (
    <Card className="table-card" style={{ borderTopColor: ownerColors[owner] }}>
      <header>
        <Table2 className="table-icon" aria-hidden="true" size={16} />
        <strong>{table.name}</strong>
        <Badge
          variant="secondary"
          className="row-count"
          title={`${rows} example rows`}
        >
          {rows}
        </Badge>
      </header>
      <div className="table-columns">
        {table.columns.map(column => (
          <div className="column-row" key={column.name}>
            <Handle
              type="target"
              position={Position.Left}
              id={`in-${column.name}`}
            />
            <span
              className="column-key"
              title={
                column.primaryKey
                  ? 'Primary key'
                  : column.reference
                    ? 'Declared reference'
                    : column.unique
                      ? 'Unique'
                      : ''
              }
            >
              {column.primaryKey
                ? 'PK'
                : column.reference
                  ? '↗'
                  : column.unique
                    ? 'U'
                    : ''}
            </span>
            <span className="column-name" title={column.name}>
              {column.name}
            </span>
            <span className="column-type" title={column.type}>
              {column.type}
            </span>
            <span
              className="column-null"
              title={column.nullable ? 'Nullable' : 'Required'}
            >
              {column.nullable ? '?' : '·'}
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id={`out-${column.name}`}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

function EntityNode({ data }: NodeProps<IEntityNode>) {
  const { entity } = data;
  return (
    <Card
      className="entity-card"
      style={{ borderColor: ownerColors[entity.owner] }}
    >
      <Handle type="target" position={Position.Left} id="in" />
      <div className="entity-kind">{entity.kind}</div>
      <strong>{entity.name}</strong>
      <p>{entity.description}</p>
      <Handle type="source" position={Position.Right} id="out" />
    </Card>
  );
}

function OwnerBoundaryNode({ data }: NodeProps<IOwnerBoundaryNode>) {
  const { zoom } = useViewport();
  return (
    <div className="owner-boundary">
      <div
        className="owner-boundary-label"
        style={{ transform: `scale(${Math.min(2, Math.max(1, 0.5 / zoom))})` }}
      >
        <strong>{data.name}</strong>
        <span>
          {data.componentCount}{' '}
          {data.componentCount === 1 ? 'component' : 'components'}
        </span>
      </div>
    </div>
  );
}

const nodeTypes = {
  repo: RepoNode,
  table: TableNode,
  entity: EntityNode,
  'owner-boundary': OwnerBoundaryNode,
};
const edgeTypes = { 'session-execute': SessionExecuteEdge };
const tableWidth = 380;
const initialFitViewOptions = { padding: 0.12, maxZoom: 0.55 };

function makeRepoTables(
  snapshot: ISnapshot,
  repo: IRepo,
  tables: readonly ITable[],
) {
  const columns = Math.min(3, Math.max(1, tables.length));
  const columnBottoms = Array<number>(columns).fill(146);
  const nodes: ITableNode[] = tables.map(table => {
    const column = columnBottoms.indexOf(Math.min(...columnBottoms));
    const y = columnBottoms[column]!;
    const height = 62 + table.columns.length * 26;
    columnBottoms[column] = y + height + 24;
    return {
      id: table.id,
      type: 'table',
      parentId: repo.id,
      extent: 'parent',
      position: { x: 22 + column * (tableWidth + 22), y },
      width: tableWidth,
      height,
      ariaLabel: `${repo.name}, table ${table.name}. ${table.columns.length} columns. Enter to inspect.`,
      data: {
        table,
        owner: repo.owner,
        rows: snapshot.rows[table.id]?.length ?? 0,
      },
    };
  });
  return {
    nodes,
    width: columns * (tableWidth + 22) + 22,
    height: Math.max(...columnBottoms) + 8,
  };
}

/** Size each repo around its tables, keeping owner groups in separate areas. */
function makeOverviewNodes(
  snapshot: ISnapshot,
  scope: IGraphScope,
): IFlowNode[] {
  const repoTables = new Map(
    scope.repos.map(repo => [
      repo.id,
      makeRepoTables(
        snapshot,
        repo,
        scope.tables.filter(table => table.repoId === repo.id),
      ),
    ]),
  );
  const positions = new Map<string, { x: number; y: number }>();
  const sessions = scope.repos.filter(
    repo => repo.owner === 'browser' && !repo.id.endsWith('-node'),
  );
  const sharedWorkers = scope.repos.filter(repo => repo.id.endsWith('-node'));
  const sessionWidth = Math.max(
    ...sessions.map(repo => repoTables.get(repo.id)!.width),
  );
  const sharedWorkerWidth = Math.max(
    ...sharedWorkers.map(repo => repoTables.get(repo.id)!.width),
  );
  const sharedWorkerLeft = sessionWidth + 260;
  const workerLeft = sharedWorkerLeft + sharedWorkerWidth + 500;
  const browserPairs: readonly [string, string][] = [
    ['aggregate-session', 'aggregate-node'],
    ['session', 'service-node'],
  ];
  let browserTop = 120;
  for (const [sessionId, nodeId] of browserPairs) {
    const session = repoTables.get(sessionId)!;
    const node = repoTables.get(nodeId)!;
    const height = Math.max(session.height, node.height);
    positions.set(sessionId, {
      x: sessionWidth - session.width,
      y: browserTop + (height - session.height) / 2,
    });
    positions.set(nodeId, {
      x: sharedWorkerLeft,
      y: browserTop + (height - node.height) / 2,
    });
    browserTop += height + 340;
  }
  let workerTop = 120;
  for (const owner of ['aggregate', 'service', 'system']) {
    const ownedRepos = scope.repos
      .filter(repo => repo.owner === owner)
      .sort((left, right) => left.position.x - right.position.x);
    const ownedEntities = scope.entities.filter(
      entity => entity.owner === owner,
    );
    const repoTop = workerTop + Math.ceil(ownedEntities.length / 2) * 230;
    let repoLeft = workerLeft;
    for (const repo of ownedRepos) {
      const tables = repoTables.get(repo.id)!;
      positions.set(repo.id, { x: repoLeft, y: repoTop });
      repoLeft += tables.width + 260;
    }
    ownedEntities.forEach((entity, index) => {
      positions.set(entity.id, {
        x: workerLeft + (index % 2) * 340,
        y: workerTop + Math.floor(index / 2) * 230,
      });
    });
    workerTop =
      repoTop +
      Math.max(...ownedRepos.map(repo => repoTables.get(repo.id)!.height)) +
      340;
  }
  const repoNodes = scope.repos.flatMap<IFlowNode>(repo => {
    const tables = repoTables.get(repo.id)!;
    return [
      {
        id: repo.id,
        type: 'repo',
        position: positions.get(repo.id)!,
        width: tables.width,
        height: tables.height,
        style: {
          width: tables.width,
          height: tables.height,
          borderColor: `color-mix(in oklab, ${ownerColors[repo.owner]} 20%, transparent)`,
        },
        ariaLabel: `${repo.name}. ${tables.nodes.length} tables shown inside. Click to fit on screen.`,
        data: { repo, tableCount: tables.nodes.length },
      },
      ...tables.nodes,
    ];
  });
  const entityNodes: IEntityNode[] = scope.entities.map(entity => ({
    id: entity.id,
    type: 'entity',
    position: positions.get(entity.id)!,
    width: 320,
    height: 180,
    style: { height: 180 },
    ariaLabel: `${entity.kind}: ${entity.name}`,
    data: { entity },
  }));
  return [...repoNodes, ...entityNodes];
}

/** Frame only visible components, so owner filters never leave empty groups. */
function makeOwnerBoundaryNodes(
  nodes: readonly IFlowNode[],
): IOwnerBoundaryNode[] {
  const groups = new Map<
    string,
    { owner: IOwner; name: string; components: (IRepoNode | IEntityNode)[] }
  >();
  for (const node of nodes) {
    if (node.hidden || (node.type !== 'repo' && node.type !== 'entity')) {
      continue;
    }
    const owner =
      node.type === 'repo' ? node.data.repo.owner : node.data.entity.owner;
    const id = node.id.endsWith('-node') ? 'shared-worker' : owner;
    const name =
      id === 'shared-worker'
        ? 'Shared workers'
        : owner === 'browser'
          ? 'Browser sessions'
          : ownerNames[owner];
    const group = groups.get(id);
    if (group) {
      group.components.push(node);
    } else {
      groups.set(id, { owner, name, components: [node] });
    }
  }
  return [...groups].map(([id, { owner, name, components }]) => {
    const left = Math.min(...components.map(node => node.position.x)) - 60;
    const top = Math.min(...components.map(node => node.position.y)) - 200;
    const right =
      Math.max(...components.map(node => node.position.x + node.width!)) + 60;
    const bottom =
      Math.max(...components.map(node => node.position.y + node.height!)) + 60;
    return {
      id: `owner-boundary:${id}`,
      type: 'owner-boundary',
      position: { x: left, y: top },
      width: right - left,
      height: bottom - top,
      zIndex: -1,
      selectable: false,
      focusable: false,
      draggable: false,
      connectable: false,
      style: {
        width: right - left,
        height: bottom - top,
        color: ownerColors[owner],
        borderColor: `color-mix(in oklab, ${ownerColors[owner]} 53%, transparent)`,
        background: `color-mix(in oklab, ${ownerColors[owner]} 3%, transparent)`,
        pointerEvents: 'none',
      },
      ariaLabel: `${name} boundary. ${components.length} ${components.length === 1 ? 'component' : 'components'}.`,
      data: { owner, name, componentCount: components.length },
    };
  });
}

export function Diagram({
  snapshot,
  owners,
  kinds,
  selectedId,
  onSelect,
  reducedMotion,
  scope = systemOverviewScope,
}: {
  snapshot: ISnapshot;
  owners: ReadonlySet<IOwner>;
  kinds: ReadonlySet<IConnectionKind>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  reducedMotion: boolean;
  scope?: IGraphScope;
}) {
  const { repos, tables, entities, connections } = scope;
  const { theme } = useTheme();
  const flow = useReactFlow<IFlowNode>();
  const allNodes = useMemo(
    () => makeOverviewNodes(snapshot, scope),
    [snapshot, scope],
  );
  const visibleIds = new Set<string>();
  for (const repo of repos) {
    if (!owners.has(repo.owner)) continue;
    visibleIds.add(repo.id);
    for (const table of tables.filter(item => item.repoId === repo.id)) {
      visibleIds.add(table.id);
    }
  }
  for (const entity of entities) {
    if (owners.has(entity.owner)) {
      visibleIds.add(entity.id);
    }
  }
  const componentNodes = allNodes.map(node => ({
    ...node,
    hidden: !visibleIds.has(node.id),
    selected: node.id === selectedId,
  }));
  const nodes = [...makeOwnerBoundaryNodes(componentNodes), ...componentNodes];
  const edges: Edge[] = connections
    .filter(
      connection =>
        kinds.has(connection.kind) &&
        visibleIds.has(connection.source) &&
        visibleIds.has(connection.destination),
    )
    .map(connection => {
      return {
        id: connection.id,
        source: connection.source,
        target: connection.destination,
        sourceHandle: connection.sourceColumn
          ? `out-${connection.sourceColumn}`
          : connection.kind === 'session-execute'
            ? 'execute-out'
            : 'out',
        targetHandle: connection.destinationColumn
          ? `in-${connection.destinationColumn}`
          : connection.kind === 'session-execute'
            ? 'execute-in'
            : 'in',
        type:
          connection.kind === 'session-execute'
            ? 'session-execute'
            : 'smoothstep',
        label: connection.label,
        ariaLabel: `${connectionNames[connection.kind]}: ${connection.label}`,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: connectionColors[connection.kind],
        },
        style: {
          stroke: connectionColors[connection.kind],
          strokeWidth: 1.8,
          opacity: 'var(--edge-opacity)',
          strokeDasharray:
            connection.kind === 'relationship'
              ? undefined
              : connection.kind === 'async'
                ? '8 5'
                : '4 3',
        },
        labelStyle: { fill: connectionColors[connection.kind], fontSize: 13 },
        labelBgStyle: { fill: 'var(--card)', fillOpacity: 0.94 },
        zIndex: 1,
        interactionWidth: 16,
        selectable: false,
      };
    });
  const fit = (ids?: readonly string[]) => {
    const included = nodes.filter(
      node => !node.hidden && (ids === undefined || ids.includes(node.id)),
    );
    if (included.length) {
      void flow.fitView({
        nodes: included,
        padding: 0.25,
        duration: reducedMotion ? 0 : 450,
        maxZoom: ids?.length === 1 ? 1.1 : 0.8,
      });
    }
  };
  return (
    <div className="diagram" style={{ background: 'var(--canvas-background)' }}>
      <div className="canvas-toolbar">
        <span className="canvas-label">
          <span className="live-dot" /> {tables.length} TABLES · ONE CANVAS
        </span>
        <div>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="outline" size="sm" onClick={() => fit()} />
              }
            >
              <Maximize aria-hidden="true" />
              Fit all
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Fit every visible component
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selectedId}
                  onClick={() => selectedId && fit([selectedId])}
                />
              }
            >
              <Crosshair aria-hidden="true" />
              Locate selection
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Center the selected component
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <ReactFlow<IFlowNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_event, node) => {
          onSelect(node.id);
          if (node.type === 'repo') {
            fit([node.id]);
          }
        }}
        onNodesChange={changes => {
          const selection = changes.find(
            change => change.type === 'select' && change.selected,
          );
          if (selection?.type === 'select') {
            onSelect(selection.id);
          } else if (
            changes.some(
              change =>
                change.type === 'select' &&
                change.id === selectedId &&
                !change.selected,
            )
          ) {
            onSelect(null);
          }
        }}
        onNodeDoubleClick={(_event, node) => fit([node.id])}
        fitView
        fitViewOptions={initialFitViewOptions}
        minZoom={0.04}
        maxZoom={1.8}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesReconnectable={false}
        deleteKeyCode={null}
        colorMode={theme}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: false }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="var(--canvas-dot)"
        />
        <Controls showInteractive={false} />
        <MiniMap<IFlowNode>
          pannable
          zoomable
          nodeColor={node => {
            if (node.type === 'owner-boundary') {
              return `color-mix(in oklab, ${ownerColors[node.data.owner]} 9%, transparent)`;
            }
            const table = tables.find(item => item.id === node.id);
            const owner =
              repos.find(item => item.id === (table?.repoId ?? node.id))
                ?.owner ?? entities.find(item => item.id === node.id)?.owner;
            return owner ? ownerColors[owner] : 'var(--muted-foreground)';
          }}
          maskColor="var(--minimap-mask)"
        />
      </ReactFlow>
      {visibleIds.size === 0 && (
        <div className="canvas-empty">
          No visible repos or components.
          <br />
          Change the owner filters.
        </div>
      )}
      <div className="canvas-hint">
        Scroll to zoom · drag to pan · click a repo to fit · select a table to
        inspect
      </div>
    </div>
  );
}
