import { storage } from "../../../firebase";
import assetTypes from "../AssetTypes";

export const getPlayerAssetObject = async ({ player, teamName, overlay }) => {
  if (!player.name || !player.number) {
    return null;
  }
  return storage
    .ref(`players/${player.id}.png`)
    .getDownloadURL()
    .then((key) => ({
      type: assetTypes.PLAYER,
      key,
      name: player.name,
      number: player.number,
      overlay: overlay || { text: "" },
      teamName,
    }))
    .catch(() => ({
      type: assetTypes.NO_IMAGE_PLAYER,
      key: `custom-${player.number}-${player.name}`,
      name: player.name,
      number: player.number,
      overlay: overlay || { text: "" },
      teamName,
    }));
};
