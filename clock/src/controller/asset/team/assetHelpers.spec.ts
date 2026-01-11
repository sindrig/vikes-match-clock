import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { getPlayerAssetObject, getMOTMAsset } from "./assetHelpers";
import { storageHelpers } from "../../../firebase";
import assetTypes from "../AssetTypes";

vi.mock("../../../firebase", () => ({
  storageHelpers: {
    getDownloadURL: vi.fn(),
  },
}));

describe("assetHelpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getPlayerAssetObject", () => {
    const mockPlayer = {
      name: "Test Player",
      id: 123,
      number: 10,
      role: "forward",
    };

    it("returns null when player has no name", async () => {
      const result = await getPlayerAssetObject({
        listenPrefix: "viken",
        player: { name: "", id: 1 },
        teamName: "Víkingur R",
      });
      expect(result).toBeNull();
    });

    it("returns null when player has undefined id", async () => {
      const result = await getPlayerAssetObject({
        listenPrefix: "viken",
        player: { name: "Test", id: undefined },
        teamName: "Víkingur R",
      });
      expect(result).toBeNull();
    });

    it("returns PLAYER asset when image exists", async () => {
      (storageHelpers.getDownloadURL as Mock).mockResolvedValue(
        "https://storage.example.com/player.png",
      );

      const result = await getPlayerAssetObject({
        listenPrefix: "viken",
        player: mockPlayer,
        teamName: "Víkingur R",
      });

      expect(result).toEqual({
        type: assetTypes.PLAYER,
        key: "https://storage.example.com/player.png",
        name: "Test Player",
        number: 10,
        role: "forward",
        overlay: { text: "" },
        teamName: "Víkingur R",
      });
      expect(storageHelpers.getDownloadURL).toHaveBeenCalledWith(
        "viken/players/123.png",
      );
    });

    it("returns NO_IMAGE_PLAYER asset when image does not exist", async () => {
      (storageHelpers.getDownloadURL as Mock).mockRejectedValue(
        new Error("Not found"),
      );

      const result = await getPlayerAssetObject({
        listenPrefix: "viken",
        player: mockPlayer,
        teamName: "Víkingur R",
      });

      expect(result).toEqual({
        type: assetTypes.NO_IMAGE_PLAYER,
        key: "custom-10-Test Player",
        name: "Test Player",
        number: 10,
        role: "forward",
        overlay: { text: "" },
        teamName: "Víkingur R",
      });
    });

    it("includes overlay when provided", async () => {
      (storageHelpers.getDownloadURL as Mock).mockResolvedValue(
        "https://storage.example.com/player.png",
      );

      const overlay = { text: "GOAL!", blink: true };
      const result = await getPlayerAssetObject({
        listenPrefix: "viken",
        player: mockPlayer,
        teamName: "Víkingur R",
        overlay,
      });

      expect(result?.overlay).toEqual(overlay);
    });

    it("uses preferExt when provided and image exists", async () => {
      (storageHelpers.getDownloadURL as Mock).mockResolvedValue(
        "https://storage.example.com/player-fagn.png",
      );

      const result = await getPlayerAssetObject({
        listenPrefix: "viken",
        player: mockPlayer,
        teamName: "Víkingur R",
        preferExt: "fagn",
      });

      expect(storageHelpers.getDownloadURL).toHaveBeenCalledWith(
        "viken/players/123-fagn.png",
      );
      expect(result?.key).toBe("https://storage.example.com/player-fagn.png");
    });

    it("falls back to default image when preferExt image not found", async () => {
      (storageHelpers.getDownloadURL as Mock)
        .mockRejectedValueOnce(new Error("Not found"))
        .mockResolvedValueOnce("https://storage.example.com/player.png");

      const result = await getPlayerAssetObject({
        listenPrefix: "viken",
        player: mockPlayer,
        teamName: "Víkingur R",
        preferExt: "fagn",
      });

      expect(storageHelpers.getDownloadURL).toHaveBeenCalledTimes(2);
      expect(storageHelpers.getDownloadURL).toHaveBeenNthCalledWith(
        1,
        "viken/players/123-fagn.png",
      );
      expect(storageHelpers.getDownloadURL).toHaveBeenNthCalledWith(
        2,
        "viken/players/123.png",
      );
      expect(result?.key).toBe("https://storage.example.com/player.png");
    });

    it("uses preferType for image extension", async () => {
      (storageHelpers.getDownloadURL as Mock).mockResolvedValue(
        "https://storage.example.com/player.gif",
      );

      await getPlayerAssetObject({
        listenPrefix: "viken",
        player: mockPlayer,
        teamName: "Víkingur R",
        preferType: "gif",
      });

      expect(storageHelpers.getDownloadURL).toHaveBeenCalledWith(
        "viken/players/123.gif",
      );
    });

    it("handles player with no number in fallback key", async () => {
      (storageHelpers.getDownloadURL as Mock).mockRejectedValue(
        new Error("Not found"),
      );

      const playerNoNumber = { name: "Test", id: 1 };
      const result = await getPlayerAssetObject({
        listenPrefix: "viken",
        player: playerNoNumber,
        teamName: "Víkingur R",
      });

      expect(result?.key).toBe("custom-no-number-Test");
    });

    it("handles player with string number", async () => {
      (storageHelpers.getDownloadURL as Mock).mockRejectedValue(
        new Error("Not found"),
      );

      const playerStringNumber = { name: "Test", id: 1, number: "99" };
      const result = await getPlayerAssetObject({
        listenPrefix: "viken",
        player: playerStringNumber,
        teamName: "Víkingur R",
      });

      expect(result?.key).toBe("custom-99-Test");
      expect(result?.number).toBe("99");
    });
  });

  describe("getMOTMAsset", () => {
    const mockPlayer = {
      name: "Man of Match",
      id: 7,
      number: 7,
    };

    it("returns MOTM asset type with fagn extension preference", async () => {
      (storageHelpers.getDownloadURL as Mock).mockResolvedValue(
        "https://storage.example.com/player-fagn.png",
      );

      const result = await getMOTMAsset({
        listenPrefix: "viken",
        player: mockPlayer,
        teamName: "Víkingur R",
      });

      expect(result?.type).toBe(assetTypes.MOTM);
      expect(result?.originalAssetType).toBe(assetTypes.PLAYER);
      expect(storageHelpers.getDownloadURL).toHaveBeenCalledWith(
        "viken/players/7-fagn.png",
      );
    });

    it("returns null when player asset is null", async () => {
      const result = await getMOTMAsset({
        listenPrefix: "viken",
        player: { name: "", id: undefined },
        teamName: "Víkingur R",
      });

      expect(result).toBeNull();
    });

    it("preserves all player info in MOTM asset", async () => {
      (storageHelpers.getDownloadURL as Mock).mockResolvedValue(
        "https://storage.example.com/player-fagn.png",
      );

      const result = await getMOTMAsset({
        listenPrefix: "viken",
        player: mockPlayer,
        teamName: "Víkingur R",
      });

      expect(result).toMatchObject({
        name: "Man of Match",
        number: 7,
        teamName: "Víkingur R",
      });
    });

    it("falls back correctly when fagn image not found", async () => {
      (storageHelpers.getDownloadURL as Mock)
        .mockRejectedValueOnce(new Error("Not found"))
        .mockResolvedValueOnce("https://storage.example.com/player.png");

      const result = await getMOTMAsset({
        listenPrefix: "viken",
        player: mockPlayer,
        teamName: "Víkingur R",
      });

      expect(result?.type).toBe(assetTypes.MOTM);
      expect(result?.originalAssetType).toBe(assetTypes.PLAYER);
    });

    it("handles NO_IMAGE_PLAYER fallback", async () => {
      (storageHelpers.getDownloadURL as Mock).mockRejectedValue(
        new Error("Not found"),
      );

      const result = await getMOTMAsset({
        listenPrefix: "viken",
        player: mockPlayer,
        teamName: "Víkingur R",
      });

      expect(result?.type).toBe(assetTypes.MOTM);
      expect(result?.originalAssetType).toBe(assetTypes.NO_IMAGE_PLAYER);
    });
  });
});
