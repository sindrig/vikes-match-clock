import type { AuditEventPayload } from "../firebaseDatabase";
import type { AuditStateArea } from "../types";
import { getOrCreateSessionId } from "./sessionId";

export type WriteFreshness =
  | "loading"
  | "ready"
  | "hidden"
  | "offline"
  | "resyncing";

interface SessionScope {
  readonly location: string;
  readonly authenticated: boolean;
  readonly uid?: string;
}

// An origin is an opaque, immutable epoch, not just a venue/UID comparison.
// Returning to the same venue or user never revives an earlier command.
export interface CommandOrigin extends SessionScope {
  readonly freshness: WriteFreshness;
  readonly scope: object;
}

export class MutationRejectedError extends Error {
  constructor() {
    super("Ekki tókst að vista: lota eða tenging hefur breyst. Reyndu aftur.");
    this.name = "MutationRejectedError";
  }
}

export class MutationSession {
  private snapshot: CommandOrigin;
  private listeners = new Set<() => void>();

  constructor(
    scope: SessionScope,
    private readonly currentUid?: () => string | undefined,
  ) {
    this.snapshot = Object.freeze({
      ...scope,
      freshness: "loading",
      scope: {},
    });
  }

  getSnapshot = (): CommandOrigin => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(snapshot: CommandOrigin): void {
    this.snapshot = Object.freeze(snapshot);
    this.listeners.forEach((listener) => listener());
  }

  // LocalState calls these synchronously, before scheduling React updates.
  // This also observes batched A -> B -> A and logout -> login transitions.
  setScope(scope: SessionScope): void {
    const current = this.snapshot;
    if (
      current.location === scope.location &&
      current.authenticated === scope.authenticated &&
      current.uid === scope.uid
    )
      return;
    this.publish({ ...scope, freshness: "loading", scope: {} });
  }

  setLocation(location: string): void {
    this.setScope({ ...this.snapshot, location });
  }

  setAuth(authenticated: boolean, uid?: string): void {
    this.setScope({ ...this.snapshot, authenticated, uid });
  }

  setFreshness(freshness: WriteFreshness): void {
    if (freshness === this.snapshot.freshness) return;
    this.publish({ ...this.snapshot, freshness });
  }

  invalidate(): void {
    this.publish({ ...this.snapshot, freshness: "loading", scope: {} });
  }

  isCurrent(origin: CommandOrigin): boolean {
    return (
      origin === this.snapshot &&
      origin.authenticated &&
      Boolean(origin.uid) &&
      (!this.currentUid || this.currentUid() === origin.uid) &&
      Boolean(origin.location) &&
      origin.freshness === "ready" &&
      (typeof document === "undefined" || !document.hidden)
    );
  }

  assertCurrent(origin: CommandOrigin): void {
    if (!this.isCurrent(origin)) throw new MutationRejectedError();
  }

  audit(
    origin: CommandOrigin,
    stateArea: AuditStateArea,
    action: string,
  ): AuditEventPayload {
    this.assertCurrent(origin);
    return {
      uid: origin.uid ?? "",
      sessionId: getOrCreateSessionId(),
      action,
      stateArea,
    };
  }
}
