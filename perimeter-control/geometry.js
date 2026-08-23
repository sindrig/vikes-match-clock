/* Perimeter overlay target geometry.
 *
 * Derives validated overlay target geometry from the daemon's configured
 * overlay layer IDs, target folders, and clip canvases. The daemon publishes
 * this to `perimeter/{location}/overlayGeometry` (read-only for clients) so a
 * renderer can produce media that matches the configured Resolume layout
 * instead of duplicating frontend dimensions.
 */

import { createHash } from "node:crypto";

const VALID_CANVAS_RE = /^(\d+)x(\d+)$/;

// Human-readable label for an overlay target, derived from the configured
// target folder ("48" -> "48 skjáir", "40" -> "40 skjáir").
function targetLabel(targetFolder, layerId) {
  if (targetFolder === "48") return "48 skjáir";
  if (targetFolder === "40") return "40 skjáir";
  return `Overlay ${layerId}`;
}

// Build validated overlay target geometry from the daemon configuration. Only
// layers with a fully valid native canvas AND a configured target folder are
// included; a layer whose canvas cannot be parsed or that has no target folder
// is omitted so the preparation function fails safely instead of guessing
// sizes. The revision is a hash of the configured layer IDs, target folders,
// and clip canvases, so any Resolume layout change produces a new revision.
export function buildOverlayGeometry(config) {
  const layerIds = Array.isArray(config?.overlayLayerIds)
    ? config.overlayLayerIds
    : [];
  const targetFolders = config?.overlayLayerTargetFolders ?? {};
  const canvases = config?.clipCanvases ?? {};

  const revision = createHash("sha256")
    .update(
      JSON.stringify({
        layerIds,
        targetFolders,
        canvases,
      }),
    )
    .digest("hex")
    .slice(0, 16);

  const targets = [];
  for (const layerId of layerIds) {
    const canvas = canvases[String(layerId)];
    const match = VALID_CANVAS_RE.exec(String(canvas ?? ""));
    if (!match) continue;
    const targetFolder = targetFolders[String(layerId)];
    if (!targetFolder) continue;
    targets.push({
      layerId,
      label: targetLabel(targetFolder, layerId),
      targetFolder,
      width: Number(match[1]),
      height: Number(match[2]),
    });
  }

  return { revision, targets };
}
