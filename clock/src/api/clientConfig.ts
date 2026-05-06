import { client } from "./client/client.gen";
import apiConfig from "../apiConfig";

client.setConfig({
  baseUrl: apiConfig.gateWayUrl,
});

export { client };
