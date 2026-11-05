import { createHash, randomUUID } from "node:crypto";

export const EMULATOR_PROJECT = "vikes-match-clock-test";
const databaseOrigin = "http://127.0.0.1:9000";
const authOrigin = "http://127.0.0.1:9099";
const storageOrigin = "http://127.0.0.1:9199";
const bucket = `${EMULATOR_PROJECT}.appspot.com`;
const keyPattern = /^[A-Za-z0-9_-]+$/;

export function requireEmulatorSelection() {
  if (process.env.VITE_USE_EMULATOR !== "true") {
    throw new Error("Local fixtures require VITE_USE_EMULATOR=true.");
  }
}

export function initializeExecutionToken() {
  const token = process.env.VIKES_E2E_EXECUTION ?? randomUUID();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(token)) {
    throw new Error("Invalid local fixture execution token.");
  }
  process.env.VIKES_E2E_EXECUTION = token;
  return token;
}

export function fixtureIdentity(execution: string, worker: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(execution) || !/^\d{1,8}$/.test(worker)) {
    throw new Error("Invalid local fixture execution or worker identity.");
  }
  const run = createHash("sha256").update(execution).digest("hex").slice(0, 10);
  // A restarted worker gets a fresh incarnation even if a launcher reuses its index.
  return `${run}-${worker}-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error("Invalid local fixture response shape.");
  }
  return value;
}

export function assertBrowserEmulatorTarget(value: unknown) {
  const target = record(value);
  const auth = record(target.auth);
  if (
    target.projectId !== EMULATOR_PROJECT ||
    target.databaseURL !== `${databaseOrigin}?ns=${EMULATOR_PROJECT}` ||
    target.storageBucket !== bucket ||
    auth.host !== "127.0.0.1" ||
    auth.port !== 9099 ||
    auth.protocol !== "http"
  ) {
    throw new Error("Served application has not selected the local emulators.");
  }
}

export function assertLocalFixtureUrl(value: string) {
  const url = new URL(value);
  if (
    ![databaseOrigin, authOrigin, storageOrigin].includes(url.origin) ||
    !value.startsWith(`${url.origin}/`) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error("Refusing a nonliteral local fixture target.");
  }
  if (url.origin === databaseOrigin) {
    if (
      url.searchParams.get("ns") !== EMULATOR_PROJECT ||
      url.searchParams.getAll("ns").length !== 1 ||
      [...url.searchParams.keys()].some((key) => key !== "ns")
    ) {
      throw new Error("Refusing a different fixture database namespace.");
    }
  } else if (url.origin === storageOrigin) {
    const root = `/v0/b/${bucket}/o`;
    if (url.pathname !== root && !url.pathname.startsWith(`${root}/`)) {
      throw new Error("Refusing a different fixture Storage bucket.");
    }
  } else if (
    !/^\/identitytoolkit\.googleapis\.com\/v1\/accounts:(signUp|signInWithPassword|lookup|delete)$/.test(
      url.pathname,
    ) ||
    url.search !== "?key=test-api-key"
  ) {
    throw new Error("Refusing an unexpected fixture Auth endpoint.");
  }
}

type Method = "DELETE" | "GET" | "PUT";
type Account = { email: string };
type Producer = { finished: Promise<void>; accountEmail?: string };

async function bounded<T>(operation: Promise<T>, deadline: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Local fixture completion deadline expired.")),
          Math.max(0, deadline - Date.now()),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export type Invitation = {
  email: string;
  locations: Record<string, boolean>;
  createdBy: string;
  createdAt: number;
};

export class LocalFixture {
  readonly id: string;
  private readonly venues = new Set<string>();
  private readonly emails = new Set<string>();
  private readonly accounts = new Map<string, Account>();
  private readonly invitationIds = new Set<string>();
  private readonly pendingAccounts = new Set<string>();
  private readonly producers = new Set<Producer>();
  private retiring = false;
  private cleanupDeadline: number | undefined;

  constructor(
    execution: string,
    worker: string,
    private readonly transport: typeof fetch = fetch,
  ) {
    this.id = fixtureIdentity(execution, worker);
  }

  venue(label = "test-location") {
    this.requireActive();
    if (!/^[A-Za-z0-9_-]{1,24}$/.test(label)) {
      throw new Error("Invalid fixture venue label.");
    }
    const venue = `${label}-${this.id}`;
    this.venues.add(venue);
    return venue;
  }

  email(role: string) {
    this.requireActive();
    if (!/^[a-z0-9-]{1,24}$/.test(role)) {
      throw new Error("Invalid fixture account role.");
    }
    const email = `e2e-${role}-${this.id}@example.test`;
    this.emails.add(email);
    return email;
  }

  invitationKey(role: string) {
    this.requireActive();
    if (!/^[a-z0-9-]{1,24}$/.test(role)) {
      throw new Error("Invalid fixture invitation role.");
    }
    const id = `inv-${this.id}-${role}`;
    this.invitationIds.add(id);
    return id;
  }

  private requireActive() {
    if (this.retiring) throw new Error("Local fixture is retiring.");
  }

  // Register before invoking transport. Rejection is ambiguous: the server can
  // still commit after the caller loses its response. Only completion (or exact
  // owned-account reconciliation) removes a producer from the barrier.
  private async produce<T>(
    action: () => Promise<T>,
    accountEmail?: string,
  ): Promise<T> {
    this.requireActive();
    let finish: (() => void) | undefined;
    const producer: Producer = {
      finished: new Promise<void>((resolve) => {
        finish = resolve;
      }),
      accountEmail,
    };
    this.producers.add(producer);
    try {
      const result = await action();
      this.producers.delete(producer);
      return result;
    } finally {
      finish?.();
    }
  }

  async trackMutation<T>(action: () => Promise<T>): Promise<T> {
    if (this.retiring) {
      // A browser request observed after retirement began is already submitted.
      // Rejecting its observer cannot revoke it: retain an unresolved producer.
      this.producers.add({ finished: Promise.resolve() });
      throw new Error(
        "Local fixture is retiring; submitted work is unresolved.",
      );
    }
    return this.produce(action);
  }

  async settleMutations(timeoutMs = 20000) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 20000)
      throw new Error("Invalid local fixture completion bound.");
    const deadline = Math.min(
      Date.now() + timeoutMs,
      this.cleanupDeadline ?? Infinity,
    );
    // Keep observing additions while the still-open page finishes submissions.
    let observed: Producer[];
    do {
      observed = [...this.producers];
      await bounded(
        Promise.all(observed.map((item) => item.finished)),
        deadline,
      );
    } while ([...this.producers].some((item) => !observed.includes(item)));
    await bounded(this.reconcileAccounts(), deadline);
    if (this.producers.size)
      throw new Error(
        "Local fixture cleanup incomplete: unresolved submitted mutation.",
      );
  }

  private async reconcileAccounts() {
    for (const email of this.pendingAccounts) {
      const result = await this.send(
        `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=test-api-key`,
        "POST",
        { email: [email] },
        true,
      );
      if (result.status !== 200)
        throw new Error(`Local fixture Auth lookup: HTTP ${result.status}.`);
      const users = record(result.body).users ?? [];
      if (!Array.isArray(users) || users.length > 1)
        throw new Error("Invalid local fixture Auth lookup response.");
      // Absence cannot prove a lost signup will never commit. Leave its producer
      // unresolved and fail cleanup instead of declaring that no account exists.
      if (users.length === 0) continue;
      const account = record(users[0]);
      if (
        account.email !== email ||
        typeof account.localId !== "string" ||
        !keyPattern.test(account.localId) ||
        (this.accounts.has(account.localId) &&
          this.accounts.get(account.localId)?.email !== email)
      )
        throw new Error("Refusing an unowned fixture Auth lookup result.");
      this.accounts.set(account.localId, { email });
      this.pendingAccounts.delete(email);
      for (const producer of this.producers)
        if (producer.accountEmail === email) this.producers.delete(producer);
    }
  }

  private async send(
    url: string,
    method: string,
    data?: unknown,
    owner = false,
  ): Promise<{ status: number; body: unknown }> {
    requireEmulatorSelection();
    assertLocalFixtureUrl(url);
    const timeout = Math.min(
      5000,
      this.cleanupDeadline === undefined
        ? 5000
        : this.cleanupDeadline - Date.now(),
    );
    if (timeout <= 0)
      throw new Error("Local fixture cleanup deadline expired.");
    try {
      return await bounded(
        (async () => {
          const response = await this.transport(url, {
            method,
            redirect: "manual",
            signal: AbortSignal.timeout(timeout),
            headers: {
              "Content-Type": "application/json",
              ...(owner ? { Authorization: "Bearer owner" } : {}),
            },
            ...(data === undefined ? {} : { body: JSON.stringify(data) }),
          });
          if (response.status >= 300 && response.status < 400) {
            throw new Error("redirect");
          }
          const text = await response.text();
          if (text.length > 1024 * 1024) throw new Error("oversized response");
          const body: unknown = text ? JSON.parse(text) : null;
          return { status: response.status, body };
        })(),
        Date.now() + timeout,
      );
    } catch {
      // Never echo transport messages, response bodies, tokens or request payloads.
      throw new Error(`Local fixture ${method} transport/response failed.`);
    }
  }

  async database(
    method: Method,
    path: string,
    data?: unknown,
  ): Promise<unknown> {
    this.assertDatabasePath(method, path);
    if (method === "GET") return this.databaseRequest(method, path, data);
    return this.produce(() => this.databaseRequest(method, path, data));
  }

  private assertDatabasePath(method: Method, path: string) {
    const [area, child, ...rest] = path.split("/");
    const globalInvitationRead = method === "GET" && path === "invitations";
    const owned =
      child !== undefined &&
      keyPattern.test(child) &&
      rest.every((key) => keyPattern.test(key)) &&
      ((["states", "locations", "audit", "perimeter", "presence"].includes(
        area ?? "",
      ) &&
        this.venues.has(child)) ||
        (["auth", "admins"].includes(area ?? "") && this.accounts.has(child)) ||
        (area === "invitations" && this.invitationIds.has(child)));
    if (!globalInvitationRead && !owned) {
      throw new Error(
        "Refusing a fixture database path outside owned children.",
      );
    }
  }

  private async databaseRequest(
    method: Method,
    path: string,
    data?: unknown,
  ): Promise<unknown> {
    this.assertDatabasePath(method, path);
    const result = await this.send(
      `${databaseOrigin}/${path}.json?ns=${EMULATOR_PROJECT}`,
      method,
      data,
      true,
    );
    if (result.status < 200 || result.status >= 300) {
      throw new Error(
        `Local fixture database ${method}: HTTP ${result.status}.`,
      );
    }
    return result.body;
  }

  async createUser(email: string, password: string): Promise<string> {
    this.requireActive();
    if (!this.emails.has(email)) {
      throw new Error("Refusing an account outside owned fixture emails.");
    }
    if (this.pendingAccounts.has(email)) {
      throw new Error("Local fixture account creation is unresolved.");
    }
    this.pendingAccounts.add(email);
    return this.produce(async () => {
      const authUrl = (action: string) =>
        `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:${action}?key=test-api-key`;
      const data = { email, password, returnSecureToken: true };
      let result = await this.send(authUrl("signUp"), "POST", data);
      if (result.status === 400) {
        const error = record(record(result.body).error);
        if (error.message === "EMAIL_EXISTS") {
          result = await this.send(authUrl("signInWithPassword"), "POST", data);
        }
      }
      if (result.status !== 200) {
        throw new Error(
          `Local fixture Auth signup/login: HTTP ${result.status}.`,
        );
      }
      const account = record(result.body);
      if (
        typeof account.localId !== "string" ||
        !keyPattern.test(account.localId) ||
        typeof account.idToken !== "string" ||
        !account.idToken ||
        account.email !== email
      ) {
        throw new Error("Invalid local fixture Auth account response.");
      }
      this.accounts.set(account.localId, { email });
      this.pendingAccounts.delete(email);
      return account.localId;
    }, email);
  }

  async seedInvitations(invitations: Record<string, Invitation>) {
    this.requireActive();
    // Validate the whole batch before the first write; never PUT the collection.
    for (const [id, invitation] of Object.entries(invitations)) {
      if (
        !this.invitationIds.has(id) ||
        !this.emails.has(invitation.email) ||
        Object.keys(invitation.locations).some((key) => !this.venues.has(key))
      ) {
        throw new Error("Refusing an invitation outside fixture ownership.");
      }
    }
    await this.produce(async () => {
      for (const [id, invitation] of Object.entries(invitations)) {
        await this.databaseRequest("PUT", `invitations/${id}`, invitation);
      }
    });
  }

  async invitations(): Promise<Record<string, Invitation>> {
    const raw = await this.database("GET", "invitations");
    const owned = new Map<string, Invitation>();
    for (const [id, value] of Object.entries(raw === null ? {} : record(raw))) {
      if (value === null || typeof value !== "object" || Array.isArray(value))
        continue;
      const invitation = record(value);
      if (
        typeof invitation.email !== "string" ||
        !this.emails.has(invitation.email)
      )
        continue;
      if (
        !this.invitationIds.has(id) &&
        (typeof invitation.createdBy !== "string" ||
          !this.emails.has(invitation.createdBy))
      )
        continue;
      if (
        !keyPattern.test(id) ||
        typeof invitation.createdBy !== "string" ||
        typeof invitation.createdAt !== "number"
      ) {
        throw new Error("Invalid owned fixture invitation response.");
      }
      const locations = new Map<string, boolean>();
      for (const [key, grant] of Object.entries(record(invitation.locations))) {
        if (typeof grant !== "boolean")
          throw new Error("Invalid owned fixture invitation grant.");
        locations.set(key, grant);
      }
      this.invitationIds.add(id); // Includes IDs generated by the real callable.
      owned.set(id, {
        email: invitation.email,
        createdBy: invitation.createdBy,
        createdAt: invitation.createdAt,
        locations: Object.fromEntries(locations),
      });
    }
    return Object.fromEntries(owned);
  }

  private async deleteStorage(venue: string) {
    const root = `${storageOrigin}/v0/b/${bucket}/o`;
    let token: string | undefined;
    for (let page = 0; page < 100; page++) {
      const url = new URL(root);
      url.searchParams.set("prefix", `${venue}/`);
      if (token) url.searchParams.set("pageToken", token);
      const result = await this.send(url.href, "GET", undefined, true);
      if (result.status !== 200)
        throw new Error(`Local fixture Storage list: HTTP ${result.status}.`);
      const listing = record(result.body);
      const items = listing.items ?? [];
      if (!Array.isArray(items))
        throw new Error("Invalid fixture Storage list.");
      for (const item of items) {
        const name = record(item).name;
        if (typeof name !== "string" || !name.startsWith(`${venue}/`))
          throw new Error("Refusing an unowned fixture Storage object.");
        const deletion = await this.send(
          `${root}/${encodeURIComponent(name)}`,
          "DELETE",
          undefined,
          true,
        );
        if (![200, 204, 404].includes(deletion.status))
          throw new Error(
            `Local fixture Storage delete: HTTP ${deletion.status}.`,
          );
      }
      if (listing.nextPageToken === undefined) return;
      if (
        typeof listing.nextPageToken !== "string" ||
        listing.nextPageToken === token
      )
        throw new Error("Invalid fixture Storage pagination.");
      token = listing.nextPageToken;
    }
    throw new Error("Local fixture Storage pagination exceeded its bound.");
  }

  async cleanup(timeoutMs = 20000) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 20000)
      throw new Error("Invalid local fixture cleanup bound.");
    this.retiring = true;
    this.cleanupDeadline = Date.now() + timeoutMs;
    const failures: string[] = [];
    const attempt = async (action: () => Promise<unknown>) => {
      try {
        await action();
      } catch (error: unknown) {
        failures.push(
          error instanceof Error ? error.message : "Fixture cleanup failed.",
        );
      }
    };
    await attempt(() => this.settleMutations(timeoutMs));
    // The final owned discovery follows producer completion, including generated
    // invitation IDs. An unresolved producer above always makes cleanup fail.
    await attempt(() => this.invitations());
    for (const id of this.invitationIds)
      await attempt(() => this.databaseRequest("DELETE", `invitations/${id}`));
    for (const venue of this.venues) {
      for (const area of [
        "states",
        "locations",
        "audit",
        "perimeter",
        "presence",
      ])
        await attempt(() => this.databaseRequest("DELETE", `${area}/${venue}`));
      await attempt(() => this.deleteStorage(venue));
    }
    for (const uid of this.accounts.keys()) {
      for (const area of ["auth", "admins"])
        await attempt(() => this.databaseRequest("DELETE", `${area}/${uid}`));
      await attempt(async () => {
        const result = await this.send(
          `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:delete?key=test-api-key`,
          "POST",
          { localId: uid },
          true,
        );
        // Retain UID ownership for retries of failed grant/admin removals, even
        // after Auth deletion succeeded. Only checked absence is idempotent.
        const absent =
          result.status === 400 &&
          record(record(result.body).error).message === "USER_NOT_FOUND";
        if (result.status !== 200 && !absent)
          throw new Error(`Local fixture Auth delete: HTTP ${result.status}.`);
      });
    }
    if (this.producers.size)
      failures.push(
        "Local fixture cleanup incomplete: unresolved submitted mutation.",
      );
    if (failures.length) throw new Error(failures.join("\n"));
  }
}
