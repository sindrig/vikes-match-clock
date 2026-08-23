import { onCall, onRequest } from "firebase-functions/v2/https";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { ServerValue } from "firebase-admin/database";
import sharp from "sharp";
import type { OverlayOptions } from "sharp";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.database();
const bucket = admin.storage().bucket();

// -- Constants ----------------------------------------------------------------

const LOCATION_RE = /^[a-z0-9-]+$/i;
const JOB_ID_RE = /^[A-Za-z0-9_-]+$/;
const PLAYER_ID_RE = /^[A-Za-z0-9._-]+$/;
// Characters that must not appear in an output filename.
const UNSAFE_FILENAME_RE = /[^A-Za-z0-9._ -]/g;
// Render version embedded in output filenames so a future renderer change
// produces new deterministic files instead of stale-cached ones.
const RENDER_VERSION = "v1";
// A player whose name renders wider than this (in height units) is truncated.
const MAX_NAME_WIDTH_MULTIPLIER = 3;
// Per-target gap between portrait, number, and name (height units).
const GAP_MULTIPLIER = 0.45;
const NUMBER_FONT_MULTIPLIER = 0.55;
const NAME_FONT_MULTIPLIER = 0.28;

type GoalScorerPlayerStatus =
  | "preparing"
  | "ready"
  | "fallback"
  | "unavailable"
  | "failed";

interface PreparationPlayer {
  id: string;
  name: string;
  number?: number | string;
}

interface GeometryTarget {
  layerId: string;
  label: string;
  targetFolder: string;
  width: number;
  height: number;
}

interface OverlayFile {
  name: string;
  source: string;
}

interface PlayerResult {
  status: GoalScorerPlayerStatus;
  error: string | null;
  files?: Record<string, OverlayFile>;
}

// -- Validation helpers -------------------------------------------------------

function assertLocation(value: unknown): string {
  if (typeof value !== "string" || !LOCATION_RE.test(value)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "location must be a non-empty alphanumeric string",
    );
  }
  return value;
}

function assertJobId(value: unknown): string {
  if (typeof value !== "string" || !JOB_ID_RE.test(value)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "jobId must be a non-empty string of letters, digits, underscore or dash",
    );
  }
  return value;
}

function parsePlayers(value: unknown): PreparationPlayer[] {
  if (!Array.isArray(value)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "players must be an array",
    );
  }
  const players: PreparationPlayer[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id : "";
    const name = typeof raw.name === "string" ? raw.name : "";
    let number: number | string | undefined;
    if (typeof raw.number === "number" || typeof raw.number === "string") {
      number = raw.number;
    }
    players.push({ id, name, number });
  }
  return players;
}

export function sanitizeFilename(value: string): string {
  const cleaned = value.replace(UNSAFE_FILENAME_RE, "_").trim();
  return cleaned.length > 0 ? cleaned : "player";
}

// -- Path helpers -------------------------------------------------------------

function requestPath(location: string): string {
  return `states/${location}/perimeter/goalScorerPreparation`;
}

function statusPath(location: string): string {
  return `perimeter/${location}/goalScorerPreparation`;
}

function geometryPath(location: string): string {
  return `perimeter/${location}/overlayGeometry`;
}

function celebrationPath(location: string, playerId: string): string {
  return `${location}/players/${playerId}-fagn.png`;
}

function crestPath(location: string): string {
  return `${location}/crest.png`;
}

// Deterministic output storage paths. Files live under the daemon-validated
// `{location}/perimeter-overlays/{pairId}/{48|40}/` family (pairId = jobId) so
// the prepared media is directly playable by the existing overlay command. The
// filename is scoped by player, geometry revision, and render version. Emitted
// `gs://` sources always reference the function's active storage bucket so the
// returned URLs match where the objects were actually uploaded.
function outputPaths(location: string, jobId: string, playerId: string) {
  const folder = `${location}/perimeter-overlays/${jobId}`;
  return {
    folder,
    file: (targetFolder: string, revision: string) =>
      `${sanitizeFilename(playerId)}-${revision}-${RENDER_VERSION}-${targetFolder}.png`,
    source: (targetFolder: string, filename: string) =>
      `gs://${bucket.name}/${folder}/${targetFolder}/${filename}`,
  };
}

// -- Geometry -----------------------------------------------------------------

function parseGeometryTargets(data: unknown): GeometryTarget[] {
  if (!data || typeof data !== "object") return [];
  const raw = data as Record<string, unknown>;
  if (typeof raw.revision !== "string" || !Array.isArray(raw.targets)) {
    return [];
  }
  const targets: GeometryTarget[] = [];
  for (const entry of raw.targets) {
    if (!entry || typeof entry !== "object") continue;
    const target = entry as Record<string, unknown>;
    const layerId = typeof target.layerId === "string" ? target.layerId : "";
    const label = typeof target.label === "string" ? target.label : "";
    const targetFolder =
      typeof target.targetFolder === "string" ? target.targetFolder : "";
    const width =
      typeof target.width === "number" && Number.isInteger(target.width)
        ? target.width
        : 0;
    const height =
      typeof target.height === "number" && Number.isInteger(target.height)
        ? target.height
        : 0;
    if (!layerId || !targetFolder || width <= 0 || height <= 0) continue;
    targets.push({ layerId, label, targetFolder, width, height });
  }
  return targets;
}

// -- Rendering ----------------------------------------------------------------

// Rough width of bold sans-serif text at the given font size (px). Used to lay
// out the repeating band deterministically without a font-measurement pass.
export function estimateTextWidth(text: string, fontSize: number): number {
  const chars = Array.from(text);
  const width = chars.reduce((sum, ch) => {
    const wide = /[MW@%]/.test(ch)
      ? 1.0
      : ch === "i" || ch === "l"
        ? 0.35
        : 0.62;
    return sum + wide;
  }, 0);
  return Math.max(Math.round(width * fontSize), 1);
}

// Build a transparent PNG containing centered text.
export async function makeTextPng(
  text: string,
  width: number,
  height: number,
  fontSize: number,
): Promise<Buffer> {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"`,
    ` font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}"`,
    ` font-weight="bold" fill="#ffffff">${escapeXml(text)}</text>`,
    `</svg>`,
  ].join("");
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncateName(
  name: string,
  maxWidth: number,
  fontSize: number,
): string {
  const limit = Math.max(1, Math.floor(maxWidth / (fontSize * 0.62)));
  if (name.length <= limit) return name;
  return `${name.slice(0, Math.max(1, limit - 1))}…`;
}

// Render a native-size repeating band: portrait-or-crest, shirt number, name,
// and a gap repeated across the full target width. Returns the PNG buffer.
export async function renderBand(
  sourceBuffer: Buffer,
  {
    width,
    height,
    number,
    name,
  }: { width: number; height: number; number?: number | string; name: string },
): Promise<Buffer> {
  const portrait = await sharp(sourceBuffer)
    .resize({ height, fit: "contain", withoutEnlargement: false })
    .png()
    .toBuffer();
  const portraitMeta = await sharp(portrait).metadata();
  const portraitWidth = portraitMeta.width ?? 0;

  const gap = Math.max(1, Math.round(height * GAP_MULTIPLIER));
  const numberFontSize = Math.max(
    1,
    Math.round(height * NUMBER_FONT_MULTIPLIER),
  );
  const nameFontSize = Math.max(1, Math.round(height * NAME_FONT_MULTIPLIER));
  const numberText = String(number ?? "");
  const nameText = truncateName(
    name,
    height * MAX_NAME_WIDTH_MULTIPLIER,
    nameFontSize,
  );

  const numberWidth =
    numberText.length > 0 ? estimateTextWidth(numberText, numberFontSize) : 0;
  const nameWidth =
    nameText.length > 0 ? estimateTextWidth(nameText, nameFontSize) : 0;

  const unitWidth = Math.max(
    1,
    portraitWidth + gap + numberWidth + gap + nameWidth + gap,
  );
  const unitHeight = height;

  const overlays: OverlayOptions[] = [];
  let x = 0;
  if (portraitWidth > 0) {
    overlays.push({ input: portrait, left: x, top: 0 });
    x += portraitWidth + gap;
  }
  if (numberWidth > 0) {
    const numberPng = await makeTextPng(
      numberText,
      numberWidth,
      unitHeight,
      numberFontSize,
    );
    overlays.push({ input: numberPng, left: x, top: 0 });
    x += numberWidth + gap;
  }
  if (nameWidth > 0) {
    const namePng = await makeTextPng(
      nameText,
      nameWidth,
      unitHeight,
      nameFontSize,
    );
    overlays.push({ input: namePng, left: x, top: 0 });
    x += nameWidth + gap;
  }

  const unit = await sharp({
    create: {
      width: unitWidth,
      height: unitHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(overlays)
    .png()
    .toBuffer();

  // A degenerate band narrower than the repeating unit (never the case for the
  // real overlay targets) is produced by filling the band with the unit rather
  // than attempting an oversized composite, which sharp rejects.
  if (unitWidth >= width) {
    return sharp(unit).resize({ width, height, fit: "fill" }).png().toBuffer();
  }

  const repeats = Math.ceil(width / unitWidth);
  const tiled: OverlayOptions[] = [];
  for (let i = 0; i < repeats; i += 1) {
    tiled.push({ input: unit, left: i * unitWidth, top: 0 });
  }

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(tiled)
    .png()
    .toBuffer();
}

// -- Storage helpers ----------------------------------------------------------

// Try to download a Storage object; returns null when it does not exist or
// cannot be read as a buffer.
async function tryDownload(path: string): Promise<Buffer | null> {
  try {
    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [data] = await file.download();
    return data;
  } catch {
    return null;
  }
}

// -- Status publication -------------------------------------------------------

function buildPlayerResult(
  status: GoalScorerPlayerStatus,
  error: string | null,
  files?: Record<string, OverlayFile>,
): PlayerResult {
  return { status, error: error ? error.slice(0, 500) : null, files };
}

function summarize(
  players: Record<string, PlayerResult>,
  total: number,
): { phase: "preparing" | "ready" | "failed"; counts: Record<string, number> } {
  const counts = { ready: 0, fallback: 0, unavailable: 0, failed: 0 };
  for (const result of Object.values(players)) {
    if (result.status !== "preparing" && counts[result.status] !== undefined) {
      counts[result.status] += 1;
    }
  }
  return { phase: "ready", counts };
}

// Verify the caller may act on the location (a normal controller with the
// location in their `auth/{uid}` map, or an admin).
async function assertLocationAccess(callerUid: string, location: string) {
  const adminSnap = await db.ref(`admins/${callerUid}`).once("value");
  if (adminSnap.val() === true) return;
  const authSnap = await db.ref(`auth/${callerUid}/${location}`).once("value");
  if (authSnap.val() !== true) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Caller does not have access to this location",
    );
  }
}

// The job is "current" while the controller's stored request still names this
// jobId. A newer request (a different jobId) must win: the stale job stops
// publishing instead of overwriting the newer result.
async function isCurrentJob(location: string, jobId: string): Promise<boolean> {
  const snap = await db.ref(requestPath(location)).once("value");
  const request = snap.val();
  if (!request || typeof request !== "object") return false;
  return (request as Record<string, unknown>).jobId === jobId;
}

async function publishStatus(
  location: string,
  jobId: string,
  phase: "preparing" | "ready" | "failed",
  players: Record<string, PlayerResult>,
  total: number,
  error: string | null,
): Promise<boolean> {
  if (!(await isCurrentJob(location, jobId))) return false;
  const { counts } = summarize(players, total);
  await db.ref(statusPath(location)).set({
    jobId,
    phase,
    readyCount: counts.ready,
    fallbackCount: counts.fallback,
    unavailableCount: counts.unavailable,
    failedCount: counts.failed,
    total,
    updatedAt: ServerValue.TIMESTAMP,
    error,
    players,
  });
  return true;
}

// -- Callable -----------------------------------------------------------------

const handlePrepareGoalScorerMedia = onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Must be authenticated",
    );
  }
  const callerUid = request.auth.uid;
  const data = (request.data ?? {}) as Record<string, unknown>;
  const location = assertLocation(data.location);
  const jobId = assertJobId(data.jobId);
  const players = parsePlayers(data.players);

  await assertLocationAccess(callerUid, location);
  await assertCurrentJob(requestPath(location), jobId);

  // Read the daemon-published overlay target geometry. Without valid geometry
  // the renderer cannot produce correct media, so the job fails safely.
  const geometrySnap = await db.ref(geometryPath(location)).once("value");
  const targets = parseGeometryTargets(geometrySnap.val());
  if (targets.length === 0) {
    const error =
      "No valid overlay target geometry published; the perimeter daemon " +
      "must be online and configured before media preparation.";
    await publishStatus(location, jobId, "failed", {}, players.length, error);
    return { started: false, reason: "no-geometry" };
  }

  const playerResults: Record<string, PlayerResult> = {};
  const statusKey = (player: PreparationPlayer, index: number) =>
    player.id || `unavailable-${index}`;

  // Initial progress publication.
  for (let i = 0; i < players.length; i += 1) {
    const player = players[i];
    if (PLAYER_ID_RE.test(player.id)) {
      playerResults[statusKey(player, i)] = buildPlayerResult(
        "preparing",
        null,
      );
    } else {
      playerResults[statusKey(player, i)] = buildPlayerResult(
        "unavailable",
        "No valid player identifier",
      );
    }
  }
  if (
    !(await publishStatus(
      location,
      jobId,
      "preparing",
      playerResults,
      players.length,
      null,
    ))
  ) {
    return { started: false, reason: "superseded" };
  }

  for (let i = 0; i < players.length; i += 1) {
    const player = players[i];
    const key = statusKey(player, i);
    if (!PLAYER_ID_RE.test(player.id)) continue;

    try {
      const output = outputPaths(location, jobId, player.id);
      const files: Record<string, OverlayFile> = {};
      const revision = geometryRevision(geometrySnap.val());

      // Celebration image first; standard club crest as the fallback source.
      const celebration = await tryDownload(
        celebrationPath(location, player.id),
      );
      const crest = celebration ? null : await tryDownload(crestPath(location));
      const sourceBuffer = celebration ?? crest;
      const outcome: GoalScorerPlayerStatus = celebration
        ? "ready"
        : "fallback";

      if (!sourceBuffer) {
        playerResults[key] = buildPlayerResult(
          "failed",
          "Neither a celebration image nor the club crest is available",
        );
      } else {
        for (const target of targets) {
          const band = await renderBand(sourceBuffer, {
            width: target.width,
            height: target.height,
            number: player.number,
            name: player.name,
          });
          const filename = output.file(target.targetFolder, revision);
          const objectPath = `${output.folder}/${target.targetFolder}/${filename}`;
          await bucket.file(objectPath).save(band, {
            contentType: "image/png",
            metadata: { cacheControl: "public, max-age=31536000, immutable" },
          });
          files[target.layerId] = {
            name: filename,
            source: output.source(target.targetFolder, filename),
          };
        }
        playerResults[key] = buildPlayerResult(outcome, null, files);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      functions.logger.error("goal-scorer preparation failed for player", {
        location,
        jobId,
        playerId: player.id,
        error: message,
      });
      playerResults[key] = buildPlayerResult("failed", message);
    }

    if (
      !(await publishStatus(
        location,
        jobId,
        "preparing",
        playerResults,
        players.length,
        null,
      ))
    ) {
      return { started: false, reason: "superseded" };
    }
  }

  await publishStatus(
    location,
    jobId,
    "ready",
    playerResults,
    players.length,
    null,
  );
  return { started: true };
});

// `onCall` does not emit its invoker setting in the Firebase deployment
// manifest. Wrapping the callable protocol in `onRequest` makes Cloud Run
// public for CORS preflight while retaining callable auth and authorization.
export const prepareGoalScorerMedia = onRequest(
  { invoker: "public" },
  handlePrepareGoalScorerMedia,
);

function geometryRevision(geometryData: unknown): string {
  const raw = geometryData as Record<string, unknown> | null;
  return typeof raw?.revision === "string" && raw.revision
    ? raw.revision
    : "unknown";
}

async function assertCurrentJob(path: string, jobId: string) {
  const snap = await db.ref(path).once("value");
  const request = snap.val();
  const matches =
    request && typeof request === "object"
      ? (request as Record<string, unknown>).jobId === jobId
      : false;
  if (!matches) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Request no longer current; a newer job superseded it",
    );
  }
}
