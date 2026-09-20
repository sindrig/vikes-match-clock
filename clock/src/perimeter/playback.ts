import type { PerimeterOverlayColumn } from "../types";
import { cueIndexAt } from "./timeline";

export type PerimeterMediaKind = "image" | "video";

export interface PerimeterMediaAsset {
  kind: PerimeterMediaKind;
  durationMs?: number;
}

export interface PairedPlaybackPlan {
  rate: number;
  loop: boolean;
  cutAtCueBoundary: boolean;
}

export function pairedPlaybackPlan(
  asset: PerimeterMediaAsset,
  cueDurationMs: number,
  supportsPlaybackRate: (rate: number) => boolean,
): PairedPlaybackPlan {
  if (asset.kind !== "video" || !asset.durationMs || asset.durationMs <= 0) {
    return { rate: 1, loop: false, cutAtCueBoundary: false };
  }
  const requiredRate = asset.durationMs / cueDurationMs;
  if (requiredRate > 1) {
    if (supportsPlaybackRate(requiredRate)) {
      return { rate: requiredRate, loop: false, cutAtCueBoundary: false };
    }
    return { rate: 1, loop: false, cutAtCueBoundary: true };
  }
  if (requiredRate < 1) {
    return { rate: 1, loop: true, cutAtCueBoundary: false };
  }
  return { rate: 1, loop: false, cutAtCueBoundary: false };
}

export class PairSlots<T> {
  private current: T | null = null;
  private next: T | null = null;

  get visible(): T | null {
    return this.current;
  }

  get preparedNext(): T | null {
    return this.next;
  }

  prepare(value: T): void {
    this.next = value;
  }

  activate(): T | null {
    const previous = this.current;
    this.current = this.next;
    this.next = previous;
    return this.current;
  }

  clearPrepared(): void {
    this.next = null;
  }

  clear(): void {
    this.current = null;
    this.next = null;
  }
}

export interface OverlayPlaybackState {
  commandId: string;
  columnIndex: number;
  visible: boolean;
}

export class OverlayPlayback {
  private columns: PerimeterOverlayColumn[] = [];
  private prepared: PerimeterOverlayColumn | null = null;
  private state: OverlayPlaybackState | null = null;
  private pendingCommandId = "";
  private origin = 0;

  set(commandId: string, columns: PerimeterOverlayColumn[], now: number): void {
    this.pendingCommandId = commandId;
    this.columns = columns;
    this.state = null;
    this.prepared = null;
    this.origin = now;
    if (columns.length === 0) return;
  }

  prepareFirstPair(column: PerimeterOverlayColumn): void {
    this.prepared = column;
  }

  activatePrepared(commandId: string, now: number): void {
    if (!this.prepared) return;
    this.pendingCommandId = commandId;
    this.state = {
      commandId: this.pendingCommandId,
      columnIndex: 0,
      visible: true,
    };
    this.origin = now;
    this.prepared = null;
  }

  clear(): void {
    this.columns = [];
    this.prepared = null;
    this.state = null;
  }

  visibleColumn(now: number): PerimeterOverlayColumn | null {
    if (!this.state || this.columns.length === 0) return null;
    let elapsed = Math.max(0, now - this.origin);
    let index = 0;
    for (
      let columnIndex = 0;
      columnIndex < this.columns.length - 1;
      columnIndex += 1
    ) {
      const duration = this.columns[columnIndex]?.durationMs ?? 0;
      if (elapsed < duration) {
        index = columnIndex;
        break;
      }
      elapsed -= duration;
      index = columnIndex + 1;
    }
    this.state.columnIndex = index;
    return this.columns[index] ?? null;
  }

  get currentState(): OverlayPlaybackState | null {
    return this.state;
  }
}

export function baseCueIndex(
  now: number,
  origin: number,
  cueCount: number,
  cueDurationMs = 20_000,
): number | null {
  return cueIndexAt(now, origin, cueDurationMs, cueCount);
}

export class PerimeterPower {
  private powered = false;
  private origin = 0;

  constructor(private readonly now: () => number = () => performance.now()) {}

  setPowered(value: boolean): boolean {
    const changed = this.powered !== value;
    if (!this.powered && value) this.origin = this.now();
    this.powered = value;
    return changed;
  }

  get isPowered(): boolean {
    return this.powered;
  }

  get cueOrigin(): number {
    return this.origin;
  }
}
