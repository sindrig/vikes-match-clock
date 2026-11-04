import {
  MutationRejectedError,
  MutationSession,
  type CommandOrigin,
} from "./mutationSession";

export type QueueDependencies = "all" | readonly string[];

// Tracks acknowledgements only. Queue/roster values still come exclusively
// from subscriptions, including the SDK's rollback before a rejected ack.
export class PendingQueueCreations {
  private pending = new Map<string, { location: string; id: string }>();
  private settlementListeners = new Set<() => void>();

  run(
    session: MutationSession,
    origin: CommandOrigin,
    dependencies: () => QueueDependencies,
    prepare: (waited: boolean) => Record<string, unknown>,
    submit: (diff: Record<string, unknown>) => Promise<void>,
  ): Promise<void> {
    const attempt = (waited: boolean): Promise<void> => {
      session.assertCurrent(origin);
      const ids = dependencies();
      const blockers = [...this.pending.values()].filter(
        (entry) =>
          entry.location === origin.location &&
          (ids === "all" || ids.includes(entry.id)),
      );
      if (blockers.length > 0) {
        return new Promise<void>((resolve, reject) => {
          const settled = () => {
            unsubscribe();
            this.settlementListeners.delete(settled);
            resolve();
          };
          const unsubscribe = session.subscribe(() => {
            if (!session.isCurrent(origin)) {
              unsubscribe();
              this.settlementListeners.delete(settled);
              reject(new MutationRejectedError());
            }
          });
          this.settlementListeners.add(settled);
        }).then(() => attempt(true));
      }

      const diff = prepare(waited);
      const creations = Object.entries(diff).flatMap(([path, value]) => {
        const parts = path.split("/");
        return parts.length === 2 && parts[0] === "queues" && value
          ? [parts[1]!]
          : [];
      });
      const keys = creations.map((id) => `${origin.location}/${id}`);
      // Install before invoking the SDK: update() may synchronously deliver
      // local onValue echoes and reentrant commands before returning a promise.
      creations.forEach((id, index) => {
        this.pending.set(keys[index]!, {
          location: origin.location,
          id,
        });
      });
      const finish = () => {
        keys.forEach((key) => this.pending.delete(key));
        if (keys.length > 0)
          [...this.settlementListeners].forEach((listener) => listener());
      };
      try {
        return submit(diff).finally(finish);
      } catch (error) {
        finish();
        throw error;
      }
    };
    try {
      return attempt(false);
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
