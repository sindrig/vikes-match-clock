import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "../clock-api/v3/openapi.json",
  output: "src/api/client",
  plugins: ["@hey-api/typescript", "@hey-api/sdk", "@hey-api/client-fetch"],
});
