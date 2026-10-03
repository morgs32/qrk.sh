import { useMemo } from 'react';

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  NodeToolbar,
  Position,
  ReactFlow,
  useReactFlow,
  useViewport,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { connections, entities, repos, tables } from './data/architecture';
import type {
  IConnectionKind,
  IEntity,
  IOwner,
  IRepo,
  ISnapshot,
  ITable,
} from './types';

export const ownerNames: Record<IOwner, string> = {
  system: 'System',
  user: 'User aggregate',
  marketplace: 'Marketplace service',
  promotion: 'Promotion service',
  browser: 'Browser & sessions',
  provider: 'External provider',
};
export const ownerColors: Record<IOwner, string> = {
  system: '#d1b588',
  user: '#b5a4f5',
  marketplace: '#83e4bd',
  promotion: '#eca88f',
  browser: '#92c5f3',
  provider: '#eed47e',
};
export const connectionNames: Record<IConnectionKind, string> = {
  relationship: 'Declared reference',
  command: 'Command delivery',
  projection: 'History & projection',
  websocket: 'Websocket stream',
  async: 'Async producer work',
  access: 'Access & binding',
};
export const connectionColors: Record<IConnectionKind, string> = {
  relationship: '#a3b4bc',
  command: '#83e4bd',
  projection: '#b5a4f5',
  websocket: '#92c5f3',
  async: '#eed47e',
  access: '#788f96',
};

type IRepoData = { repo: IRepo; tableCount: number; active: boolean };
type ITableData = {
  table: ITable;
  owner: IOwner;
  rows: number;
  changed: boolean;
  active: boolean;
};
type IEntityData = { entity: IEntity; active: boolean };
type IRepoNode = Node<IRepoData, 'repo'>;
type ITableNode = Node<ITableData, 'table'>;
type IEntityNode = Node<IEntityData, 'entity'>;
type IFlowNode = IRepoNode | ITableNode | IEntityNode;

function RepoNode({ data }: NodeProps<IRepoNode>) {
  const { repo, tableCount, active } = data;
  const { zoom } = useViewport();
  return (
    <div
      className={`repo-heading ${active ? 'is-active' : ''}`}
      style={{ borderColor: ownerColors[repo.owner] }}
    >
      <NodeToolbar
        isVisible={zoom < 0.35}
        position={Position.Top}
        align="start"
        offset={5}
      >
        <div
          className="overview-repo-label"
          style={{ color: ownerColors[repo.owner] }}
          title={repo.name}
        >
          {repo.abbreviation.toUpperCase()}
          <span>{tableCount} tables</span>
        </div>
      </NodeToolbar>
      <Handle type="target" position={Position.Left} id="in" />
      <div className="repo-heading-top">
        <span className="repo-abbr" style={{ color: ownerColors[repo.owner] }}>
          {repo.abbreviation}
        </span>
        <span>{tableCount} tables</span>
        {repo.illustrative && <span className="demo-label">illustrative</span>}
      </div>
      <strong>{repo.name}</strong>
      <code>{repo.identity}</code>
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

function TableNode({ data }: NodeProps<ITableNode>) {
  const { table, owner, rows, changed, active } = data;
  return (
    <div
      className={`table-card ${changed ? 'is-changed' : ''} ${active ? 'is-active' : ''}`}
      style={{ borderTopColor: ownerColors[owner] }}
    >
      <Handle type="target" position={Position.Left} id="in" />
      <header>
        <span className="table-icon">▤</span>
        <strong>{table.name}</strong>
        <span className="row-count">{rows}</span>
      </header>
      {table.illustrative && (
        <div className="table-demo">Illustrative schema</div>
      )}
      <div className="table-columns">
        {table.columns.map(column => (
          <div className="column-row" key={column.name}>
            <Handle
              type="target"
              position={Position.Left}
              id={`in-${column.name}`}
              className="column-handle"
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
              className="column-handle"
            />
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

function EntityNode({ data }: NodeProps<IEntityNode>) {
  const { entity, active } = data;
  return (
    <div
      className={`entity-card ${active ? 'is-active' : ''}`}
      style={{ borderColor: ownerColors[entity.owner] }}
    >
      <Handle type="target" position={Position.Left} id="in" />
      <div className="entity-kind">
        {entity.kind}
        {entity.illustrative && (
          <span className="demo-label">illustrative</span>
        )}
      </div>
      <strong>{entity.name}</strong>
      <p>{entity.description}</p>
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

const nodeTypes = { repo: RepoNode, table: TableNode, entity: EntityNode };
const tableWidth = 294;
const groupWidth = tableWidth * 2 + 66;

/** Lay out every table once, using source-owned groups and stable lane slots. */
function makeNodes(snapshot: ISnapshot): IFlowNode[] {
  const focused = new Set(snapshot.step?.focus ?? []);
  const changed = new Set(snapshot.changedTableIds);
  const groups = repos.map(repo => {
    const owned = tables.filter(table => table.repoId === repo.id);
    const columnBottoms = [170, 170];
    const cards: ITableNode[] = owned.map(table => {
      const column = columnBottoms[0]! <= columnBottoms[1]! ? 0 : 1;
      const y = columnBottoms[column]!;
      const height =
        51 + table.columns.length * 24 + (table.illustrative ? 23 : 0);
      columnBottoms[column] = y + height + 24;
      return {
        id: table.id,
        type: 'table',
        parentId: repo.id,
        extent: 'parent',
        position: { x: 22 + column * (tableWidth + 22), y },
        width: tableWidth,
        height,
        ariaLabel: `${repo.name}, table ${table.name}`,
        data: {
          table,
          owner: repo.owner,
          rows: snapshot.rows[table.id]?.length ?? 0,
          changed: changed.has(table.id),
          active: focused.has(table.id),
        },
      };
    });
    return { repo, cards, height: Math.max(...columnBottoms) + 8 };
  });
  const rowHeights = new Map<number, number>();
  for (const group of groups) {
    rowHeights.set(
      group.repo.position.y,
      Math.max(rowHeights.get(group.repo.position.y) ?? 0, group.height),
    );
  }
  const rowPositions = new Map<number, number>();
  const entitySlots = new Map<string, IEntity[]>();
  for (const entity of entities) {
    const key = `${entity.position.x}/${Math.floor(entity.position.y)}`;
    entitySlots.set(key, [...(entitySlots.get(key) ?? []), entity]);
  }
  let rowTop = 0;
  for (const [row, height] of [...rowHeights].sort((a, b) => a[0] - b[0])) {
    const maxEntityCount = Math.max(
      0,
      ...[...entitySlots]
        .filter(([key]) => key.endsWith(`/${row}`))
        .map(([, entries]) => entries.length),
    );
    rowTop += Math.ceil(maxEntityCount / 2) * 210 + 100;
    rowPositions.set(row, rowTop);
    rowTop += height + 130;
  }
  const result: IFlowNode[] = [];
  for (const { repo, cards, height } of groups) {
    result.push(
      {
        id: repo.id,
        type: 'repo',
        position: {
          x: repo.position.x * (groupWidth + 140),
          y: rowPositions.get(repo.position.y) ?? 460,
        },
        style: {
          width: groupWidth,
          height,
          background: `${ownerColors[repo.owner]}06`,
          borderColor: `${ownerColors[repo.owner]}32`,
        },
        width: groupWidth,
        height,
        ariaLabel: `${repo.name}. ${repo.identity}`,
        data: { repo, tableCount: cards.length, active: focused.has(repo.id) },
      },
      ...cards,
    );
  }
  const entityNodes: IEntityNode[] = entities.map(entity => {
    // Entity coordinates use the same lane slots; entities sit above table groups.
    const lane = entity.position.x;
    const row = Math.floor(entity.position.y);
    const slot =
      entitySlots
        .get(`${lane}/${row}`)
        ?.findIndex(item => item.id === entity.id) ?? 0;
    const top = rowPositions.get(row);
    return {
      id: entity.id,
      type: 'entity',
      position: {
        x: lane * (groupWidth + 140) + (slot % 2) * 340,
        y: (top ?? 460) - (Math.floor(slot / 2) + 1) * 210 - 30,
      },
      width: 320,
      ariaLabel: `${entity.kind}: ${entity.name}`,
      data: { entity, active: focused.has(entity.id) },
    };
  });
  return [...result, ...entityNodes];
}

export function Diagram({
  snapshot,
  query,
  owners,
  kinds,
  selectedId,
  onSelect,
  reducedMotion,
}: {
  snapshot: ISnapshot;
  query: string;
  owners: ReadonlySet<IOwner>;
  kinds: ReadonlySet<IConnectionKind>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  reducedMotion: boolean;
}) {
  const flow = useReactFlow<IFlowNode>();
  const allNodes = useMemo(() => makeNodes(snapshot), [snapshot]);
  const visibleIds = new Set<string>();
  const search = query.trim().toLowerCase();
  for (const repo of repos) {
    if (!owners.has(repo.owner)) continue;
    const repoMatches = `${repo.name} ${repo.identity} ${repo.owner}`
      .toLowerCase()
      .includes(search);
    for (const table of tables.filter(item => item.repoId === repo.id)) {
      if (
        repoMatches ||
        `${table.name} ${table.columns.map(column => column.name).join(' ')}`
          .toLowerCase()
          .includes(search)
      ) {
        visibleIds.add(table.id);
        visibleIds.add(repo.id);
      }
    }
  }
  for (const entity of entities) {
    if (
      owners.has(entity.owner) &&
      `${entity.name} ${entity.description}`.toLowerCase().includes(search)
    ) {
      visibleIds.add(entity.id);
    }
  }
  const nodes = allNodes.map(node => ({
    ...node,
    hidden: !visibleIds.has(node.id),
    selected: node.id === selectedId,
  }));
  const activeConnections = new Set(snapshot.step?.connections ?? []);
  const edges: Edge[] = connections
    .filter(
      connection =>
        kinds.has(connection.kind) &&
        visibleIds.has(connection.source) &&
        visibleIds.has(connection.destination),
    )
    .map(connection => {
      const active = activeConnections.has(connection.id);
      return {
        id: connection.id,
        source: connection.source,
        target: connection.destination,
        sourceHandle: connection.sourceColumn
          ? `out-${connection.sourceColumn}`
          : 'out',
        targetHandle: connection.destinationColumn
          ? `in-${connection.destinationColumn}`
          : 'in',
        type: 'smoothstep',
        label: connection.label,
        animated: active && !reducedMotion,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: connectionColors[connection.kind],
        },
        style: {
          stroke: connectionColors[connection.kind],
          strokeWidth: active ? 4 : 1.8,
          opacity: active ? 1 : 0.48,
          strokeDasharray:
            connection.kind === 'relationship'
              ? undefined
              : connection.kind === 'async'
                ? '8 5'
                : '4 3',
        },
        labelStyle: { fill: connectionColors[connection.kind], fontSize: 13 },
        labelBgStyle: { fill: '#111c21', fillOpacity: 0.94 },
        zIndex: active ? 8 : 1,
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
    <div className="diagram">
      <div className="canvas-toolbar">
        <span className="canvas-label">
          <span className="live-dot" /> ALL TABLES · ONE CANVAS
        </span>
        <div>
          <button onClick={() => fit()} title="Fit every visible table">
            Fit all
          </button>
          <button
            disabled={!snapshot.step}
            onClick={() => fit(snapshot.step?.focus)}
            title="Fit the current walkthrough step"
          >
            Follow step
          </button>
          <button
            disabled={!selectedId}
            onClick={() => selectedId && fit([selectedId])}
          >
            Locate selection
          </button>
        </div>
      </div>
      <ReactFlow<IFlowNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_event, node) => onSelect(node.id)}
        onNodeDoubleClick={(_event, node) => fit([node.id])}
        onInit={() => {
          void flow.fitView({ padding: 0.12, maxZoom: 0.55 });
        }}
        minZoom={0.04}
        maxZoom={1.8}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesReconnectable={false}
        deleteKeyCode={null}
        colorMode="dark"
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: false }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="#304046"
        />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={node => {
            const table = tables.find(item => item.id === node.id);
            const owner =
              repos.find(item => item.id === (table?.repoId ?? node.id))
                ?.owner ?? entities.find(item => item.id === node.id)?.owner;
            return owner ? ownerColors[owner] : '#92a5ab';
          }}
          maskColor="#0b1318b3"
        />
      </ReactFlow>
      {visibleIds.size === 0 && (
        <div className="canvas-empty">
          No matching tables or components.
          <br />
          Change the search or owner filters.
        </div>
      )}
      <div className="canvas-hint">
        Scroll to zoom · drag to pan · double-click a card to inspect
      </div>
    </div>
  );
}
