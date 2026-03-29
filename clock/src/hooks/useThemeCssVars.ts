import { useMemo } from "react";
import type { ThemeConfig, CustomPreset } from "../types";
import { DEFAULT_THEME, THEME_PRESETS } from "../constants";

/**
 * Maps a ThemeConfig to a CSS custom properties object.
 * These variables are applied to the `.App` container so all
 * display CSS can reference them via `var(--theme-*)`.
 */
export const themeToCssVars = (theme: ThemeConfig): Record<string, string> => ({
  // Score boxes
  "--theme-score-bg": theme.scoreBoxBg,
  "--theme-score-color": theme.scoreBoxColor,
  "--theme-score-border": theme.scoreBoxBorder,
  "--theme-score-font-size": theme.scoreBoxFontSize,
  "--theme-score-font-family": theme.scoreBoxFontFamily,
  "--theme-score-stroke": theme.scoreBoxStroke,
  "--theme-score-top": theme.scoreTop,
  "--theme-score-height": theme.scoreHeight,
  "--theme-score-width": theme.scoreWidth,

  // Clock
  "--theme-clock-bg": theme.clockBg,
  "--theme-clock-color": theme.clockColor,
  "--theme-clock-border": theme.clockBorder,
  "--theme-clock-font-size-min": theme.clockFontSizeMin,
  "--theme-clock-font-size-max": theme.clockFontSizeMax,
  "--theme-clock-font-family": theme.clockFontFamily,
  "--theme-clock-stroke": theme.clockStroke,
  "--theme-clock-top": theme.clockTop,
  "--theme-clock-left": theme.clockLeft,
  "--theme-clock-width": theme.clockWidth,
  "--theme-clock-height": theme.clockHeight,

  // Logos
  "--theme-logo-top": theme.logoTop,
  "--theme-logo-height": theme.logoHeight,
  "--theme-logo-width": theme.logoWidth,

  // Injury time
  "--theme-injury-color": theme.injuryTimeColor,
  "--theme-injury-font-size": theme.injuryTimeFontSize,
  "--theme-injury-top": theme.injuryTimeTop,
  "--theme-injury-left": theme.injuryTimeLeft,
  "--theme-injury-stroke": theme.injuryTimeStroke,

  // Team name
  "--theme-team-name-color": theme.teamNameColor,
  "--theme-team-name-font-family": theme.teamNameFontFamily,

  // Red cards
  "--theme-red-card-color": theme.redCardColor,

  // Penalty boxes
  "--theme-penalty-bg": theme.penaltyBg,
  "--theme-penalty-color": theme.penaltyColor,
  "--theme-penalty-border": theme.penaltyBorder,

  // Timeout dots
  "--theme-timeout-color": theme.timeoutColor,

  // Idle screen
  "--theme-idle-text-color": theme.idleTextColor,
  "--theme-idle-text-font-size": theme.idleTextFontSize,
  "--theme-idle-logo-top": theme.idleLogoTop,
  "--theme-idle-logo-left": theme.idleLogoLeft,
  "--theme-idle-logo-width": theme.idleLogoWidth,
  "--theme-idle-text-top": theme.idleTextTop,

  // Ad image
  "--theme-ad-top": theme.adTop,
  "--theme-ad-left": theme.adLeft,
  "--theme-ad-width": theme.adWidth,
  "--theme-ad-height": theme.adHeight,

  // Background image
  ...(theme.backgroundImage
    ? { "--theme-background-image": `url(${theme.backgroundImage})` }
    : {}),
});

/**
 * Looks up a preset by name, checking custom presets first, then built-in.
 */
export function lookupPreset(
  presetName: string | undefined,
  customPresets?: Record<string, CustomPreset>,
): ThemeConfig {
  if (!presetName) return DEFAULT_THEME;

  // Check custom presets (keyed by ID, match by name or ID)
  if (customPresets) {
    // Direct ID match
    const byId = customPresets[presetName];
    if (byId) return byId.theme;

    // Name match
    for (const preset of Object.values(customPresets)) {
      if (preset.name === presetName) return preset.theme;
    }
  }

  // Built-in preset
  const builtIn = THEME_PRESETS[presetName];
  if (builtIn) return builtIn;

  return DEFAULT_THEME;
}

/**
 * Resolves the effective theme from a preset name and/or custom overrides.
 * Returns a CSS properties object to spread onto the `.App` container.
 */
export function useThemeCssVars(
  themePreset?: string,
  themeOverrides?: ThemeConfig,
  customPresets?: Record<string, CustomPreset>,
): React.CSSProperties {
  return useMemo(() => {
    const base = lookupPreset(themePreset, customPresets);
    const effective = themeOverrides ? { ...base, ...themeOverrides } : base;
    return themeToCssVars(effective) as unknown as React.CSSProperties;
  }, [themePreset, themeOverrides, customPresets]);
}

/**
 * Resolves the effective ThemeConfig object (preset + overrides merged).
 */
export function resolveTheme(
  themePreset?: string,
  themeOverrides?: ThemeConfig,
  customPresets?: Record<string, CustomPreset>,
): ThemeConfig {
  const base = lookupPreset(themePreset, customPresets);
  return themeOverrides ? { ...base, ...themeOverrides } : base;
}
