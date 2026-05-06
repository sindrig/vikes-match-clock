import { client } from "./client/client.gen";
import apiConfig from "../apiConfig";

const configuredClient = client as unknown as {
  setConfig: (config: { baseUrl: string }) => void;
};

configuredClient.setConfig({
  baseUrl: apiConfig.gateWayUrl,
});

export { client };
