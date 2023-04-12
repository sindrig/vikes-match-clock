import { storage } from "../../../firebase";
import assetTypes from "../AssetTypes";

export const getPlayerAssetObject = async ({
  player,
  teamName,
  overlay,
  preferExt,
}) => {
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
  if (preferExt) {
    return await playerAssetObjectFromPromise(
      storage.ref(`players/${player.id}-${preferExt}.png`).getDownloadURL(),
      () => getPlayerAssetObject({ player, teamName, overlay })
    );
  }
  return await playerAssetObjectFromPromise(
    storage.ref(`players/${player.id}.png`).getDownloadURL(),
    () => ({
      type: assetTypes.NO_IMAGE_PLAYER,
      key: `custom-${player.number}-${player.name}`,
      name: player.name,
      number: player.number,
      overlay: overlay || { text: "" },
      teamName,
    })
  );
};
