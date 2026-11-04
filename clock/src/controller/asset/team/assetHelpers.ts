import { storageHelpers } from "../../../firebase";
import assetTypes from "../AssetTypes";
import type {
  AssetOverlay,
  MotmAsset,
  Player,
  PlayerCardAsset,
} from "../../../types";

interface PlayerAssetParams {
  listenPrefix: string;
  player: Player;
  teamName: string;
  overlay?: AssetOverlay;
  preferExt?: string;
  preferType?: string;
}

export const getPlayerAssetObject = async ({
  listenPrefix,
  player,
  teamName,
  overlay,
  preferExt,
  preferType,
}: PlayerAssetParams): Promise<PlayerCardAsset | null> => {
  if (!player.name || player.id === undefined) {
    return null;
  }
  const imageType = preferType || "png";
  const playerAssetObjectFromPromise = async (
    p: Promise<string>,
    fallback: () => Promise<PlayerCardAsset | null>,
  ): Promise<PlayerCardAsset | null> => {
    try {
      return {
        type: assetTypes.PLAYER,
        key: await p,
        name: player.name,
        ...(player.number !== undefined ? { number: player.number } : {}),
        ...(player.role !== undefined ? { role: player.role } : {}),
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
      storageHelpers.getDownloadURL(
        `${listenPrefix}/players/${player.id}-${preferExt}.${imageType}`,
      ),
      () => getPlayerAssetObject(fallbackAttrs),
    );
  }
  return await playerAssetObjectFromPromise(
    storageHelpers.getDownloadURL(
      `${listenPrefix}/players/${player.id}.${imageType}`,
    ),
    () =>
      Promise.resolve({
        type: assetTypes.NO_IMAGE_PLAYER,
        key: `custom-${player.number ?? "no-number"}-${player.name}`,
        name: player.name,
        ...(player.number !== undefined ? { number: player.number } : {}),
        ...(player.role !== undefined ? { role: player.role } : {}),
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
}: MOTMParams): Promise<MotmAsset | null> => {
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
