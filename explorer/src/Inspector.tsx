import { useState } from 'react';

import {
  ArrowUpRight,
  Columns3,
  FileCode2,
  List,
  Table2,
  X,
} from 'lucide-react';

import { systemOverviewScope } from './data/architecture';
import { ownerColors, ownerNames } from './diagram';
import type { IGraphScope, IRow, ISnapshot, ISource, ITable } from './types';
import { useMobile } from './useMobile';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function Source({ source }: { source: ISource }) {
  return (
    <Card className="source-reference">
      <CardContent>
        <Badge variant="secondary">
          <FileCode2 />
          Source snapshot
        </Badge>
        <code>
          {source.path}
          {source.line ? `:${source.line}` : ''}
        </code>
        {source.note && <p>{source.note}</p>}
        <p>Captured from framework declarations in this checkout.</p>
      </CardContent>
    </Card>
  );
}

function format(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function Rows({ rows, name }: { rows: readonly IRow[]; name: string }) {
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  if (rows.length === 0) {
    return (
      <div className="empty-rows">
        No example rows in <code>{name}</code> in this schema catalog.
      </div>
    );
  }
  return (
    <div className="rows-scroll" aria-label={`${name} example rows`}>
      <Table className="rows-table" aria-label={`${name} example rows`}>
        <TableHeader>
          <TableRow>
            {columns.map(column => (
              <TableHead key={column}>{column}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              {columns.map(column => {
                return (
                  <TableCell key={column} title={format(row[column])}>
                    <code>{format(row[column])}</code>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <details className="full-row-values">
        <summary>Full row values</summary>
        <pre>{JSON.stringify(rows, null, 2)}</pre>
      </details>
    </div>
  );
}

function TableDetails({
  table,
  snapshot,
}: {
  table: ITable;
  snapshot: ISnapshot;
}) {
  const [tab, setTab] = useState<'rows' | 'schema' | 'source'>('schema');
  const rows = snapshot.rows[table.id] ?? [];
  return (
    <Tabs
      value={tab}
      onValueChange={value => {
        if (value === 'schema' || value === 'rows' || value === 'source') {
          setTab(value);
        }
      }}
      className="inspector-details"
    >
      <TabsList className="inspector-tabs" aria-label="Table details">
        <TabsTrigger value="schema">
          <Columns3 />
          Schema
        </TabsTrigger>
        <TabsTrigger value="rows">
          <List />
          Rows · {rows.length}
        </TabsTrigger>
        <TabsTrigger value="source">
          <FileCode2 />
          Source
        </TabsTrigger>
      </TabsList>
      <TabsContent value="rows" className="inspector-tab-content">
        <p className="inspector-description">
          {table.purpose ?? table.description}
        </p>
        <h4>Example rows</h4>
        <Rows rows={rows} name={table.name} />
        <p className="inspector-footnote">
          This catalog captures schemas only. No database is connected.
        </p>
      </TabsContent>
      <TabsContent value="schema" className="inspector-tab-content">
        <p className="inspector-description">
          {table.columns.length} columns · current source declaration
        </p>
        <div className="schema-list">
          {table.columns.map(column => (
            <div className="schema-field" key={column.name}>
              <div>
                <strong>{column.name}</strong>
                <code>{column.type}</code>
              </div>
              <div className="schema-constraints">
                {column.primaryKey && (
                  <Badge variant="secondary">Primary key</Badge>
                )}
                {column.unique && <Badge variant="secondary">Unique</Badge>}
                <Badge variant="outline">
                  {column.nullable ? 'Nullable' : 'Required'}
                </Badge>
                {column.reference && (
                  <span className="reference-field">
                    <ArrowUpRight aria-hidden="true" />
                    {column.reference.table}.{column.reference.column}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        {table.indexes && table.indexes.length > 0 && (
          <>
            <h4>Indexes</h4>
            {table.indexes.map(index => (
              <div className="index-definition" key={index.name}>
                <code>{index.name}</code>
                <p>
                  {index.columns.join(' + ')}
                  {index.unique ? ' · unique' : ''}
                </p>
              </div>
            ))}
          </>
        )}
      </TabsContent>
      <TabsContent value="source" className="inspector-tab-content">
        <Source source={table.source} />
      </TabsContent>
    </Tabs>
  );
}

export function Inspector({
  selectedId,
  snapshot,
  onSelect,
  onClose,
  scope = systemOverviewScope,
}: {
  selectedId: string;
  snapshot: ISnapshot;
  onSelect: (id: string) => void;
  onClose: () => void;
  scope?: IGraphScope;
}) {
  const mobile = useMobile();
  const { tables, repos, entities: scopedEntities } = scope;
  const table = tables.find(item => item.id === selectedId);
  const repo = repos.find(item => item.id === (table?.repoId ?? selectedId));
  const entity = scopedEntities.find(item => item.id === selectedId);
  if (!table && !repo && !entity) return null;
  const title = table?.name ?? entity?.name ?? repo?.name ?? selectedId;
  const owner = repo?.owner ?? entity?.owner;
  const kind = table
    ? 'Table inspector'
    : repo
      ? 'Repo inspector'
      : 'Entity inspector';
  const content = (
    <div className="inspector-content">
      {owner && (
        <Badge
          variant="outline"
          className="owner-badge"
          style={{ color: ownerColors[owner] }}
        >
          {ownerNames[owner]}
        </Badge>
      )}
      {table ? (
        <TableDetails key={table.id} table={table} snapshot={snapshot} />
      ) : repo ? (
        <>
          <p className="inspector-description">{repo.description}</p>
          <h4>Owner identity</h4>
          <Card className="owner-identity">
            <CardContent>
              <pre>{repo.identity}</pre>
            </CardContent>
          </Card>
          <h4>Owned tables</h4>
          <div className="repo-table-list">
            {tables
              .filter(item => item.repoId === repo.id)
              .map(item => (
                <Button
                  key={item.id}
                  variant="ghost"
                  className="repo-table-link"
                  onClick={() => onSelect(item.id)}
                >
                  <span>
                    <Table2 aria-hidden="true" />
                    {item.name}
                  </span>
                  <span>
                    <Badge variant="secondary">
                      {snapshot.rows[item.id]?.length ?? 0} rows
                    </Badge>
                    <ArrowUpRight aria-hidden="true" />
                  </span>
                </Button>
              ))}
          </div>
          <Source source={repo.source} />
        </>
      ) : entity ? (
        <>
          <p className="inspector-description">{entity.description}</p>
          <Source source={entity.source} />
        </>
      ) : null}
    </div>
  );

  if (mobile) {
    return (
      <Sheet
        open
        onOpenChange={open => {
          if (!open) onClose();
        }}
      >
        <SheetContent
          side="right"
          className="inspector has-selection mobile-inspector"
        >
          <SheetHeader className="inspector-header">
            <span className="eyebrow">{kind}</span>
            <SheetTitle className="inspector-title">{title}</SheetTitle>
            <SheetDescription className="sr-only">
              Schema, example rows and source details for {title}.
            </SheetDescription>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
      className="inspector has-selection"
      aria-label="Selection inspector"
    >
      <header className="inspector-header">
        <div>
          <span className="eyebrow">{kind}</span>
          <h2 className="inspector-title">{title}</h2>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="icon-button"
          onClick={onClose}
          aria-label="Close inspector"
        >
          <X aria-hidden="true" />
        </Button>
      </header>
      {content}
    </aside>
  );
}
