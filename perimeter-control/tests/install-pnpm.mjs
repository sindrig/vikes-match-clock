// Opt-in installer regression proof with the package.json-pinned, real pnpm.
// Only temporary destinations and synthetic credentials; OS service/user tools
// are doubles. See README.md for the cross-filesystem invocation.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const gateway = fileURLToPath(new URL("../", import.meta.url));
const crossRoot = process.env.PNPM_TEST_CROSS_DEVICE_TMPDIR;
assert.ok(
  crossRoot,
  "set PNPM_TEST_CROSS_DEVICE_TMPDIR on a second filesystem",
);
assert.notEqual(fs.statSync(crossRoot).dev, fs.statSync(os.tmpdir()).dev);
const artifacts = process.env.PNPM_TEST_ARTIFACTS;
if (artifacts) fs.mkdirSync(artifacts, { recursive: true });
const before = process.env.PNPM_TEST_INSTALLER_REF;
const installerSource = before
  ? execFileSync("git", ["show", `${before}:perimeter-control/install.sh`], {
      cwd: gateway,
      encoding: "utf8",
    })
  : fs.readFileSync(path.join(gateway, "install.sh"), "utf8");
const corepack = execFileSync("/bin/bash", ["-c", "command -v corepack"], {
  encoding: "utf8",
}).trim();
const corepackHome =
  process.env.COREPACK_HOME ||
  path.join(
    process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
    "node/corepack",
  );
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const files = [
  "index.js",
  "brightness.js",
  "auto-brightness.js",
  "weather.js",
  "vnnox.js",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".npmrc",
  "perimeter-control.env.example",
  "perimeter-control.service",
];
const retired = [
  "overlay.js",
  "ad-layout.js",
  "resolume-import.js",
  "resolume-preview.js",
  "geometry.js",
];
const results = [];

function fixture(name, crossDevice = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "perimeter-pnpm-"));
  const destination = crossDevice
    ? fs.mkdtempSync(path.join(crossRoot, "perimeter-pnpm-"))
    : root;
  const app = path.join(destination, "app");
  const source = path.join(root, "source");
  const etc = path.join(root, "etc");
  const unit = path.join(root, "perimeter-control.service");
  const bin = path.join(root, "bin");
  const stage = path.join(root, "stage");
  const log = path.join(root, "operations.jsonl");
  const home = path.join(root, "home");
  for (const dir of [app, source, etc, bin, stage, home]) fs.mkdirSync(dir);
  for (const file of files)
    fs.copyFileSync(path.join(gateway, file), path.join(source, file));
  let script = installerSource;
  for (const [from, to] of [
    ["APP_DIR=/opt/perimeter-control", `APP_DIR=${quote(app)}`],
    ["ETC_DIR=/etc/perimeter-control", `ETC_DIR=${quote(etc)}`],
    [
      "UNIT_FILE=/etc/systemd/system/perimeter-control.service",
      `UNIT_FILE=${quote(unit)}`,
    ],
    ["if [[ $EUID -ne 0 ]]; then", "if false; then"],
  ]) {
    assert.equal(script.split(from).length, 2, from);
    script = script.replace(from, to);
  }
  const installer = path.join(source, "install.sh");
  fs.writeFileSync(installer, script);
  const account = path.join(root, "synthetic-account.json");
  fs.writeFileSync(account, '{"project_id":"synthetic-only"}\n');
  const preserved = [
    [path.join(app, "operator.js"), "operator code"],
    [path.join(app, "package-lock.json"), "unmanaged lock"],
    [
      path.join(etc, "perimeter-control.env"),
      "PERIMETER_BRIGHTNESS_ENABLED=false\nOPERATOR_SENTINEL=retained\n",
    ],
    [path.join(etc, "unused-key"), "synthetic unused key"],
  ];
  const old = [
    [path.join(app, "index.js"), "old runtime sentinel\n"],
    [path.join(app, "node_modules/old-dependency"), "old dependency\n"],
    [
      path.join(etc, "perimeter-service-account.json"),
      "old synthetic credential\n",
    ],
    [unit, "old unit\n"],
    ...retired.map((file) => [path.join(app, file), "old media sentinel\n"]),
  ];
  fs.mkdirSync(path.join(app, "node_modules"));
  for (const [file, content] of [...preserved, ...old])
    fs.writeFileSync(file, content);
  const record = `#!${process.execPath}\nimport fs from 'node:fs'; import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2); fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({name:process.argv[1].split('/').pop(),args,cwd:process.cwd()})+'\\n');\n`;
  for (const tool of ["id", "useradd", "systemctl"])
    fs.writeFileSync(path.join(bin, tool), record, { mode: 0o755 });
  fs.writeFileSync(
    path.join(bin, "install"),
    record +
      `
const filtered=[]; for(let i=0;i<args.length;i++){if(args[i]==='-o'||args[i]==='-g'){i++;continue;}filtered.push(args[i]);}
const run=spawnSync('/usr/bin/install',filtered,{stdio:'inherit'});process.exit(run.status??1);`,
    { mode: 0o755 },
  );
  // This wrapper records arguments but always invokes the real pinned pnpm.
  fs.writeFileSync(
    path.join(bin, "corepack"),
    record +
      `
if (process.env.PNPM_TEST_EMPTY_OFFLINE_STORE === '1' && args.includes('--offline')) {
  const store=args[args.indexOf('--store-dir')+1];
  if (!pathIsFixture(store)) throw new Error('expected a fixture-owned store');
  fs.rmSync(store,{recursive:true,force:true});
}
function pathIsFixture(value) { return value?.startsWith(${JSON.stringify(stage + path.sep)}); }
const run=spawnSync(process.execPath,[${JSON.stringify(corepack)},...args],{stdio:'inherit'});process.exit(run.status??1);`,
    { mode: 0o755 },
  );
  const env = {
    HOME: home,
    COREPACK_HOME: corepackHome,
    PATH: `${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
    TMPDIR: stage,
    NODE_OPTIONS: "--max-old-space-size=512",
    NODE_DISABLE_COMPILE_CACHE: "1",
    PNPM_CONFIG_CHILD_CONCURRENCY: "1",
    PNPM_CONFIG_NETWORK_CONCURRENCY: "4",
  };
  return {
    app,
    source,
    stage,
    root,
    run(overrides = {}) {
      const run = spawnSync("/bin/bash", [installer, account], {
        env: { ...env, ...overrides },
        encoding: "utf8",
        timeout: 120000,
      });
      const output = `${run.stdout}\n${run.stderr}`;
      if (artifacts)
        fs.writeFileSync(
          path.join(artifacts, `${name}-${results.length}.log`),
          output,
        );
      const operations = fs.existsSync(log)
        ? fs
            .readFileSync(log, "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .map(JSON.parse)
        : [];
      const result = {
        name,
        status: run.status,
        stageDevice: fs.statSync(stage).dev,
        appDevice: fs.statSync(app).dev,
        runtimeOverwritten:
          fs.readFileSync(path.join(app, "index.js"), "utf8") !== old[0][1],
        operations,
        diagnostics: output
          .split("\n")
          .filter((line) => /ERR_PNPM|store at|error:/i.test(line)),
      };
      if (run.error) result.error = run.error.message;
      for (const [file, content] of preserved)
        assert.equal(fs.readFileSync(file, "utf8"), content, file);
      results.push(result);
      return result;
    },
    unchanged() {
      for (const [file, content] of old)
        assert.equal(fs.readFileSync(file, "utf8"), content, file);
      const commands = results.at(-1).operations;
      assert.equal(
        commands.some(({ name: tool }) =>
          ["install", "useradd", "systemctl"].includes(tool),
        ),
        false,
      );
    },
    verifyRuntime(result) {
      assert.equal(result.status, 0, JSON.stringify(result));
      const dependency = path.join(app, "node_modules/firebase-admin");
      result.dependencyRealPath = fs.realpathSync(dependency);
      result.projectLocal = result.dependencyRealPath.startsWith(
        app + path.sep,
      );
      if (!before) assert.equal(result.projectLocal, true);
      if (!before) {
        let links = 0;
        const modules = path.join(app, "node_modules");
        function verify(directory) {
          for (const entry of fs.readdirSync(directory, {
            withFileTypes: true,
          })) {
            const file = path.join(directory, entry.name);
            if (entry.isSymbolicLink()) {
              assert.equal(path.isAbsolute(fs.readlinkSync(file)), false);
              assert.ok(fs.realpathSync(file).startsWith(modules + path.sep));
              links += 1;
            } else {
              const mode = fs.statSync(file).mode;
              assert.ok(mode & 0o004, `service-readable file: ${file}`);
              if (entry.isDirectory()) {
                assert.ok(
                  mode & 0o001,
                  `service-traversable directory: ${file}`,
                );
                verify(file);
              }
            }
          }
        }
        verify(modules);
        result.projectLocalLinks = links;
        result.serviceReadable = true;
        assert.equal(
          fs.existsSync(path.join(modules, "old-dependency")),
          false,
        );
      }
      const preparation = result.operations.find(
        ({ name: tool, args }) =>
          tool === "corepack" && args.includes("install"),
      );
      result.stageRemoved = !fs.existsSync(preparation.cwd);
      assert.equal(
        result.stageRemoved,
        true,
        "staged project removed before runtime import",
      );
      const check = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          "await import('./index.js'); await import('firebase-admin/app'); await import('firebase-admin/database'); await import('suncalc');",
        ],
        {
          cwd: app,
          env: { PATH: env.PATH, NODE_OPTIONS: env.NODE_OPTIONS },
          encoding: "utf8",
        },
      );
      assert.equal(check.status, 0, check.stderr);
      result.postCleanupImport = true;
      for (const file of retired)
        assert.equal(fs.existsSync(path.join(app, file)), false);
    },
    close() {
      if (destination !== root)
        fs.rmSync(destination, { recursive: true, force: true });
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

try {
  for (const name of [
    "same-filesystem",
    "cross-filesystem",
    "global-layout",
    ...(!before ? ["inherited-layout"] : []),
  ]) {
    const f = fixture(name, name === "cross-filesystem");
    try {
      const settings =
        name === "global-layout" || name === "inherited-layout"
          ? { PNPM_CONFIG_VIRTUAL_STORE_TYPE: "global" }
          : {};
      if (name === "inherited-layout")
        Object.assign(settings, {
          PNPM_CONFIG_ENABLE_GLOBAL_VIRTUAL_STORE: "true",
          PNPM_CONFIG_STORE_DIR: path.join(f.root, "caller-store"),
          PNPM_CONFIG_VIRTUAL_STORE_DIR: path.join(
            f.root,
            "external-virtual-store",
          ),
          PNPM_CONFIG_MODULES_DIR: path.join(f.root, "external-modules"),
          PNPM_CONFIG_NODE_LINKER: "pnp",
          PNPM_CONFIG_PACKAGE_IMPORT_METHOD: "hardlink",
          PNPM_CONFIG_SYMLINK: "false",
          PNPM_CONFIG_ENABLE_MODULES_DIR: "false",
          PNPM_CONFIG_VIRTUAL_STORE_ONLY: "true",
        });
      const result = f.run(settings);
      if (before && name === "cross-filesystem") {
        assert.notEqual(result.status, 0);
        assert.equal(result.runtimeOverwritten, true);
        assert.match(
          result.diagnostics.join("\n"),
          /ERR_PNPM_NO_OFFLINE_TARBALL/,
        );
      } else {
        f.verifyRuntime(result);
        if (before && name === "global-layout")
          assert.equal(result.projectLocal, false);
        if (!before) f.verifyRuntime(f.run(settings));
      }
    } finally {
      f.close();
    }
  }
  if (!before)
    for (const failure of ["frozen-preparation", "offline-preparation"]) {
      const f = fixture(failure);
      try {
        if (failure === "frozen-preparation") {
          const manifest = path.join(f.source, "package.json");
          const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
          pkg.dependencies.suncalc = "0.0.0";
          fs.writeFileSync(manifest, JSON.stringify(pkg));
        }
        const result = f.run(
          failure === "offline-preparation"
            ? { PNPM_TEST_EMPTY_OFFLINE_STORE: "1" }
            : {},
        );
        assert.notEqual(result.status, 0);
        assert.match(
          result.diagnostics.join("\n"),
          failure === "frozen-preparation"
            ? /ERR_PNPM_OUTDATED_LOCKFILE/
            : /ERR_PNPM_NO_OFFLINE_TARBALL/,
        );
        f.unchanged();
      } finally {
        f.close();
      }
    }
} finally {
  const output = JSON.stringify(
    {
      node: process.version,
      installerRef: before || "working-tree",
      systemdExecuted: false,
      results,
    },
    null,
    2,
  );
  if (artifacts)
    fs.writeFileSync(path.join(artifacts, "results.json"), output + "\n");
  console.log(output);
}
