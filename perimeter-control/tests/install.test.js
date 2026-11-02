import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const gateway = fileURLToPath(new URL("../", import.meta.url));
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
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "perimeter-install-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, "source");
  const app = path.join(root, "app");
  const etc = path.join(root, "etc");
  const unit = path.join(root, "systemd", "perimeter-control.service");
  // Selected executables must stay outside ProtectHome paths even when the
  // caller's TMPDIR places fixture data in a home directory.
  const bin = fs.mkdtempSync("/tmp/perimeter-install-bin-");
  t.after(() => fs.rmSync(bin, { recursive: true, force: true }));
  const log = path.join(root, "commands.jsonl");
  fs.mkdirSync(sourceDir);
  fs.mkdirSync(path.dirname(unit));
  for (const file of files)
    fs.copyFileSync(path.join(gateway, file), path.join(sourceDir, file));
  let script = fs.readFileSync(path.join(gateway, "install.sh"), "utf8");
  const substitutions = [
    ["APP_DIR=/opt/perimeter-control", `APP_DIR=${quote(app)}`],
    ["ETC_DIR=/etc/perimeter-control", `ETC_DIR=${quote(etc)}`],
    [
      "UNIT_FILE=/etc/systemd/system/perimeter-control.service",
      `UNIT_FILE=${quote(unit)}`,
    ],
    ["if [[ $EUID -ne 0 ]]; then", "if [[ ${FIXTURE_EUID:-0} -ne 0 ]]; then"],
  ];
  for (const [before, after] of substitutions) {
    assert.equal(
      script.split(before).length,
      2,
      `one fixture substitution: ${before}`,
    );
    script = script.replace(before, after);
  }
  const installer = path.join(sourceDir, "install.sh");
  fs.writeFileSync(installer, script);
  const account = path.join(root, "synthetic-account.json");
  fs.writeFileSync(account, '{"project_id":"synthetic-install-fixture"}\n');
  const record = `import fs from 'node:fs'; import path from 'node:path'; import {spawnSync} from 'node:child_process';\nconst args=process.argv.slice(2); const name=path.basename(process.argv[1]);\nfs.appendFileSync(process.env.FIXTURE_LOG, JSON.stringify({name,args,cwd:process.cwd()})+'\\n');\n`;
  function tool(name, body) {
    fs.writeFileSync(
      path.join(bin, name),
      `#!${process.execPath}\n${record}${body}\n`,
      { mode: 0o755 },
    );
  }
  // The node shim controls the executable/version; manifest parsing and the
  // staged import check use real Node. Dependency installs are local doubles.
  fs.writeFileSync(
    path.join(bin, "node"),
    `#!/bin/bash
if [[ "$1" == -p && "$2" == process.execPath ]]; then
  printf '%s\\n' "$FIXTURE_NODE"
elif [[ "$1" == -p && "$2" == process.versions.node ]]; then
  printf '%s\\n' "\${FIXTURE_NODE_VERSION:-22.23.3}"
else
  exec ${quote(process.execPath)} "$@"
fi
`,
    { mode: 0o755 },
  );
  tool(
    "corepack",
    `
if (args.join(' ') === 'pnpm --version') { console.log(process.env.FIXTURE_PNPM_VERSION || '12.16.1'); }
else if (args[0] === 'pnpm' && args[1] === 'install') {
  if (process.env.FIXTURE_DEPENDENCY_FAILURE === '1' ||
      (process.env.FIXTURE_OFFLINE_FAILURE === '1' && args.includes('--offline'))) process.exit(42);
  if (!args.includes('--prod') || !args.includes('--frozen-lockfile')) process.exit(43);
  fs.mkdirSync('node_modules/firebase-admin', {recursive:true});
  fs.writeFileSync('node_modules/firebase-admin/package.json', JSON.stringify({type:'module',exports:{'./app':'./app.js','./database':'./database.js'}}));
  fs.writeFileSync('node_modules/firebase-admin/app.js', 'export const cert=()=>{}; export const initializeApp=()=>{};');
  fs.writeFileSync('node_modules/firebase-admin/database.js', 'export const getDatabase=()=>{}; export const ServerValue={TIMESTAMP:0};');
  fs.mkdirSync('node_modules/suncalc', {recursive:true});
  fs.writeFileSync('node_modules/suncalc/package.json', JSON.stringify({type:'module',exports:'./index.js'}));
  fs.writeFileSync('node_modules/suncalc/index.js', 'export default {};');
  fs.writeFileSync('node_modules/fixture-dependency', 'synthetic');
  if (args.includes('--offline')) {
    if (process.env.FIXTURE_BAD_LINK === 'external') {
      fs.writeFileSync('outside-modules', 'synthetic');
      fs.symlinkSync('../outside-modules', 'node_modules/bad-link');
    }
    if (process.env.FIXTURE_BAD_LINK === 'absolute') {
      fs.symlinkSync(path.resolve('node_modules/fixture-dependency'), 'node_modules/bad-link');
    }
    if (process.env.FIXTURE_IMPORT_FAILURE === '1') fs.unlinkSync('node_modules/firebase-admin/app.js');
  }
} else process.exit(44);
`,
  );
  tool(
    "id",
    "process.exit(process.env.FIXTURE_EXISTING_USER === '1' ? 0 : 1);",
  );
  tool("useradd", "");
  tool("systemctl", "");
  tool(
    "install",
    `
const filtered=[];
for (let i=0;i<args.length;i++) {
  if (args[i] === '-o' || args[i] === '-g') {i++; continue;}
  filtered.push(args[i]);
}
const result=spawnSync('/usr/bin/install', filtered, {stdio:'inherit'}); process.exit(result.status ?? 1);
`,
  );
  tool(
    "rm",
    "const result=spawnSync('/usr/bin/rm',args,{stdio:'inherit'}); process.exit(result.status ?? 1);",
  );
  const env = {
    PATH: `${bin}:/usr/bin:/bin`,
    FIXTURE_LOG: log,
    FIXTURE_NODE: path.join(bin, "node"),
    NODE_OPTIONS: "--max-old-space-size=512",
  };
  return {
    root,
    app,
    etc,
    unit,
    bin,
    sourceDir,
    account,
    run(overrides = {}, args = [account]) {
      // Deliberately exclude the invoking shell's credentials and loader vars.
      return spawnSync("/bin/bash", [installer, ...args], {
        env: { ...env, ...overrides },
        encoding: "utf8",
        timeout: 20000,
      });
    },
    commands() {
      return fs.existsSync(log)
        ? fs
            .readFileSync(log, "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line))
        : [];
    },
  };
}

function unchanged(f) {
  assert.equal(fs.existsSync(f.app), false);
  assert.equal(fs.existsSync(f.etc), false);
  assert.equal(fs.existsSync(f.unit), false);
  assert.equal(
    f
      .commands()
      .some(({ name }) => ["install", "useradd", "systemctl"].includes(name)),
    false,
  );
}

for (const version of ["18.20.8", "20.19.0", "21.7.3"]) {
  test(`installer rejects the selected service Node ${version} before mutation`, (t) => {
    const f = fixture(t);
    const result = f.run({ FIXTURE_NODE_VERSION: version });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Node.js >= 22/);
    unchanged(f);
  });
}

test("installer requires root and exactly one explicit readable account path", (t) => {
  const f = fixture(t);
  assert.equal(f.run({ FIXTURE_EUID: "1000" }).status, 1);
  assert.equal(f.run({}, []).status, 1);
  assert.equal(f.run({}, [path.join(f.root, "missing.json")]).status, 1);
  assert.equal(f.run({}, [f.account, "/obsolete-ssh-key"]).status, 1);
  unchanged(f);
});

test("installer checks the resolved ExecStart binary even when a PATH shim advertises newer Node", (t) => {
  const f = fixture(t);
  const actualNode = path.join(f.bin, "service-node");
  fs.writeFileSync(actualNode, "#!/bin/bash\nprintf '%s\\n' '20.19.0'\n", {
    mode: 0o755,
  });
  const result = f.run({
    FIXTURE_NODE: actualNode,
    FIXTURE_NODE_VERSION: "22.23.3",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Node.js >= 22.*selected 20.19.0/);
  unchanged(f);
});

for (const missing of ["node", "corepack"]) {
  test(`installer rejects missing ${missing} before mutation`, (t) => {
    const f = fixture(t);
    fs.unlinkSync(path.join(f.bin, missing));
    // This isolated PATH has no fallback Node/Corepack from the host.
    const result = f.run();
    assert.notEqual(result.status, 0);
    unchanged(f);
  });
}

for (const missing of [
  "brightness.js",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".npmrc",
  "perimeter-control.service",
  "perimeter-control.env.example",
]) {
  test(`installer checks source prerequisite ${missing} before mutation`, (t) => {
    const f = fixture(t);
    fs.unlinkSync(path.join(f.sourceDir, missing));
    assert.equal(f.run().status, 1);
    unchanged(f);
  });
}

test("installer rejects mismatched pnpm and failed frozen dependency preparation before mutation", (t) => {
  const f = fixture(t);
  assert.equal(f.run({ FIXTURE_PNPM_VERSION: "0.0.0" }).status, 1);
  unchanged(f);
  assert.equal(f.run({ FIXTURE_DEPENDENCY_FAILURE: "1" }).status, 42);
  unchanged(f);
});

test("fresh installation preserves service identity and installs the exact validated Node binary", (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const unit = fs.readFileSync(f.unit, "utf8");
  assert.ok(
    unit.includes(
      `ExecStart=${path.join(f.bin, "node")} /opt/perimeter-control/index.js`,
    ),
  );
  assert.match(unit, /User=perimeter-control\nGroup=perimeter-control/);
  assert.match(
    unit,
    /EnvironmentFile=\/etc\/perimeter-control\/perimeter-control.env/,
  );
  assert.doesNotMatch(unit, /ReadWritePaths|cache|Resolume/i);
  assert.equal(
    fs.statSync(path.join(f.etc, "perimeter-service-account.json")).mode &
      0o777,
    0o640,
  );
  assert.equal(
    fs.statSync(path.join(f.etc, "perimeter-control.env")).mode & 0o777,
    0o640,
  );
  const commands = f.commands();
  assert.deepEqual(
    commands.filter(({ name }) => name === "systemctl").map(({ args }) => args),
    [
      ["daemon-reload"],
      ["enable", "perimeter-control"],
      ["restart", "perimeter-control"],
    ],
  );
  const installs = commands.filter(
    ({ name, args }) => name === "corepack" && args.includes("install"),
  );
  assert.equal(installs.length, 2);
  assert.notEqual(
    installs[0].cwd,
    f.app,
    "frozen dependencies prepared outside installation",
  );
  assert.equal(installs[1].cwd, installs[0].cwd);
  assert.ok(installs[1].args.includes("--offline"));
  const store = (command) =>
    command.args[command.args.indexOf("--store-dir") + 1];
  assert.ok(path.isAbsolute(store(installs[0])));
  assert.equal(store(installs[0]), store(installs[1]));
  assert.equal(fs.existsSync(installs[0].cwd), false);
  assert.equal(
    fs.readFileSync(
      path.join(f.app, "node_modules/fixture-dependency"),
      "utf8",
    ),
    "synthetic",
  );
  const firstMutation = commands.findIndex(({ name }) =>
    ["useradd", "install"].includes(name),
  );
  assert.ok(firstMutation > commands.indexOf(installs[1]));
});

test("upgrade prunes only the five named obsolete JS files and preserves operator files", (t) => {
  const f = fixture(t);
  fs.mkdirSync(f.app);
  fs.mkdirSync(f.etc);
  for (const file of retired)
    fs.writeFileSync(path.join(f.app, file), "obsolete");
  const preserved = [
    [path.join(f.app, "operator.js"), "operator code"],
    [path.join(f.app, "package-lock.json"), "old unmanaged lock"],
    [
      path.join(f.etc, "perimeter-control.env"),
      "PERIMETER_RESOLUME_ENABLED=true\nPERIMETER_BRIGHTNESS_ENABLED=false\n",
    ],
    [path.join(f.etc, "overlay-ssh-key"), "synthetic-unused-key"],
  ];
  const oldCache = path.join(f.root, "old-media-cache");
  fs.mkdirSync(oldCache);
  preserved.push([path.join(oldCache, "asset.mp4"), "synthetic media"]);
  for (const [file, content] of preserved) fs.writeFileSync(file, content);
  fs.unlinkSync(path.join(f.app, "geometry.js"));
  fs.symlinkSync(
    path.join(oldCache, "asset.mp4"),
    path.join(f.app, "geometry.js"),
  );
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = f.run({ FIXTURE_EXISTING_USER: "1" });
    assert.equal(result.status, 0, result.stderr);
  }
  for (const file of retired)
    assert.equal(fs.existsSync(path.join(f.app, file)), false);
  for (const [file, content] of preserved)
    assert.equal(fs.readFileSync(file, "utf8"), content);
  const pruned = f
    .commands()
    .filter(
      ({ name, args }) =>
        name === "rm" &&
        args[0] === "-f" &&
        args.some((arg) => arg.startsWith(`${f.app}/`)),
    );
  assert.deepEqual(
    pruned.map(({ args }) => path.basename(args.at(-1))).sort(),
    [...retired, ...retired].toSorted(),
  );
  assert.ok(
    pruned.every(({ args }) => args[0] === "-f" && !args.includes("-r")),
  );
  assert.deepEqual(
    f
      .commands()
      .filter(
        ({ name, args }) =>
          name === "rm" &&
          args[0] === "-rf" &&
          args.some((arg) => arg.startsWith(`${f.app}/`)),
      )
      .map(({ args }) => args.at(-1)),
    [path.join(f.app, "node_modules"), path.join(f.app, "node_modules")],
  );
  assert.equal(
    f.commands().some(({ name }) => name === "useradd"),
    false,
  );
});

for (const overrides of [
  { FIXTURE_DEPENDENCY_FAILURE: "1" },
  { FIXTURE_OFFLINE_FAILURE: "1" },
  { FIXTURE_BAD_LINK: "external" },
  { FIXTURE_BAD_LINK: "absolute" },
  { FIXTURE_IMPORT_FAILURE: "1" },
])
  test(`failed preparation leaves an existing installation untouched: ${Object.keys(overrides)[0]}=${Object.values(overrides)[0]}`, (t) => {
    const f = fixture(t);
    fs.mkdirSync(f.app);
    fs.mkdirSync(f.etc);
    const files = [
      [path.join(f.app, "index.js"), "old runtime"],
      [path.join(f.app, "overlay.js"), "old media module"],
      [path.join(f.app, "node_modules/old-dependency"), "old dependency"],
      [path.join(f.etc, "perimeter-control.env"), "operator configuration"],
      [
        path.join(f.etc, "perimeter-service-account.json"),
        "old synthetic account",
      ],
      [f.unit, "old unit"],
    ];
    fs.mkdirSync(path.join(f.app, "node_modules"));
    for (const [file, content] of files) fs.writeFileSync(file, content);
    assert.notEqual(f.run(overrides).status, 0);
    for (const [file, content] of files)
      assert.equal(fs.readFileSync(file, "utf8"), content);
    assert.equal(
      f
        .commands()
        .some(({ name }) => ["install", "useradd", "systemctl"].includes(name)),
      false,
    );
  });

test("gateway package policy rejects another manager without invoking it", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(gateway, "package.json"), "utf8"),
  );
  assert.equal(pkg.engines.node, ">=22");
  assert.equal(pkg.packageManager, "pnpm@12.16.1");
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), [
    "firebase-admin",
    "suncalc",
  ]);
  assert.equal(fs.existsSync(path.join(gateway, "package-lock.json")), false);
  const rejected = spawnSync("/bin/bash", ["-c", pkg.scripts.preinstall], {
    env: {
      PATH: path.dirname(process.execPath),
      npm_config_user_agent: "other/1.0.0",
      NODE_OPTIONS: "--max-old-space-size=512",
    },
    encoding: "utf8",
  });
  assert.equal(rejected.status, 1);
  const accepted = spawnSync("/bin/bash", ["-c", pkg.scripts.preinstall], {
    env: {
      PATH: path.dirname(process.execPath),
      npm_config_user_agent: "pnpm/12.16.1",
      NODE_OPTIONS: "--max-old-space-size=512",
    },
    encoding: "utf8",
  });
  assert.equal(accepted.status, 0);
});
