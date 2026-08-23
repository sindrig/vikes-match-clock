import assert from "node:assert/strict";
import test from "node:test";

import { buildOverlayGeometry } from "../geometry.js";

const CONFIG = {
  overlayLayerIds: ["2", "4"],
  overlayLayerTargetFolders: { 2: "48", 4: "40" },
  clipCanvases: { 2: "4608x192", 4: "3840x192" },
};

test("builds validated targets from the daemon configuration", () => {
  const geometry = buildOverlayGeometry(CONFIG);
  assert.equal(geometry.targets.length, 2);
  assert.deepEqual(geometry.targets[0], {
    layerId: "2",
    label: "48 skjáir",
    targetFolder: "48",
    width: 4608,
    height: 192,
  });
  assert.deepEqual(geometry.targets[1], {
    layerId: "4",
    label: "40 skjáir",
    targetFolder: "40",
    width: 3840,
    height: 192,
  });
});

test("revision is stable for identical configuration", () => {
  const a = buildOverlayGeometry(CONFIG);
  const b = buildOverlayGeometry(CONFIG);
  assert.equal(a.revision, b.revision);
});

test("revision changes when clip canvases change", () => {
  const a = buildOverlayGeometry(CONFIG);
  const b = buildOverlayGeometry({
    ...CONFIG,
    clipCanvases: { 2: "4608x192", 4: "4096x192" },
  });
  assert.notEqual(a.revision, b.revision);
});

test("revision changes when layer IDs change", () => {
  const a = buildOverlayGeometry(CONFIG);
  const b = buildOverlayGeometry({
    ...CONFIG,
    overlayLayerIds: ["2", "4", "6"],
  });
  assert.notEqual(a.revision, b.revision);
});

test("omits a layer whose canvas is malformed", () => {
  const geometry = buildOverlayGeometry({
    ...CONFIG,
    clipCanvases: { 2: "not-a-canvas", 4: "3840x192" },
  });
  assert.equal(geometry.targets.length, 1);
  assert.equal(geometry.targets[0].layerId, "4");
});

test("omits a layer with no target folder", () => {
  const geometry = buildOverlayGeometry({
    ...CONFIG,
    overlayLayerTargetFolders: { 2: "48" },
  });
  assert.equal(geometry.targets.length, 1);
  assert.equal(geometry.targets[0].layerId, "2");
});

test("omits a layer with no canvas", () => {
  const geometry = buildOverlayGeometry({
    ...CONFIG,
    clipCanvases: { 4: "3840x192" },
  });
  assert.equal(geometry.targets.length, 1);
  assert.equal(geometry.targets[0].layerId, "4");
});

test("returns empty targets for no overlay layers", () => {
  const geometry = buildOverlayGeometry({ ...CONFIG, overlayLayerIds: [] });
  assert.deepEqual(geometry.targets, []);
  assert.ok(geometry.revision.length > 0);
});

test("returns empty targets for a missing configuration", () => {
  const geometry = buildOverlayGeometry(undefined);
  assert.deepEqual(geometry.targets, []);
  assert.ok(geometry.revision.length > 0);
});
