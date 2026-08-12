import React, { useMemo } from "react";

import { DEFAULT_THEME, THUMB_VP, getBackground } from "../../constants";
import { useView } from "../../contexts/FirebaseStateContext";
import { resolveTheme } from "../../hooks/useThemeCssVars";
import GoalScorerReveal from "./GoalScorerReveal";

// Cached canvas for text measurement performance
let cachedCanvas: HTMLCanvasElement | null = null;

const getTextWidth = (text: string, font: string): number => {
  // re-use canvas object for better performance
  if (!cachedCanvas) {
    cachedCanvas = document.createElement("canvas");
  }
  const context: CanvasRenderingContext2D | null =
    cachedCanvas.getContext("2d");
  if (!context) return 0;
  context.font = font;
  const metrics: TextMetrics = context.measureText(text);
  return metrics.width;
};

const getMaxFontSize = (
  text: string,
  width: number,
  max: number,
  fontFamily: string,
): number => {
  let regular = max;
  while (
    regular > 5 &&
    getTextWidth(text.replace(" ", "_"), `${regular}px ${fontFamily}`) >
      width - 20
  ) {
    regular -= 1;
  }
  return regular;
};

interface PlayerAsset {
  key: string;
  name?: string;
  number?: number | string;
  role?: string;
  isGoalCelebration?: boolean;
}

interface Overlay {
  text: string;
  blink?: boolean;
  effect?: string;
}

interface OwnProps {
  thumbnail?: boolean;
  asset: PlayerAsset;
  children?: React.ReactNode;
  className?: string;
  widthMultiplier?: number;
  overlay?: Overlay;
  includeBackground?: boolean;
}

type Props = OwnProps;

const PlayerCard = (props: Props): React.JSX.Element => {
  const {
    thumbnail = false,
    asset,
    children,
    className = "",
    overlay = { text: "", blink: false },
    includeBackground = true,
    widthMultiplier = 1,
  } = props;

  const {
    view: {
      vp,
      background,
      theme,
      themePreset,
      customPresets,
      showGoalscorerName,
      showGoalscorerNumber,
    },
  } = useView();
  const width = vp.style.width;

  const playerNameFontFamily =
    resolveTheme(themePreset, theme, customPresets).playerNameFontFamily ||
    DEFAULT_THEME.playerNameFontFamily;

  const fontSizes = useMemo(() => {
    const name = asset.name || "";
    return {
      thumbnail: getMaxFontSize(
        name,
        THUMB_VP.width * widthMultiplier,
        Math.floor(width / 14),
        playerNameFontFamily,
      ),
      regular: getMaxFontSize(
        name,
        width * widthMultiplier,
        Math.floor(width / 5),
        playerNameFontFamily,
      ),
    };
  }, [asset.name, widthMultiplier, width, playerNameFontFamily]);

  const nameStyle = {
    fontSize: `${thumbnail ? fontSizes.thumbnail : fontSizes.regular}px`,
  };
  const style: React.CSSProperties = includeBackground
    ? (getBackground(background) as React.CSSProperties)
    : {};
  const isGoalCelebration = asset.isGoalCelebration === true;

  const nameNumberElement = (
    <>
      {(!isGoalCelebration || showGoalscorerNumber !== false) && (
        <span className="asset-player-number">
          {asset.number || (asset.role && asset.role[0])}
        </span>
      )}
      {(!isGoalCelebration || showGoalscorerName !== false) && (
        <span className="asset-player-name" style={nameStyle}>
          {asset.name}
        </span>
      )}
    </>
  );

  if (isGoalCelebration && !thumbnail) {
    return (
      <div
        className={`asset-player-icon ${String(className)}`}
        key={asset.key}
        style={style}
      >
        <GoalScorerReveal
          showNameNumber={
            showGoalscorerName !== false || showGoalscorerNumber !== false
          }
          nameNumberElement={nameNumberElement}
        >
          {children}
        </GoalScorerReveal>
      </div>
    );
  }

  return (
    <div
      className={`asset-player-icon ${String(className)}`}
      key={asset.key}
      style={style}
    >
      {children}
      <span
        className={`player-card-overlay ${
          overlay.blink && overlay.effect ? String(overlay.effect) : ""
        }`}
      >
        {overlay.text}
      </span>
      {nameNumberElement}
    </div>
  );
};

export default PlayerCard;
