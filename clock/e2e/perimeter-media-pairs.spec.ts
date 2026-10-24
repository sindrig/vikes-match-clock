import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  clearEmulatorData,
  ensureEmulatorUser,
  expect,
  loginWithEmulatorUser,
  TEST_LISTEN_PREFIX,
  test,
} from "./fixtures/test-helpers";
import type { CurrentAsset, PerimeterFileOverlay } from "../src/types";

const image = readFileSync(
  resolve(__dirname, "../src/perimeter/__fixtures__/crest.png"),
);

async function readState<T>(path: string): Promise<T> {
  const response = await fetch(
    `http://127.0.0.1:9000/states/${TEST_LISTEN_PREFIX}/${path}.json?ns=vikes-match-clock-test`,
  );
  expect(response.ok).toBe(true);
  return (await response.json()) as T;
}

test.beforeAll(async () => {
  await ensureEmulatorUser();
});

test("selects one media triple for the main screen and both perimeter targets", async ({
  page,
}) => {
  await clearEmulatorData();
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("clock_sync", "true");
  });
  await page.goto("/");
  await loginWithEmulatorUser(page);
  await page.getByRole("button", { name: "Myndefni", exact: true }).click();

  await page.locator('.upload-manager input[type="file"]').setInputFiles({
    name: "triple-main.png",
    mimeType: "image/png",
    buffer: image,
  });
  await expect(page.locator(".upload-manager")).toContainText(
    "Uploaded Successfully",
  );
  await page.getByRole("button", { name: "Jaðarefni", exact: true }).click();
  await page.getByRole("button", { name: "Nýtt jaðarefni" }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Nafn").fill("Þrír skjáir");
  for (const target of ["48", "40"]) {
    await modal.getByLabel(`${target} skjáir`).setInputFiles({
      name: `${target}.png`,
      mimeType: "image/png",
      buffer: image,
    });
  }
  await modal.getByRole("button", { name: "Velja úr myndefni" }).click();
  await modal.getByAltText("triple-main.png").click();
  await modal.getByRole("button", { name: "Vista", exact: true }).click();
  await expect(modal).toBeHidden();

  const card = page
    .locator(".media-pair-card")
    .filter({ hasText: "Þrír skjáir" });
  await expect(card).toContainText("Stórskjár: triple-main.png");
  await card.getByRole("button", { name: "Sýna", exact: true }).click();
  await expect
    .poll(() => readState<CurrentAsset | null>("controller/currentAsset"))
    .toMatchObject({
      asset: { type: "IMAGE", name: "triple-main.png" },
    });
  await expect
    .poll(() => readState<PerimeterFileOverlay | null>("perimeter/overlay"))
    .toMatchObject({ version: 1, columns: [{ durationMs: 10000 }] });
  const main = await readState<CurrentAsset>("controller/currentAsset");
  const overlay = await readState<PerimeterFileOverlay>("perimeter/overlay");
  expect(Object.keys(overlay.columns[0]!.files)).toEqual(["2", "4"]);
  expect(await readState<boolean>("controller/playing")).toBe(false);
  await expect(page.locator(".overlay-container img")).toBeVisible();

  // Detaching edits the saved entry, not the currently displayed media.
  await card.getByRole("button", { name: "Stórskjár", exact: true }).click();
  await modal.getByRole("button", { name: "Aftengja stórskjá" }).click();
  await modal.getByRole("button", { name: "Vista", exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(card).not.toContainText("Stórskjár:");
  await card.getByRole("button", { name: "Sýna", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await readState<PerimeterFileOverlay>("perimeter/overlay")).id,
    )
    .not.toBe(overlay.id);
  expect(await readState<CurrentAsset>("controller/currentAsset")).toEqual(
    main,
  );

  await page.getByRole("button", { name: "Hreinsa alla skjái" }).click();
  await expect
    .poll(() => readState<CurrentAsset | null>("controller/currentAsset"))
    .toBeNull();
  await expect
    .poll(() => readState<PerimeterFileOverlay | null>("perimeter/overlay"))
    .toBeNull();
});
