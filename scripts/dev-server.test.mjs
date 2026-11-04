import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import http from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const script = fileURLToPath(new URL("./dev-server.sh", import.meta.url));

// Exercise real tmux lifecycles against local HTTP processes. No app, Firebase,
// credentials, dependency install, or deployment is involved.
const fixture = `
const http = require("node:http");
if (process.env.DEV_SERVER_FIXTURE_MODE === "fail") {
  console.error("fixture startup failure");
  process.exit(1);
}
const args = process.argv.slice(2);
if (!args.includes("--strictPort") || args[args.indexOf("--host") + 1] !== "0.0.0.0") {
  throw new Error("Expected explicit host and strict port");
}
const port = Number(args[args.indexOf("--port") + 1]);
const server = http.createServer((req, res) => {
  res.end(JSON.stringify({ cwd: process.cwd(), pid: process.pid, emulator: process.env.VITE_USE_EMULATOR }));
});
server.on("error", (error) => { console.error(error.code); process.exit(1); });
server.listen(port, "0.0.0.0", () => {
  if (process.env.DEV_SERVER_FIXTURE_MODE !== "silent") {
    console.log("Local: http://localhost:" + port);
  }
});
`;

async function freePort() {
  const server = http.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function response(port) {
  return (
    await fetch(`http://127.0.0.1:${port}`, {
      signal: AbortSignal.timeout(1000),
    })
  ).json();
}

async function waitStopped(port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await response(port);
    } catch {
      return;
    }
    await setTimeout(100);
  }
  assert.fail(`Server on ${port} still accepts requests after stop`);
}

test("workspace-owned dev server lifecycle", async (t) => {
  const cache = process.env.XDG_CACHE_HOME || path.join(homedir(), ".cache");
  await mkdir(cache, { recursive: true });
  const temp = await mkdtemp(path.join(cache, "v260-"));
  const env = { ...process.env, TMUX_TMPDIR: path.join(temp, "sockets") };
  await mkdir(env.TMUX_TMPDIR);
  const handles = new Map();

  async function run(workspace, action, port, extraEnv = {}) {
    const selectedPort = port ?? 4600;
    if (
      /^[1-9][0-9]{0,4}$/.test(String(selectedPort)) &&
      Number(selectedPort) <= 65535
    ) {
      handles.set(`${workspace}:${selectedPort}`, {
        workspace,
        port: selectedPort,
      });
    }
    const args = [path.join(workspace, "scripts/dev-server.sh"), action];
    if (port !== undefined) args.push(String(port));
    try {
      const result = await exec("bash", args, {
        env: { ...env, ...extraEnv },
        timeout: 25000,
      });
      return { code: 0, ...result };
    } catch (error) {
      if (typeof error.code !== "number") throw error;
      return { code: error.code, stdout: error.stdout, stderr: error.stderr };
    }
  }

  t.after(async () => {
    const failures = [];
    for (const { workspace, port } of handles.values()) {
      try {
        assert.equal((await run(workspace, "stop", port)).code, 0);
        assert.equal((await run(workspace, "status", port)).code, 1);
      } catch (error) {
        failures.push(error);
      }
    }
    assert.deepEqual(failures, [], `Cleanup failed; inspect ${temp}`);
    await rm(temp, { recursive: true, force: true });
  });

  async function workspace(name, parent) {
    const root = path.join(temp, name);
    if (parent) {
      await exec("git", ["-C", parent, "worktree", "add", "--detach", root]);
    } else {
      await exec("git", ["init", "--quiet", root]);
      await exec("git", [
        "-C",
        root,
        "-c",
        "user.name=Lifecycle test",
        "-c",
        "user.email=lifecycle@example.invalid",
        "commit",
        "--quiet",
        "--allow-empty",
        "-m",
        "Fixture",
      ]);
    }
    await mkdir(path.join(root, "scripts"), { recursive: true });
    await copyFile(script, path.join(root, "scripts/dev-server.sh"));
    await mkdir(path.join(root, "clock/node_modules/vite/bin"), {
      recursive: true,
    });
    await mkdir(path.join(root, "clock/node_modules/.vite"));
    await writeFile(
      path.join(root, "clock/node_modules/vite/bin/vite.js"),
      fixture,
    );
    await writeFile(path.join(root, "clock/node_modules/.vite/keep"), "cache");
    return root;
  }

  const a = await workspace("workspace a 'quoted' $literal");
  const b = await workspace("workspace b", a);
  const portA = await freePort();
  let portB = await freePort();
  while (portA === portB) portB = await freePort();

  await t.test(
    "default port preserves the API and emulator logging",
    async () => {
      const api = http.createServer((req, res) => {
        res.end(JSON.stringify({ status: "ok" }));
      });
      api.listen(8000, "127.0.0.1");
      await once(api, "listening");
      const logging = http.createServer((req, res) => {
        res.end(JSON.stringify({ service: "emulator logging" }));
      });
      try {
        logging.listen(4500, "127.0.0.1");
        await once(logging, "listening");
        const started = await run(a, "start");
        assert.equal(started.code, 0);
        assert.match(started.stdout, /Port: 4600/);
        assert.equal((await response(4600)).cwd, path.join(a, "clock"));
        assert.deepEqual(await response(8000), { status: "ok" });
        assert.deepEqual(await response(4500), { service: "emulator logging" });
        assert.match((await run(a, "status")).stdout, /Running; PID:/);
        assert.equal((await run(a, "stop")).code, 0);
        await waitStopped(4600);
        assert.deepEqual(await response(8000), { status: "ok" });
        assert.deepEqual(await response(4500), { service: "emulator logging" });
      } finally {
        await run(a, "stop");
        await new Promise((resolve) => logging.close(resolve));
        await new Promise((resolve) => api.close(resolve));
      }
    },
  );

  await t.test(
    "independent handles, logs, environments and scoped stop",
    async () => {
      assert.equal(
        (await run(a, "start", portA, { VITE_USE_EMULATOR: "true" })).code,
        0,
      );
      assert.equal(
        (await run(b, "start", portB, { VITE_USE_EMULATOR: "false" })).code,
        0,
      );
      const originalA = await response(portA);
      const originalB = await response(portB);
      assert.equal(originalA.cwd, path.join(a, "clock"));
      assert.equal(originalB.cwd, path.join(b, "clock"));
      assert.equal(originalA.emulator, "true");
      assert.equal(originalB.emulator, "false");
      assert.notEqual(originalA.pid, originalB.pid);
      assert.match(
        await readFile(path.join(a, `.dev-server/${portA}.log`), "utf8"),
        /Local:/,
      );
      assert.match(
        await readFile(path.join(b, `.dev-server/${portB}.log`), "utf8"),
        /Local:/,
      );
      assert.equal(
        await readFile(path.join(a, "clock/node_modules/.vite/keep"), "utf8"),
        "cache",
      );

      const duplicate = await run(a, "start", portA);
      assert.equal(duplicate.code, 0);
      assert.match(duplicate.stdout, /Already running/);
      assert.equal((await response(portA)).pid, originalA.pid);
      assert.match(
        (await run(a, "status", portA)).stdout,
        new RegExp(`PID: ${originalA.pid}`),
      );

      assert.equal((await run(a, "stop", portB)).code, 0);
      assert.equal((await response(portB)).pid, originalB.pid);
      assert.equal((await run(a, "stop", portA)).code, 0);
      await waitStopped(portA);
      assert.equal((await response(portB)).pid, originalB.pid);
      assert.equal((await run(a, "status", portA)).code, 1);
      assert.equal((await run(a, "stop", portA)).code, 0);
      assert.equal(
        (await run(a, "start", portA, { VITE_USE_EMULATOR: "false" })).code,
        0,
      );
      assert.notEqual((await response(portA)).pid, originalA.pid);
      assert.equal((await response(portA)).emulator, "false");
    },
  );

  await t.test(
    "two ports in one worktree stay independent and aliases reuse ownership",
    async () => {
      let secondPort = await freePort();
      while ([portA, portB].includes(secondPort)) secondPort = await freePort();
      const ownerA = await response(portA);
      const ownerB = await response(portB);
      assert.equal(
        (await run(a, "start", secondPort, { VITE_USE_EMULATOR: "true" })).code,
        0,
      );
      assert.equal((await response(secondPort)).emulator, "true");
      assert.equal((await response(portA)).emulator, "false");
      const alias = path.join(temp, "workspace alias");
      await symlink(a, alias, "dir");
      const duplicate = await run(alias, "start", portA);
      assert.equal(duplicate.code, 0);
      assert.match(duplicate.stdout, /Already running/);
      assert.equal((await response(portA)).pid, ownerA.pid);
      assert.equal((await run(a, "stop", secondPort)).code, 0);
      await waitStopped(secondPort);
      assert.equal((await response(portA)).pid, ownerA.pid);
      assert.equal((await response(portB)).pid, ownerB.pid);
      assert.match(
        await readFile(path.join(a, `.dev-server/${secondPort}.log`), "utf8"),
        /Local:/,
      );
    },
  );

  await t.test(
    "occupied port fails without fallback or killing its owner",
    async () => {
      const owner = await response(portB);
      const collision = await run(a, "start", portB);
      assert.equal(collision.code, 1);
      assert.match(collision.stderr, /Vite exited/);
      assert.match(
        await readFile(path.join(a, `.dev-server/${portB}.log`), "utf8"),
        /EADDRINUSE/,
      );
      assert.equal((await response(portB)).pid, owner.pid);
      assert.equal((await run(a, "status", portB)).code, 1);
    },
  );

  await t.test(
    "stale logs and PIDs cannot target an unmanaged replacement",
    async (staleTest) => {
      const stopped = await response(portA);
      const status = await run(a, "status", portA);
      assert.match(status.stdout, new RegExp(`PID: ${stopped.pid}`));
      const socket = status.stdout.match(/Handle: tmux -L (\S+)/)[1];
      // End the owned session independently of the helper, leaving its log behind.
      await exec("tmux", ["-L", socket, "kill-session", "-t", "=vite"], {
        env,
      });
      await waitStopped(portA);

      const child = spawn(
        process.execPath,
        [
          path.join(a, "clock/node_modules/vite/bin/vite.js"),
          "--host",
          "0.0.0.0",
          "--port",
          String(portA),
          "--strictPort",
        ],
        { env, stdio: ["ignore", "pipe", "ignore"] },
      );
      staleTest.after(async () => {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, "exit");
          child.kill();
          await exited;
        }
        await waitStopped(portA);
      });
      await once(child.stdout, "data");
      assert.equal((await response(portA)).pid, child.pid);

      // Even a legacy PID file pointing to a live unrelated process is ignored.
      await writeFile(
        path.join(a, `.dev-server/${portA}.pid`),
        String(child.pid),
      );
      assert.equal((await run(a, "status", portA)).code, 1);
      assert.equal((await run(a, "stop", portA)).code, 0);
      assert.equal((await response(portA)).pid, child.pid);
      const collision = await run(a, "start", portA);
      assert.equal(collision.code, 1);
      assert.match(collision.stderr, /Vite exited/);
      assert.equal((await response(portA)).pid, child.pid);
      assert.equal((await run(a, "status", portA)).code, 1);
      assert.equal((await run(a, "stop", portA)).code, 0);
      assert.equal((await response(portA)).pid, child.pid);
      assert.equal((await response(portB)).cwd, path.join(b, "clock"));
    },
  );

  await t.test(
    "startup failure replaces stale readiness logs and cleans its session",
    async () => {
      // portB previously failed in workspace a, so seed an apparently ready log.
      await writeFile(
        path.join(a, `.dev-server/${portB}.log`),
        "Local: http://localhost:old\n",
      );
      const owner = await response(portB);
      const failed = await run(a, "start", portB, {
        DEV_SERVER_FIXTURE_MODE: "fail",
      });
      assert.equal(failed.code, 1);
      assert.match(failed.stderr, /Vite exited/);
      const log = await readFile(
        path.join(a, `.dev-server/${portB}.log`),
        "utf8",
      );
      assert.match(log, /fixture startup failure/);
      assert.doesNotMatch(log, /Local:/);
      assert.equal((await run(a, "status", portB)).code, 1);
      assert.equal((await run(a, "stop", portB)).code, 0);
      assert.equal((await response(portB)).pid, owner.pid);
    },
  );

  await t.test(
    "unconfirmed startup retains an inspectable session with scoped cleanup",
    async () => {
      const slowPort = await freePort();
      const result = await run(a, "start", slowPort, {
        DEV_SERVER_FIXTURE_MODE: "silent",
      });
      assert.equal(result.code, 1);
      assert.match(result.stderr, /Startup not confirmed/);
      const owner = await response(slowPort);
      assert.match(
        (await run(a, "status", slowPort)).stdout,
        new RegExp(`PID: ${owner.pid}`),
      );
      assert.equal((await run(a, "stop", slowPort)).code, 0);
      await waitStopped(slowPort);
      assert.equal((await run(a, "status", slowPort)).code, 1);
      assert.equal((await response(portB)).cwd, path.join(b, "clock"));
    },
  );

  await t.test(
    "invalid ports and absent dependencies fail without starting",
    async () => {
      assert.equal((await run(a, "start", "8000;false")).code, 2);
      assert.equal((await run(a, "start", "65536")).code, 2);
      const missing = await workspace("missing vite");
      await rm(path.join(missing, "clock/node_modules/vite"), {
        recursive: true,
      });
      const result = await run(missing, "start", await freePort());
      assert.equal(result.code, 1);
      assert.match(result.stderr, /Vite is missing/);
    },
  );
});
