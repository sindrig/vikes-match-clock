import assetTypes from "./AssetTypes";
import { Asset } from "../../types";

interface GapiClient {
  init(config: { apiKey: string; discoveryDocs: string[] }): Promise<void>;
  request(config: {
    path: string;
    params: Record<string, string>;
    method: string;
  }): Promise<GapiResponse>;
}

interface GapiResponse {
  result: {
    items: Array<{
      contentDetails: {
        videoId: string;
      };
    }>;
  };
}

interface Gapi {
  client: GapiClient;
  load(api: string, callback: () => void): void;
}

declare global {
  interface Window {
    gapi: Gapi;
  }
}

export function addVideosFromPlaylist(
  playlistId: string,
  addFn: (asset: Asset) => void,
): void {
  const start = () => {
    void window.gapi.client
      .init({
        apiKey: "AIzaSyDcoBecSRiDkx_c7jYEsX72gazus1DIBlE",
        discoveryDocs: ["https://people.googleapis.com/$discovery/rest"],
      })
      .then(() =>
        window.gapi.client.request({
          path: "/youtube/v3/playlistItems",
          params: {
            maxResults: "50",
            part: "contentDetails",
            playlistId,
          },
          method: "GET",
        }),
      )
      .catch((error: Error) => console.log(error))
      .then((response) => {
        if (response?.result?.items) {
          response.result.items.forEach(({ contentDetails: { videoId } }) =>
            addFn({
              type: assetTypes.URL,
              key: `https://www.youtube.com/watch?v=${videoId}`,
            }),
          );
        }
      });
  };
  window.gapi.load("client", start);
}

export default {};
