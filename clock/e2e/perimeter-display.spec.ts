import { expect, request } from "@playwright/test";
import { secondStadiumWebConfiguration } from "../src/perimeter/fixtures";
import {
  clearEmulatorData,
  TEST_LISTEN_PREFIX,
  test,
} from "./fixtures/test-helpers";

const OWNER_HEADERS = { Authorization: "Bearer owner" };

test("public perimeter target starts, survives refresh, and disconnects", async ({
  clockPage,
}) => {
  await clearEmulatorData();
  const apiContext = await request.newContext();
  try {
    await apiContext.patch(
      `http://127.0.0.1:9000/locations/${TEST_LISTEN_PREFIX}.json?ns=vikes-match-clock-test`,
      {
        headers: OWNER_HEADERS,
        data: { perimeterDisplay: secondStadiumWebConfiguration },
      },
    );
  } finally {
    await apiContext.dispose();
  }

  await clockPage.addInitScript((listenPrefix) => {
    localStorage.clear();
    localStorage.setItem("clock_listenPrefix", listenPrefix);
    localStorage.setItem(
      "clock_displayTarget",
      JSON.stringify({ kind: "perimeter" }),
    );
  }, TEST_LISTEN_PREFIX);
  await clockPage.goto("/");

  await expect(clockPage.getByTestId("perimeter-display")).toBeVisible();
  await expect(clockPage.getByTestId("perimeter-canvas")).toHaveAttribute(
    "width",
    "3840",
  );
  await expect(clockPage.getByTestId("perimeter-canvas")).toHaveAttribute(
    "height",
    "108",
  );

  const refreshContext = await request.newContext();
  try {
    await refreshContext.patch(
      `http://127.0.0.1:9000/states/${TEST_LISTEN_PREFIX}/controller.json?ns=vikes-match-clock-test`,
      {
        headers: OWNER_HEADERS,
        data: { refreshToken: "restart-1" },
      },
    );
  } finally {
    await refreshContext.dispose();
  }
  await expect(clockPage.getByTestId("perimeter-display")).toBeVisible();

  await clockPage.getByRole("button", { name: "Aftengja skjá" }).click();
  await expect(
    clockPage.getByText("Veldu skjá til að birta stigatöflu"),
  ).toBeVisible();
});
