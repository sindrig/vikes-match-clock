// Test-only entrypoint: inspect the actual served selection before App mounts.
// The fixture page blocks nonlocal requests while loading this probe.
import { app, auth } from "../../src/firebase";

const target = {
  projectId: app.options.projectId,
  databaseURL: app.options.databaseURL,
  storageBucket: app.options.storageBucket,
  auth: auth.emulatorConfig,
};

declare global {
  interface Window {
    __e2eEmulatorTarget?: typeof target;
  }
}

window.__e2eEmulatorTarget = target;
