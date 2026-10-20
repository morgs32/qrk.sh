import { Dialog } from "@base-ui/react/dialog";
import { useId, useState, type ComponentProps } from "react";
import { Button } from "../../components/ui/button";
import type { WallTree } from "./WallTree";

/** Keyboard movement uses the same stable anchors as pointer insertion. */
export function WallMoveDialog(props: {
  wallId: string;
  sections: ComponentProps<typeof WallTree>["sections"];
  moving: { kind: "placement" | "stack"; id: string };
  stackLimit: number;
  onMovePlacement: ComponentProps<typeof WallTree>["onMovePlacement"];
  onMoveStack: ComponentProps<typeof WallTree>["onMoveStack"];
  onClose: () => void;
  finalFocus: () => HTMLElement | null;
}) {
  const {
    wallId,
    sections,
    moving,
    stackLimit,
    onMovePlacement,
    onMoveStack,
    onClose,
    finalFocus,
  } = props;
  const formId = useId();
  const sourceSection = sections.find((section) =>
    section.stacks.some((stack) =>
      moving.kind === "stack"
        ? stack.id === moving.id
        : stack.rows.some((row) => row.placements.some((placement) => placement.id === moving.id)),
    ),
  );
  const sourceStack = sourceSection?.stacks.find((stack) =>
    moving.kind === "stack"
      ? stack.id === moving.id
      : stack.rows.some((row) => row.placements.some((placement) => placement.id === moving.id)),
  );
  const [sectionId, setSectionId] = useState(sourceSection?.id ?? sections[0]?.id ?? "");
  const [stackId, setStackId] = useState(sourceStack?.id ?? "");
  const [rowId, setRowId] = useState("");
  const [beforeId, setBeforeId] = useState("");
  const [newSection, setNewSection] = useState(false);
  const section = sections.find((entry) => entry.id === sectionId);
  const stack = section?.stacks.find((entry) => entry.id === stackId);
  const row = stack?.rows.find((entry) => entry.id === rowId);
  const atCapacity = section !== undefined && section.stacks.length >= stackLimit;
  const blocked =
    sourceStack === undefined ||
    (!newSection &&
      (section === undefined ||
        (moving.kind === "stack"
          ? sourceSection?.id !== sectionId && atCapacity
          : stackId === ""
            ? atCapacity
            : stack === undefined || (rowId !== "" && row === undefined))));
  const positions =
    moving.kind === "stack"
      ? (section?.stacks
          .filter((entry) => entry.id !== moving.id)
          .map((entry) => ({ id: entry.id, label: entry.name })) ?? [])
      : row
        ? row.placements
            .filter((entry) => entry.id !== moving.id)
            .map((entry) => ({ id: entry.id, label: `Brick ${entry.brickId}` }))
        : (stack?.rows.map((entry, index) => ({ id: entry.id, label: `Row ${index + 1}` })) ?? []);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[100] bg-black/30" />
        <Dialog.Popup
          finalFocus={finalFocus}
          className="fixed left-1/2 top-1/2 z-[101] grid max-h-[90dvh] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-auto border bg-background p-6 text-foreground shadow-xl outline-none"
        >
          <div className="grid gap-1">
            <Dialog.Title className="text-lg font-medium">
              Move {moving.kind === "stack" ? (sourceStack?.name ?? "Stack") : "Brick"}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              Choose a destination in this Wall. Other breakpoints keep their arrangement.
            </Dialog.Description>
          </div>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (blocked) return;
              if (moving.kind === "stack") {
                const accepted = onMoveStack(
                  moving.id,
                  newSection
                    ? { wallId, kind: "wall", beforeSectionId: sectionId || null }
                    : { wallId, kind: "section", sectionId, beforeStackId: beforeId || null },
                );
                if (accepted !== false) onClose();
                return;
              }
              const accepted = onMovePlacement(
                moving.id,
                stackId === ""
                  ? { wallId, kind: "section", sectionId }
                  : rowId === ""
                    ? { wallId, kind: "stack", stackId, beforeRowId: beforeId || null }
                    : { wallId, kind: "row", rowId, beforePlacementId: beforeId || null },
              );
              if (accepted !== false) onClose();
            }}
          >
            {moving.kind === "stack" && (
              <label className="grid gap-1 text-sm" htmlFor={`${formId}-destination`}>
                Destination
                <select
                  id={`${formId}-destination`}
                  className="h-9 border bg-background px-2"
                  value={newSection ? "new" : "existing"}
                  onChange={(event) => {
                    setNewSection(event.target.value === "new");
                    setSectionId(sourceSection?.id ?? "");
                    setBeforeId("");
                  }}
                >
                  <option value="existing">Existing Section</option>
                  <option value="new">New Section</option>
                </select>
              </label>
            )}
            <label className="grid gap-1 text-sm" htmlFor={`${formId}-section`}>
              {newSection ? "New Section position" : "Section"}
              <select
                id={`${formId}-section`}
                className="h-9 border bg-background px-2"
                value={sectionId}
                onChange={(event) => {
                  setSectionId(event.target.value);
                  setStackId("");
                  setRowId("");
                  setBeforeId("");
                }}
              >
                {sections.map((entry, index) => (
                  <option
                    key={entry.id}
                    value={entry.id}
                    disabled={
                      !newSection &&
                      moving.kind === "stack" &&
                      sourceSection?.id !== entry.id &&
                      entry.stacks.length >= stackLimit
                    }
                  >
                    {newSection ? "Before " : ""}Section {index + 1}
                  </option>
                ))}
                {newSection && <option value="">At end</option>}
              </select>
            </label>
            {moving.kind === "placement" && (
              <>
                <label className="grid gap-1 text-sm" htmlFor={`${formId}-stack`}>
                  Stack
                  <select
                    id={`${formId}-stack`}
                    className="h-9 border bg-background px-2"
                    value={stackId}
                    onChange={(event) => {
                      setStackId(event.target.value);
                      setRowId("");
                      setBeforeId("");
                    }}
                  >
                    {section?.stacks.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                    <option value="" disabled={atCapacity}>
                      New Stack
                    </option>
                  </select>
                </label>
                {stack && (
                  <label className="grid gap-1 text-sm" htmlFor={`${formId}-row`}>
                    Row
                    <select
                      id={`${formId}-row`}
                      className="h-9 border bg-background px-2"
                      value={rowId}
                      onChange={(event) => {
                        setRowId(event.target.value);
                        setBeforeId("");
                      }}
                    >
                      {stack.rows.map((entry, index) => (
                        <option key={entry.id} value={entry.id}>
                          Row {index + 1}
                        </option>
                      ))}
                      <option value="">New Row</option>
                    </select>
                  </label>
                )}
              </>
            )}
            {!newSection && (moving.kind === "stack" || stack !== undefined) && (
              <label className="grid gap-1 text-sm" htmlFor={`${formId}-position`}>
                Position
                <select
                  id={`${formId}-position`}
                  className="h-9 border bg-background px-2"
                  value={beforeId}
                  onChange={(event) => setBeforeId(event.target.value)}
                >
                  {positions.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      Before {entry.label}
                    </option>
                  ))}
                  <option value="">At end</option>
                </select>
              </label>
            )}
            {sourceStack === undefined && (
              <p role="status" className="text-sm text-muted-foreground">
                This source is no longer available.
              </p>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <Dialog.Close render={<Button variant="outline" />}>Cancel</Dialog.Close>
              <Button type="submit" disabled={blocked}>
                Move
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
