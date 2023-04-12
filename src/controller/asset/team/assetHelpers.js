import { storage } from "../../../firebase";
import assetTypes from "../AssetTypes";

export const getPlayerAssetObject = async ({ player, teamName, overlay }) => {
  if (!player.name || !player.number) {
    return null;
  }
  const playerAssetObjectFromPromise = async (p, fallback) => {
    try {
      return {
        type: assetTypes.PLAYER,
        key: await p,
        name: player.name,
        number: player.number,
        overlay: overlay || { text: "" },
        teamName,
      };
    } catch (e) {
      return await fallback();
    }
  };
  return await playerAssetObjectFromPromise(
    storage.ref(`players/${player.id}-fagn.png`).getDownloadURL(),
    () =>
      playerAssetObjectFromPromise(
        storage.ref(`players/${player.id}.png`).getDownloadURL(),
        () => ({
          type: assetTypes.NO_IMAGE_PLAYER,
          key: `custom-${player.number}-${player.name}`,
          name: player.name,
          number: player.number,
          overlay: overlay || { text: "" },
          teamName,
        })
      )
  );
};
