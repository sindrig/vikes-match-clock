import { storage } from "../../../firebase";
import assetTypes from "../AssetTypes";
import { Player } from "../../../types";

interface Overlay {
  text: string;
  blink?: boolean;
  effect?: string;
}

interface PlayerAssetParams {
  listenPrefix: string;
  player: Player;
  teamName: string;
  overlay?: Overlay;
  preferExt?: string;
  preferType?: string;
}

interface PlayerAsset {
  type: string;
  key: string;
  name: string;
  number?: number | string;
  role?: string;
  overlay: Overlay;
  teamName: string;
  originalAssetType?: string;
}

export const getPlayerAssetObject = async ({
  listenPrefix,
  player,
  teamName,
  overlay,
  preferExt,
  preferType,
}: PlayerAssetParams): Promise<PlayerAsset | null> => {
  if (!player.name) {
    return null;
  }
  const imageType = preferType || "png";
  const playerAssetObjectFromPromise = async (
    p: Promise<string>,
    fallback: () => Promise<PlayerAsset | null>,
  ): Promise<PlayerAsset | null> => {
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
    } catch {
      return await fallback();
    }
  };
  if (preferExt) {
    const fallbackAttrs: PlayerAssetParams = {
      player,
      teamName,
      overlay,
      listenPrefix,
      ...(preferType ? { preferExt } : {}),
    };
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
    () => Promise.resolve({
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

interface MOTMParams {
  listenPrefix: string;
  player: Player;
  teamName: string;
}

export const getMOTMAsset = async ({
  listenPrefix,
  player,
  teamName,
}: MOTMParams): Promise<PlayerAsset | null> => {
  const playerAssetObject = await getPlayerAssetObject({
    listenPrefix,
    player,
    teamName,
    preferExt: "fagn",
  });
  
  if (!playerAssetObject) {
    return null;
  }
  
  return {
    ...playerAssetObject,
    type: assetTypes.MOTM,
    originalAssetType: playerAssetObject.type,
  };
};
