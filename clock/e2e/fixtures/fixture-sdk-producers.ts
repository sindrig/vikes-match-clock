export type SdkSend = {
  method: "put" | "merge";
  path: string;
  received: boolean;
  delivered: boolean;
  status: string;
};

export async function beforeDeadline<T>(
  promise: Promise<T>,
  deadline: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (Date.now() >= deadline)
      throw new Error("Playback completion deadline expired.");
    const result = await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Playback completion deadline expired.")),
          deadline - Date.now(),
        );
      }),
    ]);
    if (Date.now() > deadline)
      throw new Error("Playback completion deadline expired.");
    return result;
  } finally {
    clearTimeout(timer);
  }
}

// Test-only instrumentation, including the callback continuations which may
// submit a transaction retry or its separate audit. A missing callback stays
// pending; local SDK echoes and deletion/closure never acknowledge a send.
export class PlaybackProducers {
  readonly sends: SdkSend[] = [];
  readonly failures: string[] = [];
  private readonly operations = new Set<Promise<unknown>>();
  private submitting = 0;
  private invocations = 0;
  private readonly audits = new Set<Promise<unknown>>();
  private readonly pendingSdk = new Set<SdkSend>();
  private readonly changes = new Set<() => void>();

  changed() {
    for (const notify of this.changes) notify();
  }

  track<T>(
    action: () => Promise<T>,
    audit = false,
    expectedRejection: (error: unknown) => boolean = () => false,
  ): Promise<T> {
    const pending = audit ? this.audits : this.operations;
    // Register before invoking the original. Synchronous exceptions and rejected
    // operations remain failures, while an acknowledged expected denial is known.
    let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
    let reject: (reason: unknown) => void = () => undefined;
    const promise = new Promise<T>((accept, decline) => {
      resolve = accept;
      reject = decline;
    });
    pending.add(promise);
    try {
      const original = action();
      void original.then(resolve, reject);
    } catch (error: unknown) {
      reject(error);
    }
    void promise.then(
      () => {
        pending.delete(promise);
        this.changed();
      },
      (error: unknown) => {
        if (!expectedRejection(error)) this.failures.push("Operation failed.");
        pending.delete(promise);
        this.changed();
      },
    );
    return promise;
  }

  invoke(action: () => void) {
    // These original APIs return void. Account for synchronous submission and
    // keep observing their actual audited-helper/SDK promises; do not invent a
    // resolved command promise in place of the original acknowledgement.
    this.submitting++;
    this.invocations++;
    try {
      action();
    } catch (error: unknown) {
      this.failures.push("Void command failed.");
      throw error;
    } finally {
      this.submitting--;
      this.changed();
    }
  }

  send(method: "put" | "merge", path: string) {
    const send: SdkSend = {
      method,
      path,
      received: false,
      delivered: false,
      status: "pending",
    };
    this.sends.push(send);
    this.pendingSdk.add(send);
    return send;
  }

  acknowledge(send: SdkSend, status: string, deliver: () => void) {
    send.received = true;
    send.status = status;
    try {
      deliver(); // May synchronously submit the next real SDK attempt.
      send.delivered = true;
    } finally {
      if (send.delivered) this.pendingSdk.delete(send);
      else this.failures.push("SDK callback failed.");
      this.changed();
    }
  }

  snapshot() {
    return {
      pendingCommands: this.operations.size + this.submitting,
      invocations: this.invocations,
      pendingAudits: this.audits.size,
      pendingSdk: this.pendingSdk.size,
      sends: this.sends.map((send) => ({ ...send })),
      failures: [...this.failures],
    };
  }

  async drain(deadline: number) {
    for (;;) {
      // Deliver promise continuations of observed SDK callbacks before declaring
      // idle; their original command may append an audit after transaction commit.
      await beforeDeadline(
        Promise.allSettled([...this.operations, ...this.audits]),
        deadline,
      );
      await Promise.resolve();
      if (!this.pendingSdk.size && !this.operations.size && !this.audits.size) {
        if (this.failures.length) throw new Error("Playback producer failed.");
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const notify = () => {
          clearTimeout(timer);
          this.changes.delete(notify);
          resolve();
        };
        const timer = setTimeout(
          () => {
            this.changes.delete(notify);
            reject(new Error("Playback producer completion deadline expired."));
          },
          Math.max(0, deadline - Date.now()),
        );
        this.changes.add(notify);
      });
    }
  }
}
