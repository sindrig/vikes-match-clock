import { storage } from "../../../firebase";
import assetTypes from "../AssetTypes";

export const getPlayerAssetObject = async ({
  listenPrefix,
  player,
  teamName,
  overlay,
  preferExt,
  preferType,
}) => {
  if (!player.name) {
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
        role: player.role,
        overlay: overlay || { text: "" },
        teamName,
      };
    } catch (e) {
      return await fallback();
    }
  };
  if (preferExt) {
    const fallbackAttrs = { player, teamName, overlay, listenPrefix };
    if (preferType) {
      // Fallback from PLAYER-EXT.TYPE to PLAYER-EXT.png
      fallbackAttrs.preferExt = preferExt;
    }
    return await playerAssetObjectFromPromise(
      storage
        .ref(`${listenPrefix}/players/${player.id}-${preferExt}.${imageType}`)
        .getDownloadURL(),
      () => getPlayerAssetObject(fallbackAttrs),
    );
  }
  return await playerAssetObjectFromPromise(
    storage
      .ref(`${listenPrefix}/players/${player.id}.${imageType}`)
      .getDownloadURL(),
    () => ({
      type: assetTypes.NO_IMAGE_PLAYER,
      key: `custom-${player.number}-${player.name}`,
      name: player.name,
      number: player.number,
      role: player.role,
      overlay: overlay || { text: "" },
      teamName,
    }),
  );
};

export const getMOTMAsset = async ({ listenPrefix, player, teamName }) => {
  const playerAssetObject = await getPlayerAssetObject({
    listenPrefix,
    player,
    teamName,
    preferExt: "fagn",
  });
  return {
    ...playerAssetObject,
    type: assetTypes.MOTM,
    originalAssetType: playerAssetObject.type,
  };
};
