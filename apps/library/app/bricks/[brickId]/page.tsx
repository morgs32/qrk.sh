"use client";

import { useState } from "react";
import { notFound, useParams } from "next/navigation";
import { makeModelIdSchema } from "@zerospin/core/models/make/makeModelIdSchema";
import { Result, Schema } from "effect";
import { useLiveQuery } from "@zerospin/react";

import { libraryModule } from "../../../libraryModule/libraryModule";
import { modulesHash } from "../../../lib/modulesHash";
import { useWallViewport } from "../../../lib/WallViewportProvider";
import { useUpdateBrick } from "../../../lib/useUpdateBrick";
import { useLibrarySession } from "../../../session/createLibraryStandaloneSession";

export default function BrickDetail() {
  const params = useParams();
  const decoded = Schema.decodeUnknownResult(
    Schema.Struct({ brickId: makeModelIdSchema(libraryModule.models.brick) }),
  )(params);
  if (Result.isFailure(decoded)) notFound();
  return <BrickDetailContent key={decoded.success.brickId} brickId={decoded.success.brickId} />;
}

function BrickDetailContent(props: { brickId: `brk_${string}` }) {
  const { brickId } = props;
  const { activeBreakpoint } = useWallViewport();
  const breakpoint = activeBreakpoint ?? "sm";
  const session = useLibrarySession();
  const { updateBrick } = useUpdateBrick({ brickId });
  const [editorEpoch, setEditorEpoch] = useState(0);
  const brickQuery = useLiveQuery({
    session,
    key: brickId,
    query: (db, queriedBrickId) =>
      db.query.brick.findFirst({ where: { id: { eq: queriedBrickId } } }),
  });
  const placementQuery = useLiveQuery({
    session,
    key: { brickId, breakpoint },
    query: (db, { brickId: queriedBrickId, breakpoint: queriedBreakpoint }) =>
      db.query.placement.findFirst({
        where: {
          brickId: { eq: queriedBrickId },
          breakpoint: { eq: queriedBreakpoint },
        },
      }),
  });
  const brickRow = brickQuery.data;
  if (brickRow === undefined || placementQuery.data === undefined) notFound();
  const Form = modulesHash[brickRow.moduleId].Form;
  if (Form === undefined) return null;
  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-6">
        <Form
          session={session}
          brickId={brickId}
          key={editorEpoch}
          state={brickRow.state}
          onSave={updateBrick}
          onCancel={() => {
            setEditorEpoch((epoch) => epoch + 1);
          }}
        />
      </div>
    </>
  );
}
