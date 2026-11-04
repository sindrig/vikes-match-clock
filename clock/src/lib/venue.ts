// KSI identifiers are positive safe integers. Accept legacy decimal strings,
// but never coerce booleans, fractions, exponents, or partially numeric text.
export function parseVenueId(value: unknown): number | undefined {
  if (typeof value === "string") {
    if (!/^\d+$/.test(value.trim())) return undefined;
    value = Number(value.trim());
  }
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

export function parsePitchIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    const id = parseVenueId(entry);
    return id === undefined ? [] : [id];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

const regionAliases: Record<string, string> = {
  logicalScreenId: "screenId",
  source: "sourceRegion",
  destination: "destinationRegion",
};
const transformAliases: Record<string, string> = {
  flipX: "horizontalFlip",
  flipY: "verticalFlip",
  allowScaling: "scaling",
  allowClipping: "clipping",
  allowDestinationOverlap: "overlap",
};

function storedMetadataKey(key: string, stored: unknown, path: string): string {
  if (path === "perimeterDisplay/logicalScreens" && isRecord(stored)) {
    const entry = Object.entries(stored)
      .reverse()
      .find(
        ([childKey, value]) =>
          isRecord(value) &&
          (value.id ?? (Array.isArray(stored) ? "" : childKey)) === key,
      );
    if (entry) return entry[0];
  }
  const alias =
    path === "perimeterDisplay" && key === "compatibilityKeys"
      ? "compatibility"
      : /^perimeterDisplay\/regions\/\d+$/.test(path)
        ? regionAliases[key]
        : /^perimeterDisplay\/regions\/\d+\/transform$/.test(path)
          ? transformAliases[key]
          : undefined;
  if (
    isRecord(stored) &&
    stored[key] == null &&
    alias &&
    stored[alias] != null
  ) {
    return alias;
  }
  return key;
}

// Compare the validated fields, then patch only changed leaves. Fields that
// the parser/editor does not understand remain in Firebase, including nested
// mapping compatibility metadata. An omitted edited field is a deletion.
export function metadataUpdates(
  previous: unknown,
  next: unknown,
  path: string,
  stored: unknown = previous,
): Record<string, unknown> {
  return diffMetadata(previous, next, path, stored);
}

function diffMetadata(
  previous: unknown,
  next: unknown,
  path: string,
  stored: unknown,
): Record<string, unknown> {
  if (Object.is(previous, next)) return {};
  if (isRecord(previous) && isRecord(next)) {
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    const changes = Object.fromEntries(
      [...keys].flatMap((key) => {
        const storedKey = storedMetadataKey(key, stored, path);
        return Object.entries(
          diffMetadata(
            previous[key],
            next[key],
            `${path}/${storedKey}`,
            isRecord(stored) ? stored[storedKey] : undefined,
          ),
        );
      }),
    );
    // Defaulted branches may be absent from Firebase. Materialize them fully
    // on first edit so required sibling fields are present as well.
    if (!isRecord(stored) && Object.keys(changes).length > 0) {
      return { [path]: next };
    }
    return changes;
  }
  return { [path]: next ?? null };
}
