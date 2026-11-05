import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
let compiler;
let terminationSignal;

const signalHandlers = new Map(
  ["SIGINT", "SIGTERM"].map((signal) => [
    signal,
    () => {
      terminationSignal ??= signal;
      compiler?.kill(signal);
    },
  ]),
);

function checkInterrupted() {
  if (terminationSignal) {
    throw new Error(`Build interrupted by ${terminationSignal}`);
  }
}

function runCompiler(compilerPath, args) {
  checkInterrupted();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [compilerPath, ...args], {
      cwd: packageDirectory,
      stdio: "inherit",
    });
    compiler = child;
    let childError;
    child.once("error", (error) => {
      childError = error;
    });
    child.once("close", (code, signal) => {
      compiler = undefined;
      if (childError) {
        reject(childError);
      } else if (signal) {
        terminationSignal ??= signal;
        reject(new Error(`TypeScript compiler terminated by ${signal}`));
      } else if (code !== 0) {
        process.exitCode = code ?? 1;
        reject(new Error(`TypeScript compiler exited with status ${code}`));
      } else {
        resolve();
      }
    });
  });
}

try {
  if (process.argv.length > 2) {
    throw new Error(
      "Functions build is one-shot and accepts no arguments, including --watch. Re-run pnpm build after changes.",
    );
  }
  const compilerPath = require.resolve("typescript/bin/tsc");
  for (const [signal, handler] of signalHandlers) {
    process.on(signal, handler);
  }

  await rm(new URL("../lib", import.meta.url), {
    recursive: true,
    force: true,
  });
  await runCompiler(compilerPath, ["--project", "tsconfig.json", "--noEmit"]);
  await runCompiler(compilerPath, ["--project", "tsconfig.build.json"]);
  checkInterrupted();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode ||= 1;
} finally {
  for (const [signal, handler] of signalHandlers) {
    process.off(signal, handler);
  }
  if (terminationSignal) {
    process.kill(process.pid, terminationSignal);
  }
}
