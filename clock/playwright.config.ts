import { defineConfig, devices } from "@playwright/test";

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Use single worker in CI for stability with Firebase emulator
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // In CI, Vite is started separately before running tests
  // Locally, Playwright starts Vite via webServer config
  webServer: process.env.CI
    ? undefined
    : {
        command: "pnpm start",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120 * 1000,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          PORT: String(port),
          VITE_USE_EMULATOR: process.env.VITE_USE_EMULATOR || "",
        },
      },
});
