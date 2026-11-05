import type { Page } from "@playwright/test";

import type { LocalFixture } from "./local-fixture";

// Observe the actual SDK transport; do not replace the UI's callable or its
// authorization. Keep the page alive until a submitted handler returns. Closing
// a page or losing a response is ambiguous and cannot certify server completion.
export function observeFixtureMutations(page: Page, fixture: LocalFixture) {
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      request.method() !== "POST" ||
      url.href !==
        "http://127.0.0.1:5001/vikes-match-clock-test/us-central1/adminWrite"
    )
      return;
    void fixture
      .trackMutation(async () => {
        const response = await request.response();
        if (
          !response ||
          (await response.finished()) ||
          response.status() !== 200
        )
          throw new Error("Unresolved fixture callable response.");
        const body: unknown = await response.json();
        if (
          body === null ||
          typeof body !== "object" ||
          Array.isArray(body) ||
          !("result" in body) ||
          body.result === null ||
          typeof body.result !== "object" ||
          !("success" in body.result) ||
          body.result.success !== true
        )
          throw new Error("Invalid fixture callable completion response.");
      })
      .catch(() => {
        // The fixture retains the unresolved producer and fails its barrier.
        // Do not throw secrets or unhandled rejections from a browser event.
      });
  });
}
