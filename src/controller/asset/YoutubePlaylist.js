import assetTypes from "./AssetTypes";

export function addVideosFromPlaylist(playlistId, addFn) {
  const start = () =>
    window.gapi.client
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
        })
      )
      .catch((error) => console.log(error))
      .then(({ result: { items } }) =>
        items.forEach(({ contentDetails: { videoId } }) =>
          addFn({
            type: assetTypes.URL,
            key: `https://www.youtube.com/watch?v=${videoId}`,
          })
        )
      );
  window.gapi.load("client", start);
}

export default {};
