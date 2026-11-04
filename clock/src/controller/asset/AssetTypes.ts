import type { Asset } from "../../types";

export default {
  URL: "URL",
  PLAYER: "PLAYER",
  NO_IMAGE_PLAYER: "NO_IMAGE_PLAYER",
  MOTM: "MOTM",
  IMAGE: "IMAGE",
  VIDEO: "VIDEO",
  SUB: "SUB",
} as const satisfies { [Type in Asset["type"]]: Type };
