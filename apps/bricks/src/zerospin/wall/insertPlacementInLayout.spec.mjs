import { strict as assert } from "node:assert";
import { test } from "node:test";
import { insertPlacementInLayout } from "./insertPlacementInLayout.ts";
import { measureWallFit } from "./wallSizing.ts";

const newNodeIds = { sectionId: "sec_new", stackId: "stk_new", rowId: "row_new" };

test("inserts a Placement without changing the current layout", () => {
  const layout = { sections: [] };
  const result = insertPlacementInLayout({
    layout,
    target: { kind: "wall", wallId: "wal_one", beforeSectionId: null },
    placementId: "plc_one_sm",
    newNodeIds,
  });
  assert.equal(result._tag, "Success");
  assert.deepEqual(result.success.sections[0].stacks[0].rows[0].placementIds, ["plc_one_sm"]);
  assert.deepEqual(layout, { sections: [] });
  assert.equal(measureWallFit({ layout: result.success, placementMinimumWidths: new Map([["plc_one_sm", 320]]), wallWidth: 360, brickGap: 1 })[0].fits, true);
  assert.equal(measureWallFit({ layout: result.success, placementMinimumWidths: new Map([["plc_one_sm", 400]]), wallWidth: 360, brickGap: 1 })[0].fits, false);
});

test("rejects a stale destination without changing the layout", () => {
  const layout = { sections: [] };
  const result = insertPlacementInLayout({
    layout,
    target: { kind: "row", wallId: "wal_one", rowId: "row_missing", beforePlacementId: null },
    placementId: "plc_one_sm",
    newNodeIds,
  });
  assert.equal(result._tag, "Failure");
  assert.deepEqual(layout, { sections: [] });
});
