import assetTypes from "../controller/asset/AssetTypes";
import type { BandIdentity } from "./playerBandPresentation";

// A derived band request for the perimeter band channel. Player-like
// assets produce a single identity; SUB assets produce the two-player
// substitution request. `null` means no band (base ad deck shows through).
export type PlayerBandRequest =
  | { kind: "player"; identity: BandIdentity }
  | { kind: "substitution"; off: BandIdentity; on: BandIdentity };

// The player-like asset types whose cards the band mirrors. NO_IMAGE_PLAYER
// cards have no image reference, so their identity omits imageRef and the
// loader resolves the team logo directly.
const PLAYER_ASSET_TYPES: readonly string[] = [
  assetTypes.PLAYER,
  assetTypes.NO_IMAGE_PLAYER,
  assetTypes.MOTM,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Validates one identity: bounded non-empty name, digit-only shirt number
// (normalized to at most 4 digits), and a team name. Returns null when the
// side cannot be rendered.
function normalizeIdentity(asset: unknown): BandIdentity | null {
  if (!isRecord(asset)) return null;
  // currentAsset is not deeply parsed by the controller subscription. Check
  // its fields here before using string methods or coercing shirt numbers.
  for (const field of ["name", "fullName", "teamName", "key"]) {
    if (asset[field] != null && typeof asset[field] !== "string") return null;
  }
  const rawName = asset.fullName ?? asset.name;
  if (typeof rawName !== "string") return null;
  const name = rawName.trim();
  if (!name || name.length > 80) return null;
  // Digit-only normalization: the value must be purely numeric after
  // trimming, at most 4 digits — a mixed value ("12a") is invalid.
  if (typeof asset.number !== "string" && typeof asset.number !== "number") {
    return null;
  }
  const number = String(asset.number).trim();
  if (!/^[0-9]{1,4}$/.test(number)) return null;
  if (typeof asset.teamName !== "string") return null;
  const teamName = asset.teamName.trim();
  if (!teamName) return null;
  const imageRef =
    asset.type === assetTypes.NO_IMAGE_PLAYER
      ? undefined
      : typeof asset.key === "string" && asset.key.trim().length > 0
        ? asset.key
        : undefined;
  return { name, number, teamName, imageRef };
}

function playerIdentity(asset: Record<string, unknown>): BandIdentity | null {
  if (
    typeof asset.type !== "string" ||
    !PLAYER_ASSET_TYPES.includes(asset.type)
  )
    return null;
  if (asset.isGoalCelebration) return null;
  return normalizeIdentity(asset);
}

// Derives the band request from the scoreboard's already-public controller
// state (states/{location}/controller, `currentAsset`). Read-only: no
// Firebase writes, commands, or audit events are involved.
//
// - PLAYER / NO_IMAGE_PLAYER / MOTM → single player identity.
// - Assets flagged `isGoalCelebration` are skipped: their perimeter twin is
//   the goal-scorer overlay itself.
// - SUB → substitution request from `subOut` (off) and `subIn` (on); both
//   sides must yield a valid identity, otherwise no band renders.
// - Any other type, or any invalid identity, yields no band.
export function deriveBandRequest(
  currentAsset: unknown,
): PlayerBandRequest | null {
  if (!isRecord(currentAsset)) return null;
  const asset = currentAsset.asset;
  if (!isRecord(asset)) return null;

  if (asset.type === assetTypes.SUB) {
    if (!asset.subIn || !asset.subOut) return null;
    const off = normalizeIdentity(asset.subOut);
    const on = normalizeIdentity(asset.subIn);
    if (!off || !on) return null;
    return { kind: "substitution", off, on };
  }

  const identity = playerIdentity(asset);
  if (!identity) return null;
  return { kind: "player", identity };
}

// Stable serialization of a band request so consumers (and the runtime) can
// detect an already-active request without re-preparing it.
export function bandRequestKey(
  request: PlayerBandRequest | null,
): string | null {
  if (!request) return null;
  const identityKey = (identity: BandIdentity): string =>
    [
      identity.name,
      identity.number,
      identity.teamName,
      identity.imageRef ?? "",
    ].join("\u0000");
  if (request.kind === "player") {
    return `player\u0000${identityKey(request.identity)}`;
  }
  return `substitution\u0000${identityKey(request.off)}\u0000${identityKey(request.on)}`;
}
