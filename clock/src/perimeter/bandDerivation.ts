import assetTypes from "../controller/asset/AssetTypes";
import { parseCurrentAsset } from "../contexts/nestedParsers";
import type { AssetFields } from "../types";
import type { BandIdentity } from "./playerBandPresentation";

// A derived band request for the perimeter band channel. Player-like
// assets produce a single identity; SUB assets produce the two-player
// substitution request. `null` means no band (base ad deck shows through).
// MOTM requests carry `motm` so the presentation can lead with the sponsor
// loop before the player reveal (see MotmLead in playerBandPresentation).
export type PlayerBandRequest =
  | { kind: "player"; identity: BandIdentity; motm?: boolean }
  | { kind: "substitution"; off: BandIdentity; on: BandIdentity };

// Validates one identity: bounded non-empty name, digit-only shirt number
// (normalized to at most 4 digits), and a team name. Returns null when the
// side cannot be rendered.
function normalizeIdentity(asset: AssetFields): BandIdentity | null {
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
  const current = parseCurrentAsset(currentAsset);
  if (!current) return null;
  const { asset } = current;

  if (asset.type === assetTypes.SUB) {
    const off = normalizeIdentity(asset.subOut);
    const on = normalizeIdentity(asset.subIn);
    if (!off || !on) return null;
    return { kind: "substitution", off, on };
  }

  if (
    (asset.type !== assetTypes.PLAYER &&
      asset.type !== assetTypes.NO_IMAGE_PLAYER &&
      asset.type !== assetTypes.MOTM) ||
    asset.isGoalCelebration
  )
    return null;
  const identity = normalizeIdentity(asset);
  if (!identity) return null;
  return {
    kind: "player",
    identity,
    ...(asset.type === assetTypes.MOTM ? { motm: true as const } : {}),
  };
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
    // The MOTM flag is part of the key: the same player shown as a plain
    // card and as man of the match are different band requests, so the
    // MOTM sponsor lead-in always plays.
    return `${request.motm ? "motm" : "player"}\u0000${identityKey(request.identity)}`;
  }
  return `substitution\u0000${identityKey(request.off)}\u0000${identityKey(request.on)}`;
}
