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

// Native DOM controls: actual component/CSS and login function, with a modeled
// Page and presence hook. This does NOT run Playwright or a real browser.
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
const login = helpers.statements.find(
  (node) =>
    ts.isFunctionDeclaration(node) &&
    node.name?.text === "loginWithEmulatorUser",
);
assert(
  login,
  "execute the actual login helper, including its wait/click order",
);

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

// Metacharacters also prove the owned venue label is escaped literally.
const venueLabel = "Test Location owned.[a]+(0)$";
const label = `${venueLabel} Display 1`;

for (const [initialCount, clickCount] of [
  [0, 0],
  [1, 1],
  [2, 2],
  [0, 1],
  [0, 2],
  [1, 2],
]) {
  test(`native DOM / Page model: scoreboard presence ${initialCount} → ${clickCount}`, async (t) => {
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
          label,
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
          .join("") + "<button>Innskrá</button><button>Biðröð</button>";
    };
    render();
    let visible = false;
    let clicked = false;
    let writes = 0;
    const expectedName = (n) => label + (n > 0 ? ` ${n} tengd` : "");
    const page = {
      getByPlaceholder: () => ({
        waitFor: async () => {},
        fill: async () => {},
      }),
      waitForFunction: async () => {},
      evaluate: async () => "owned-uid",
      getByRole(role, options) {
        const scoreboard =
          options.name instanceof RegExp || options.name === label;
        // Resolve afresh for each operation, as a Playwright Locator does.
        const resolve = () => getByRole(body, role, options);
        return {
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
            }
          },
          async click() {
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
            }
          },
        };
      },
    };
    const { loginWithEmulatorUser } = load(login.getText(helpers), {
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
    });
    await loginWithEmulatorUser(page);
    assert(clicked, "login selected exactly the owned scoreboard");
    assert.equal(writes, 1);
    if (initialCount === 0 && clickCount > 0)
      assert.throws(
        () => getByRole(body, "button", { name: label, exact: true }),
        "the old exact locator loses this actual accessible name",
      );
  });
}
