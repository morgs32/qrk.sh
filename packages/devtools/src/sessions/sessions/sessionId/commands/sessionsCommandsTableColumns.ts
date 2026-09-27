import type { ColumnDef } from '@tanstack/react-table';

const COMMAND_COLUMN_IDS = [
  'id',
  'identity',
  'aggregateIndex',
  'executedIndex',
  'executedHash',
  'staging',
  'admission',
  'execution',
  'actorDelta',
  'nodeId',
  'nodeIndex',
  'contractVersion',
  'commandName',
  'payload',
  'pushIndex',
  'sessionId',
  'sessionIndex',
] as const;

type ICommandColumnId = (typeof COMMAND_COLUMN_IDS)[number];

const COPY_CELL_COLUMN_IDS: ReadonlySet<string> = new Set<ICommandColumnId>([
  'id',
  'identity',
  'sessionId',
  'payload',
  'identity',
]);

const COLUMN_SIZES: Partial<
  Record<ICommandColumnId, { maxSize?: number; minSize?: number; size: number }>
> = {
  id: { size: 140, minSize: 80, maxSize: 200 },
  commandName: { size: 120, minSize: 80, maxSize: 160 },
  payload: { size: 200, minSize: 120, maxSize: 320 },
  identity: { size: 140, minSize: 80, maxSize: 200 },
  sessionId: { size: 140, minSize: 80, maxSize: 200 },
};

const DISPLAY_TRUNCATE_CHARS = 80;

export function formatCommandCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function truncateCommandDisplayText(text: string): string {
  if (text.length <= DISPLAY_TRUNCATE_CHARS) {
    return text;
  }
  return `${text.slice(0, DISPLAY_TRUNCATE_CHARS)}…`;
}

export function isSessionsCommandsCopyCellColumn(columnId: string): boolean {
  return COPY_CELL_COLUMN_IDS.has(columnId);
}

export function makeSessionsCommandsTableColumns(
  node = false,
): ColumnDef<Record<string, unknown>>[] {
  return COMMAND_COLUMN_IDS.filter(columnId =>
    node
      ? !['sessionId', 'sessionIndex', 'pushIndex'].includes(columnId)
      : !['nodeId', 'nodeIndex'].includes(columnId),
  ).map(columnId => {
    const sizing = COLUMN_SIZES[columnId];

    return {
      accessorKey: columnId,
      enableHiding: columnId !== 'id',
      header: columnId,
      id: columnId,
      maxSize: sizing?.maxSize ?? 320,
      minSize: sizing?.minSize ?? 60,
      size: sizing?.size ?? 120,
    };
  });
}
