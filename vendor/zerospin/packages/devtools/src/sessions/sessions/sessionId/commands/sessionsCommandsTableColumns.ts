import type { ColumnDef, VisibilityState } from "@tanstack/react-table";
import {
  sessionCommandDevtoolsShape,
  type ISessionCommandStatus,
} from "@zerospin/core/session/sessionCommandShape";

export type IDevtoolsSessionCommandsStatus = ISessionCommandStatus;

const COMMAND_COLUMN_IDS = [
  "id",
  ...Object.keys(sessionCommandDevtoolsShape)
    .filter((key) => key !== "id")
    .sort(),
] as const;

type ICommandColumnId = (typeof COMMAND_COLUMN_IDS)[number];

const COPY_CELL_COLUMN_IDS = new Set<ICommandColumnId>([
  "id",
  "actorId",
  "sessionId",
  "payload",
  "failure",
  "stagedCursor",
]);

const COLUMN_SIZES: Partial<
  Record<ICommandColumnId, { maxSize?: number; minSize?: number; size: number }>
> = {
  id: { size: 140, minSize: 80, maxSize: 200 },
  commandName: { size: 120, minSize: 80, maxSize: 160 },
  actorName: { size: 120, minSize: 80, maxSize: 160 },
  status: { size: 88, minSize: 72, maxSize: 120 },
  payload: { size: 200, minSize: 120, maxSize: 320 },
  failure: { size: 200, minSize: 120, maxSize: 320 },
  stagedAt: { size: 160, minSize: 120, maxSize: 200 },
  pushedAt: { size: 160, minSize: 120, maxSize: 200 },
  executedAt: { size: 160, minSize: 120, maxSize: 200 },
  actorId: { size: 140, minSize: 80, maxSize: 200 },
  sessionId: { size: 140, minSize: 80, maxSize: 200 },
};

const DISPLAY_TRUNCATE_CHARS = 80;

export function formatCommandCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
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

function statusTimestampColumnId(
  status: IDevtoolsSessionCommandsStatus,
): ICommandColumnId {
  switch (status) {
    case "staged":
      return "stagedAt";
    case "pushed":
      return "pushedAt";
    case "executed":
      return "executedAt";
    case "failed":
      return "pushedAt";
    default: {
      const exhaustive: never = status;
      throw new Error(`Unsupported command status: ${exhaustive}`);
    }
  }
}

export function defaultColumnVisibilityForStatus(
  status: IDevtoolsSessionCommandsStatus,
): VisibilityState {
  const timestampColumn = statusTimestampColumnId(status);
  const visibility: VisibilityState = {};

  for (const columnId of COMMAND_COLUMN_IDS) {
    visibility[columnId] = false;
  }

  visibility.id = true;
  visibility.commandName = true;
  visibility.actorName = true;
  visibility.status = true;
  visibility.payload = true;
  visibility[timestampColumn] = true;

  if (status === "failed") {
    visibility.failure = true;
  }

  return visibility;
}

export function makeSessionsCommandsTableColumns(): ColumnDef<
  Record<string, unknown>
>[] {
  return COMMAND_COLUMN_IDS.map((columnId) => {
    const sizing = COLUMN_SIZES[columnId];

    return {
      accessorKey: columnId,
      enableHiding: columnId !== "id",
      header: columnId,
      id: columnId,
      maxSize: sizing?.maxSize ?? 320,
      minSize: sizing?.minSize ?? 60,
      size: sizing?.size ?? 120,
    };
  });
}
