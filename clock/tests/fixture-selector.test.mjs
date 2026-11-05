import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

import { getByRole } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

// Actual component/CSS, login, locator and reconnect callback; Page/presence
// are modeled. These controls do not run Playwright or prove browser hit testing.
const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const stylesheet = read("../src/controller/Controller.css");
const controller = ts.createSourceFile(
  "Controller.tsx",
  read("../src/controller/Controller.tsx"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const component = controller.statements.find(
  (node) =>
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(
      (declaration) =>
        declaration.name.getText(controller) === "ScreenSelectorButton",
    ),
);
assert(component, "use the actual component declaration");
const helpers = ts.createSourceFile(
  "test-helpers.ts",
  read("../e2e/fixtures/test-helpers.ts"),
  ts.ScriptTarget.Latest,
  true,
);
function helper(name) {
  const declaration = helpers.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  assert(declaration, `execute the actual ${name} helper`);
  return declaration.getText(helpers);
}
const login = helper("loginWithEmulatorUser");
const selector = helper("getOwnedScreenButton");
const reconnectSpec = ts.createSourceFile(
  "disconnect-logout.spec.ts",
  read("../e2e/disconnect-logout.spec.ts"),
  ts.ScriptTarget.Latest,
  true,
);
let reconnect;
function findReconnect(node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(reconnectSpec) === "test" &&
    node.arguments[0]?.text ===
      "disconnect screen returns to selector, logout returns to login form"
  ) {
    reconnect = node.arguments[1].getText(reconnectSpec);
  }
  ts.forEachChild(node, findReconnect);
}
findReconnect(reconnectSpec);
assert(reconnect, "execute the actual disconnect/logout callback");

function load(source, globals) {
  const module = { exports: {} };
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require,
    ...globals,
  });
  return module.exports;
}

// Metacharacters prove the owned venue label is escaped literally.
const venueLabel = "Test Location owned.[a]+(0)$";
const label = `${venueLabel} Display 1`;
const transitions = [
  [0, 0],
  [1, 1],
  [2, 2],
  [0, 1],
  [0, 2],
  [1, 2],
];

async function exercise(
  t,
  initialCount,
  clickCount,
  {
    journey = "login",
    locatorSource = selector,
    bodySource,
    missing = false,
  } = {},
) {
  let count = initialCount;
  const { ScreenSelectorButton } = load(
    `${component.getText(controller)}\nexports.ScreenSelectorButton = ScreenSelectorButton;`,
    { useConnectedScreens: () => count },
  );
  const dom = new JSDOM(`<style>${stylesheet}</style><main></main>`);
  t.after(() => dom.window.close());
  const body = dom.window.document.body;
  const render = () => {
    body.querySelector("main").innerHTML =
      [
        ...(missing ? [] : [label]),
        `${venueLabel} Perimeter`,
        `${venueLabel} Display 10`,
        "Test Location foreign Display 1",
        "Test Location ownedXa0 Display 1",
        `${label} extra`,
        `${label} tengd`,
        `${label} 1 tengd extra`,
        `${label} -1 tengd`,
        `foreign ${label}`,
      ]
        .map((name, index) =>
          renderToStaticMarkup(
            createElement(ScreenSelectorButton, {
              locationKey: String(index),
              label: name,
              onClick() {},
            }),
          ),
        )
        .join("") +
      "<button>Innskrá</button><button>Biðröð</button>" +
      "<button>Aftengjast skjá</button><button>Útskrá</button>";
  };
  render();
  let visible = false;
  let clicked = false;
  let writes = 0;
  const events = [];
  const expectedName = (n) => label + (n > 0 ? ` ${n} tengd` : "");
  const page = {
    getByPlaceholder: () => ({
      waitFor: async () => {},
      fill: async () => {},
      event: "email",
    }),
    getByText: () => ({ event: "selector" }),
    waitForFunction: async () => {},
    evaluate: async () => "owned-uid",
    getByRole(role, options) {
      const scoreboard =
        options.name instanceof RegExp || options.name === label;
      // Resolve afresh for each operation, as a Playwright Locator does.
      const resolve = () => getByRole(body, role, options);
      return {
        resolve,
        event: options.name,
        async waitFor() {
          const button = resolve();
          if (scoreboard) {
            assert.equal(
              button,
              getByRole(body, "button", {
                name: expectedName(initialCount),
                exact: true,
              }),
            );
            visible = true;
            count = clickCount;
            render(); // Presence lands after visibility, before click.
            events.push("screen-wait");
          } else events.push(options.name);
        },
        async click(clickOptions) {
          assert.notEqual(
            clickOptions?.force,
            true,
            "force click is forbidden",
          );
          const button = resolve();
          if (scoreboard) {
            assert(visible, "helper waited for the scoreboard");
            assert.equal(
              button,
              getByRole(body, "button", {
                name: expectedName(clickCount),
                exact: true,
              }),
            );
            button.click();
            clicked = true;
            events.push("screen-click");
          } else events.push(options.name);
        },
      };
    },
  };
  const globals = {
    TEST_LOCATION_LABEL: venueLabel,
    TEST_EMAIL: "owned@example.test",
    TEST_PASSWORD: "synthetic",
    TEST_LISTEN_PREFIX: "owned-venue",
    verifiedPages: new WeakSet([page]),
    RegExp,
    emulatorFixture: {
      async database(method, path, value) {
        assert.equal(method, "PUT");
        assert.equal(path, "auth/owned-uid/owned-venue");
        assert.equal(value, true);
        writes++;
      },
    },
    expect: (locator) => ({
      async toBeVisible() {
        locator.resolve?.();
        events.push(locator.event);
      },
    }),
  };
  if (journey === "login") {
    const { loginWithEmulatorUser } = load(
      `${locatorSource}\n${bodySource ?? login}`,
      globals,
    );
    await loginWithEmulatorUser(page);
    assert.equal(writes, 1);
  } else {
    const { run } = load(
      `${locatorSource}\nexports.run = ${bodySource ?? reconnect};`,
      {
        ...globals,
        loginWithEmulatorUser: async () => events.push("login"),
      },
    );
    await run({ page });
    assert.equal(writes, 0, "reconnect must not log in or grant again");
    assert.deepEqual(events, [
      "login",
      "Biðröð",
      "Aftengjast skjá",
      "selector",
      "screen-wait",
      "screen-click",
      "Biðröð",
      "Útskrá",
      "email",
      "Innskrá",
    ]);
  }
  assert(clicked, `${journey} selected exactly the owned scoreboard`);
  if (initialCount === 0 && clickCount > 0)
    assert.throws(
      () => getByRole(body, "button", { name: label, exact: true }),
      "the old exact locator loses this actual accessible name",
    );
}

for (const [initialCount, clickCount] of transitions) {
  test(`native DOM / Page model: scoreboard presence ${initialCount} → ${clickCount}`, async (t) => {
    await exercise(t, initialCount, clickCount);
  });
  test(`native DOM / Page model: actual reconnect presence ${initialCount} → ${clickCount}`, async (t) => {
    await exercise(t, initialCount, clickCount, { journey: "reconnect" });
  });
}

for (const journey of ["login", "reconnect"]) {
  test(`native DOM / Page model: ${journey} rejects absent owned screen with decoys`, async (t) => {
    await assert.rejects(
      exercise(t, 0, 1, { journey, missing: true }),
      /Unable to find/,
    );
  });
  test(`native DOM / Page model: ${journey} detects a broad selector regression`, async (t) => {
    const expression = selector.slice(
      selector.indexOf("new RegExp("),
      selector.lastIndexOf("),") + 1,
    );
    assert(expression.startsWith("new RegExp("));
    const locatorSource = selector.replace(
      expression,
      'new RegExp("Test Location")',
    );
    assert.notEqual(locatorSource, selector);
    await assert.rejects(
      exercise(t, 0, 1, { journey, locatorSource }),
      /Found multiple/,
    );
  });
  test(`native DOM / Page model: ${journey} detects forced click in actual source`, async (t) => {
    const original = journey === "login" ? login : reconnect;
    const bodySource = original.replace(
      "await screenButton.click();",
      "await screenButton.click({ force: true });",
    );
    assert.notEqual(bodySource, original);
    await assert.rejects(
      exercise(t, 0, 1, { journey, bodySource }),
      /force click is forbidden/,
    );
  });
}
