import { onValue, ref } from "firebase/database";
import { useCallback, useEffect, useRef, useState } from "react";

import { database } from "../firebase";

export const INITIAL_DELIVERY_DEADLINE_MS = 15_000;

export type ReadStatus =
  | { phase: "idle" | "loading" | "ready" }
  | { phase: "error"; kind: "permission" | "unavailable"; message: string };

export function readFailure(area: string, error?: unknown): ReadStatus {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code).toLowerCase()
      : "";
  return code.includes("permission")
    ? {
        phase: "error",
        kind: "permission",
        message: `Aðgangur að ${area} mistókst. Athugaðu aðgang eða skráðu þig inn aftur og reyndu aftur.`,
      }
    : {
        phase: "error",
        kind: "unavailable",
        message: `Ekki tókst að sækja ${area}. Athugaðu tengingu og reyndu aftur.`,
      };
}

// Also handles synchronous delivery/cancellation during onValue registration:
// a cleanup added after retirement is immediately run, never leaked.
export class ReadAttempt {
  private open = true;
  private cleanups = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly current: () => boolean) {}

  isCurrent = (): boolean => this.open && this.current();

  add(cleanup: () => void): void {
    if (this.open) this.cleanups.add(cleanup);
    else cleanup();
  }

  deadline(fail: () => void): void {
    this.timer = setTimeout(() => {
      if (this.isCurrent()) fail();
    }, INITIAL_DELIVERY_DEADLINE_MS);
  }

  delivered(): void {
    clearTimeout(this.timer);
  }

  close = (): void => {
    this.open = false;
    this.delivered();
    this.cleanups.forEach((cleanup) => cleanup());
    this.cleanups.clear();
  };
}

interface ReadOptions<T> {
  scope: object;
  path: string;
  area: string;
  initial: T;
  parse: (raw: unknown) => T;
  isCurrent: () => boolean;
  enabled?: boolean;
  clearOnError?: boolean;
}

// One SDK owner for a single independently retryable read. Values only come
// from that owner's SDK callbacks. There is no second Firebase app/reader.
export function useSubscriptionRead<T>({
  scope,
  path,
  area,
  initial,
  parse,
  isCurrent,
  enabled = true,
  clearOnError = false,
}: ReadOptions<T>) {
  const [state, setState] = useState<{
    scope: object;
    value: T;
    status: ReadStatus;
  }>(() => ({
    scope,
    value: initial,
    status: { phase: enabled ? "loading" : "idle" },
  }));
  const [revision, setRevision] = useState(0);
  const attemptRef = useRef<ReadAttempt | null>(null);
  if (state.scope !== scope) {
    setState({
      scope,
      value: initial,
      status: { phase: enabled ? "loading" : "idle" },
    });
  }
  const retry = useCallback(() => {
    attemptRef.current?.close();
    setState((previous) => ({ ...previous, status: { phase: "loading" } }));
    setRevision((previous) => previous + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !isCurrent()) return;
    const attempt = new ReadAttempt(isCurrent);
    attemptRef.current = attempt;
    const fail = (error?: unknown) => {
      if (!attempt.isCurrent()) return;
      attempt.close();
      setState((previous) => ({
        scope,
        value: clearOnError ? initial : previous.value,
        status: readFailure(area, error),
      }));
    };
    attempt.deadline(() => fail());
    try {
      attempt.add(
        onValue(
          ref(database, path),
          (snapshot) => {
            if (!attempt.isCurrent()) return;
            const value = parse(snapshot.val());
            attempt.delivered();
            setState({ scope, value, status: { phase: "ready" } });
          },
          fail,
        ),
      );
    } catch (error) {
      fail(error);
    }
    return attempt.close;
  }, [
    scope,
    path,
    area,
    initial,
    parse,
    isCurrent,
    enabled,
    clearOnError,
    revision,
  ]);

  return { value: state.value, status: state.status, retry };
}
