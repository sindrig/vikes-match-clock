import { isPlaybackOccurrenceId } from "../lib/playbackOccurrence";
import type {
  Asset,
  AssetFields,
  AssetOverlay,
  CurrentAsset,
  Player,
  PlayerCardAsset,
  Roster,
  TwoMinPenalty,
  ViewPort,
} from "../types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function isOptionalString(value: unknown): value is string | null | undefined {
  return value == null || typeof value === "string";
}
function isOptionalBoolean(
  value: unknown,
): value is boolean | null | undefined {
  return value == null || typeof value === "boolean";
}
function isOptionalNumberText(
  value: unknown,
): value is number | string | null | undefined {
  return value == null || typeof value === "string" || isFiniteNumber(value);
}

// All these collections are written as arrays. RTDB may deliver sparse arrays
// as objects; retain child keys as well as values for roster leaf commands.
function collectionEntries(data: unknown): [string, unknown][] {
  return data !== null && typeof data === "object"
    ? Object.entries(data).filter(
        ([key]) =>
          ![".", "#", "$", "[", "]", "/"].some((char) => key.includes(char)),
      )
    : [];
}

export function parseAssetOverlay(data: unknown): AssetOverlay | null {
  if (!isRecord(data)) return null;
  const { text, blink, effect, ...metadata } = data;
  if (
    typeof text !== "string" ||
    !isOptionalBoolean(blink) ||
    !isOptionalString(effect)
  )
    return null;
  return {
    ...metadata,
    text,
    ...(blink != null ? { blink } : {}),
    ...(effect != null ? { effect } : {}),
  };
}

function parseAssetFields(data: Record<string, unknown>): AssetFields | null {
  const {
    key,
    type,
    url,
    loop,
    background,
    name,
    number,
    role,
    overlay,
    teamName,
    fullName,
    isGoalCelebration,
    ...metadata
  } = data;
  // The discriminator is handled by parseAsset, not retained as metadata.
  void type;
  if (
    typeof key !== "string" ||
    !isOptionalString(url) ||
    !isOptionalString(background) ||
    !isOptionalString(name) ||
    !isOptionalString(role) ||
    !isOptionalString(teamName) ||
    !isOptionalString(fullName) ||
    !isOptionalBoolean(loop) ||
    !isOptionalBoolean(isGoalCelebration) ||
    !isOptionalNumberText(number)
  )
    return null;
  const parsedOverlay = parseAssetOverlay(overlay);
  if (overlay != null && !parsedOverlay) return null;
  return {
    ...metadata,
    key,
    ...(url != null ? { url } : {}),
    ...(loop != null ? { loop } : {}),
    ...(background != null ? { background } : {}),
    ...(name != null ? { name } : {}),
    ...(number != null ? { number } : {}),
    ...(role != null ? { role } : {}),
    ...(teamName != null ? { teamName } : {}),
    ...(fullName != null ? { fullName } : {}),
    ...(isGoalCelebration != null ? { isGoalCelebration } : {}),
    ...(overlay !== undefined ? { overlay: parsedOverlay } : {}),
  };
}

function parsePlayerCard(data: unknown): PlayerCardAsset | null {
  if (!isRecord(data)) return null;
  if (data.type !== "PLAYER" && data.type !== "NO_IMAGE_PLAYER") return null;
  const fields = parseAssetFields(data);
  return fields ? { ...fields, type: data.type } : null;
}

export function parseAsset(data: unknown): Asset | null {
  if (!isRecord(data)) return null;
  const fields = parseAssetFields(data);
  if (!fields) return null;
  switch (data.type) {
    case "IMAGE":
    case "VIDEO":
    case "URL":
    case "PLAYER":
    case "NO_IMAGE_PLAYER":
      return { ...fields, type: data.type };
    case "MOTM": {
      const { originalAssetType, ...rest } = fields;
      if (
        originalAssetType != null &&
        originalAssetType !== "PLAYER" &&
        originalAssetType !== "NO_IMAGE_PLAYER"
      )
        return null;
      return {
        ...rest,
        type: "MOTM",
        ...(originalAssetType != null ? { originalAssetType } : {}),
      };
    }
    case "SUB": {
      // SUB is exactly two leaf player cards. No arbitrary recursive asset
      // tree is rendered or traversed, even for deeply nested malformed input.
      const subIn = parsePlayerCard(data.subIn);
      const subOut = parsePlayerCard(data.subOut);
      return subIn && subOut ? { ...fields, type: "SUB", subIn, subOut } : null;
    }
    default:
      return null;
  }
}

export function parseAssetCollection(data: unknown): Asset[] {
  return collectionEntries(data).flatMap(([, entry]) => {
    const asset = parseAsset(entry);
    return asset ? [asset] : [];
  });
}

export function parseCurrentAsset(data: unknown): CurrentAsset | null {
  if (!isRecord(data)) return null;
  const asset = parseAsset(data.asset);
  if (!asset) return null;
  // Preserve #244's raw-presence distinction. A present null/undefined/bad ID
  // is never converted to legacy, and no read generates an ID.
  const hasId = Object.prototype.hasOwnProperty.call(data, "occurrenceId");
  if (hasId && !isPlaybackOccurrenceId(data.occurrenceId)) return null;
  if (data.time != null && (!isFiniteNumber(data.time) || data.time < 0))
    return null;
  return {
    ...data,
    asset,
    time: data.time ?? null,
    ...(isPlaybackOccurrenceId(data.occurrenceId)
      ? { occurrenceId: data.occurrenceId }
      : {}),
  };
}

export function parsePlayer(data: unknown): Player | null {
  if (!isRecord(data)) return null;
  const { name, id, number, role, show, ...metadata } = data;
  if (
    !isOptionalString(name) ||
    !isOptionalNumberText(id) ||
    !isOptionalNumberText(number) ||
    !isOptionalString(role) ||
    !isOptionalBoolean(show) ||
    [name, id, number, role, show].every((value) => value == null)
  )
    return null;
  return {
    ...metadata,
    name: name ?? "",
    ...(id != null ? { id } : {}),
    ...(number != null ? { number } : {}),
    ...(role != null ? { role } : {}),
    ...(show != null ? { show } : {}),
  };
}

const playerChildKeys = new WeakMap<Player[], string[]>();

function parsePlayers(data: unknown): Player[] {
  const players: Player[] = [];
  const keys: string[] = [];
  for (const [key, value] of collectionEntries(data)) {
    const player = parsePlayer(value);
    if (player) {
      players.push(player);
      keys.push(key);
    }
  }
  playerChildKeys.set(players, keys);
  return players;
}

export function playerChildKey(players: Player[], index: number): string {
  return playerChildKeys.get(players)?.[index] ?? String(index);
}

export function parseRoster(data: unknown): Roster {
  const raw = isRecord(data) ? data : {};
  return { ...raw, home: parsePlayers(raw.home), away: parsePlayers(raw.away) };
}

export function parseTwoMinPenalty(data: unknown): TwoMinPenalty | null {
  if (
    !isRecord(data) ||
    typeof data.key !== "string" ||
    !isFiniteNumber(data.atTimeElapsed) ||
    !isFiniteNumber(data.penaltyLength)
  )
    return null;
  return {
    ...data,
    key: data.key,
    atTimeElapsed: data.atTimeElapsed,
    penaltyLength: data.penaltyLength,
  };
}

export function parsePenaltyCollection(data: unknown): TwoMinPenalty[] {
  return collectionEntries(data).flatMap(([, entry]) => {
    const penalty = parseTwoMinPenalty(entry);
    return penalty ? [penalty] : [];
  });
}

function dimension(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return isFiniteNumber(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseViewPort(data: unknown, fallback: ViewPort): ViewPort {
  if (!isRecord(data)) return fallback;
  const { style, fontSize, ...metadata } = data;
  const rawStyle = isRecord(style) ? style : {};
  return {
    ...metadata,
    key: typeof data.key === "string" ? data.key : fallback.key,
    name: typeof data.name === "string" ? data.name : fallback.name,
    style: {
      ...rawStyle,
      width: dimension(rawStyle.width, fallback.style.width),
      height: dimension(rawStyle.height, fallback.style.height),
    },
    ...(typeof fontSize === "string" ? { fontSize } : {}),
  };
}
