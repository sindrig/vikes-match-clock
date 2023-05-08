import { storage } from "../../../firebase";
import assetTypes from "../AssetTypes";

export const getPlayerAssetObject = async ({
  player,
  teamName,
  overlay,
  preferExt,
  preferType,
}) => {
  if (!player.name || !player.number) {
    return null;
  }
  const imageType = preferType || "png";
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
    const fallbackAttrs = { player, teamName, overlay };
    if (preferType) {
      // Fallback from PLAYER-EXT.TYPE to PLAYER-EXT.png
      fallbackAttrs.preferExt = preferExt;
    }
    return await playerAssetObjectFromPromise(
      storage
        .ref(`players/${player.id}-${preferExt}.${imageType}`)
        .getDownloadURL(),
      () => getPlayerAssetObject(fallbackAttrs)
    );
  }
  return await playerAssetObjectFromPromise(
    storage.ref(`players/${player.id}.${imageType}`).getDownloadURL(),
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
