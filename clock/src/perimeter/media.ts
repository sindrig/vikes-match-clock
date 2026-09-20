import type {
  PerimeterAdLayout,
  PerimeterAdLayoutFile,
  PerimeterDisplayConfig,
  PerimeterOverlay,
  PerimeterOverlayFile,
} from "../types";

export interface WebMediaIdentityError {
  columnId: string;
  target: string;
  message: string;
}

export function validateWebMediaIdentity(
  layout: PerimeterAdLayout | null,
): WebMediaIdentityError[] {
  if (!layout) return [];
  const errors: WebMediaIdentityError[] = [];
  for (const column of layout.columns) {
    for (const [target, file] of Object.entries(column.files)) {
      if (!file.generation) {
        errors.push({
          columnId: column.id,
          target,
          message: `Media ${file.name} has no immutable Storage generation.`,
        });
      }
    }
  }
  return errors;
}

export interface NormalizedBaseColumn {
  id: string;
  files: Record<string, PerimeterAdLayoutFile>;
}

export function normalizeBaseLayout(
  layout: PerimeterAdLayout,
  configuration: PerimeterDisplayConfig,
): NormalizedBaseColumn[] {
  return layout.columns.map((column) => {
    const files: Record<string, PerimeterAdLayoutFile> = {};
    for (const [legacyKey, file] of Object.entries(column.files)) {
      const logicalScreenId = configuration.compatibilityKeys.base[legacyKey];
      if (logicalScreenId) files[logicalScreenId] = file;
    }
    return { id: column.id, files };
  });
}

export async function backfillStorageGenerations(
  layout: PerimeterAdLayout,
  resolveGeneration: (source: string) => Promise<string | null>,
): Promise<PerimeterAdLayout> {
  const columns = [];
  for (const column of layout.columns) {
    const files: Record<string, PerimeterAdLayoutFile> = {};
    for (const [target, file] of Object.entries(column.files)) {
      const generation =
        file.generation ?? (await resolveGeneration(file.source));
      if (!generation) {
        throw new Error(
          `Storage generation unavailable for ${column.id}/${target} (${file.name}).`,
        );
      }
      files[target] = { ...file, generation };
    }
    columns.push({ ...column, files });
  }
  return { ...layout, columns };
}

// Overlay commands (goal celebrations and named media pairs) may have been
// written by writers that could not know the immutable Storage generation
// (legacy media pairs, goal-scorer preparation). Backfill it the same way the
// base layout does so playback can activate immutable identity at load time.
export async function backfillOverlayGenerations(
  overlay: PerimeterOverlay,
  resolveGeneration: (source: string) => Promise<string | null>,
): Promise<PerimeterOverlay> {
  const columns = [];
  for (const column of overlay.columns) {
    const files: Record<string, PerimeterOverlayFile> = {};
    for (const [target, file] of Object.entries(column.files)) {
      const generation =
        file.generation ?? (await resolveGeneration(file.source));
      if (!generation) {
        throw new Error(
          `Storage generation unavailable for overlay column (${file.name}).`,
        );
      }
      files[target] = { ...file, generation };
    }
    columns.push({ ...column, files });
  }
  return { ...overlay, columns };
}

export const importStorageGenerations = backfillStorageGenerations;
